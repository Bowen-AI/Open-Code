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
      if (m.type === "user") {
        const text = String(m.text ?? "");
        const projectId = getProjectId();
        const sessionId = getSessionId();
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
            { model: "gemma2" }
          );
        } catch (e) {
          reply = `Local model not online: ${(e as Error).message}\n(Configure openCode.gemmaBaseUrl, e.g. Ollama with Gemma.)`;
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
  </style>
</head>
<body>
  <p><strong>Autodrive</strong> — multi-turn session (local Gemma if running).</p>
  <div id="log"></div>
  <div id="row">
    <input id="in" type="text" placeholder="Message…" />
    <button id="go">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const log = document.getElementById("log");
    const inp = document.getElementById("in");
    document.getElementById("go").onclick = () => send();
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
    });
  </script>
</body>
</html>`;
  }
}
