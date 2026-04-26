import * as vscode from "vscode";
import { HttpMemoryClient } from "../memoryClient";
import { MemoryKind } from "../types";
import { GemmaLocalProvider } from "../providers/gemmaLocal";
import { Discriminator } from "../mindset/discriminator";
import { getProjectId, getSessionId } from "../util/projectId";

/**
 * Autodrive: webview “chat” with the agent — multi-turn, memory-backed, with discriminator on each user message.
 */
export class AutodrivePanel {
  public static current: AutodrivePanel | undefined;
  public readonly panel: vscode.WebviewPanel;
  private currentAbort: AbortController | undefined;

  private constructor(
    private readonly mem: HttpMemoryClient,
    private readonly llm: GemmaLocalProvider,
    private readonly disc: Discriminator
  ) {
    this.panel = vscode.window.createWebviewPanel(
      "openCodeAutodrive",
      "Open Code — Autodrive",
      vscode.ViewColumn.Two,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage(async (m) => {
      if (m.type === "stop") {
        this.currentAbort?.abort();
        return;
      }
      if (m.type === "user") {
        if (this.currentAbort) {
          this.panel.webview.postMessage({ type: "status", text: "Autodrive is already running." });
          return;
        }
        const text = String(m.text ?? "");
        const projectId = getProjectId();
        const sessionId = getSessionId();
        const abort = new AbortController();
        this.currentAbort = abort;
        this.panel.webview.postMessage({ type: "status", text: "Thinking..." });
        await this.mem.appendRaw({
          projectId,
          sessionId,
          kind: "message" as MemoryKind,
          payload: { role: "user", text }
        });
        await this.disc.onPrompt(text, "prompt");
        let reply: string;
        try {
          reply = await this.llm.complete(
            [
              { role: "system", content: "You are Autodrive: short, helpful coding copilot. Be concise." },
              { role: "user", content: text }
            ],
            { signal: abort.signal }
          );
        } catch (e) {
          reply = abort.signal.aborted
            ? "Autodrive stopped."
            : `Local model not online: ${(e as Error).message}\n(Configure openCode.gemmaBaseUrl, e.g. Ollama with Gemma.)`;
        } finally {
          this.currentAbort = undefined;
          this.panel.webview.postMessage({ type: "status", text: "" });
        }
        await this.mem.appendRaw({
          projectId,
          sessionId,
          kind: "message" as MemoryKind,
          payload: { role: "assistant", text: reply }
        });
        this.panel.webview.postMessage({ type: "assistant", text: reply });
      }
    });
    this.panel.onDidDispose(() => {
      AutodrivePanel.current = undefined;
    });
  }

  static show(
    mem: HttpMemoryClient,
    llm: GemmaLocalProvider,
    disc: Discriminator
  ) {
    if (AutodrivePanel.current) {
      AutodrivePanel.current.panel.reveal();
      return;
    }
    AutodrivePanel.current = new AutodrivePanel(mem, llm, disc);
  }

  private html() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); }
    #log { min-height: 200px; white-space: pre-wrap; }
    #row { display: flex; gap: 8px; }
    #in { flex: 1; }
    #status { opacity: 0.8; min-height: 1.4em; }
  </style>
</head>
<body>
  <p><strong>Autodrive</strong> — multi-turn session (local Gemma if running).</p>
  <div id="log"></div>
  <div id="status"></div>
  <div id="row">
    <input id="in" type="text" placeholder="Message…" />
    <button id="go">Send</button>
    <button id="stop">Stop</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById("log");
    const inp = document.getElementById("in");
    const status = document.getElementById("status");
    document.getElementById("go").onclick = () => send();
    document.getElementById("stop").onclick = () => vscode.postMessage({ type: "stop" });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    function send() {
      const t = inp.value.trim();
      if (!t) return;
      log.textContent += "\\n\\n> " + t;
      inp.value = "";
      vscode.postMessage({ type: "user", text: t });
    }
    window.addEventListener("message", (e) => {
      if (e.data.type === "assistant")
        log.textContent += "\\n\\n" + e.data.text;
      if (e.data.type === "status")
        status.textContent = e.data.text || "";
    });
  </script>
</body>
</html>`;
  }
}
