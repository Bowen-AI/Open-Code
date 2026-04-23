import * as vscode from "vscode";
import { HttpMemoryClient } from "./memoryClient";
import { getProjectId } from "./util/projectId";
import { GemmaLocalProvider } from "./providers/gemmaLocal";
import { Discriminator } from "./mindset/discriminator";
import { runAgentOnActiveEditor, reviewProposed } from "./agent/reviewController";
import { AutodrivePanel } from "./autodrive/panel";
import { registerInlineCompletion } from "./inline/completions";
import * as memoryd from "./memoryd";

let mem: HttpMemoryClient | undefined;
let disc: Discriminator | undefined;
let llm: GemmaLocalProvider | undefined;

function outputChannel() {
  return vscode.window.createOutputChannel("Open Code");
}

export async function activate(context: vscode.ExtensionContext) {
  const ch = outputChannel();
  context.subscriptions.push(ch);

  const memUrl = await memoryd.startMemoryd(context);
  if (!memUrl) {
    ch.appendLine(
      "Open Code: memoryd not started. Run `npm run build` from the repo root, or set OPEN_CODE_MEMORYD_PATH. See docs/BUILD.md."
    );
    void vscode.window.showErrorMessage(
      "Open Code: memoryd unavailable. Build with `npm run build` (see docs/BUILD.md)."
    );
  }

  if (memUrl) {
    mem = new HttpMemoryClient(memUrl);
    const ok = await mem.health();
    ch.appendLine(ok ? `Memory: ${memUrl}` : `Memory: no health at ${memUrl}`);
  } else {
    // Still wire commands; memory calls will throw — block with check in handlers
    mem = new HttpMemoryClient("http://127.0.0.1:9");
  }

  const cfg = vscode.workspace.getConfiguration("openCode");
  const base = cfg.get<string>("gemmaBaseUrl") ?? "http://127.0.0.1:11434";
  llm = new GemmaLocalProvider(base);
  disc = new Discriminator(mem, llm);

  context.subscriptions.push(registerInlineCompletion(context, llm));

  const getMem = () => {
    if (!memUrl || !mem) {
      void vscode.window.showErrorMessage("Open Code: memory not connected.");
      return undefined;
    }
    return mem;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.startAutodrive", () => {
      const m = getMem();
      if (!m || !llm || !disc) {
        return;
      }
      AutodrivePanel.show(m, llm, disc);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.runAgent", () => {
      const m = getMem();
      if (!m || !llm || !disc) {
        return;
      }
      return runAgentOnActiveEditor(m, disc, llm);
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.reviewProposed", () => reviewProposed())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.clearMemory", async () => {
      const m = getMem();
      if (!m) {
        return;
      }
      const p = getProjectId();
      const n = await m.clearProject(p);
      void vscode.window.showInformationMessage(
        `Open Code: cleared memory for project (${n.deleted} rows).`
      );
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.discriminateCommit", async () => {
      if (!getMem()) {
        return;
      }
      const ed = vscode.window.activeTextEditor;
      if (!ed) {
        void vscode.window.showInformationMessage("Open a commit message editor first (e.g. Git commit).");
        return;
      }
      if (!disc) {
        return;
      }
      const msg = ed.document.getText();
      if (!msg.trim()) {
        void vscode.window.showInformationMessage("Commit message is empty.");
        return;
      }
      await disc.onCommit(msg, "commit");
      void vscode.window.showInformationMessage("Open Code: discriminator results saved to memory.");
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("open-code.showMemory", async () => {
      const m = getMem();
      if (!m) {
        return;
      }
      const items = await m.recentRaw(getProjectId(), 30);
      ch.clear();
      ch.appendLine(JSON.stringify(items, null, 2));
      ch.show();
    })
  );
}

export function deactivate() {
  memoryd.stopMemoryd();
}
