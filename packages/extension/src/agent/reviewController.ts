import * as vscode from "vscode";
import { ProposedChange } from "../types";
import { Discriminator } from "../mindset/discriminator";
import { HttpMemoryClient } from "../memoryClient";
import { MemoryKind } from "../types";
import { getProjectId, getSessionId } from "../util/projectId";
import { GemmaLocalProvider } from "../providers/gemmaLocal";

let lastProposed: ProposedChange | undefined;

/**
 * Hunk-style review: show diff in the built-in diff editor; user accepts to apply, or reject.
 * Records raw memory + action log; runs discriminator on proposed edits.
 */
export async function runAgentOnActiveEditor(
  mem: HttpMemoryClient,
  disc: Discriminator,
  llm: GemmaLocalProvider
): Promise<void> {
  const ed = vscode.window.activeTextEditor;
  if (!ed) {
    void vscode.window.showWarningMessage("Open Code: no active editor");
    return;
  }
  const doc = ed.document;
  const oldText = doc.getText();
  const projectId = getProjectId();
  const sessionId = getSessionId();
  const prompt = `Rewrite the following file content for clarity and small improvements. Output only the new file text, no markdown fences.\n\n---\n${oldText.slice(0, 32_000)}`;
  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Open Code: agent" },
    async (progress) => {
      progress.report({ message: "Calling local model…" });
      let newText: string;
      try {
        newText = await llm.complete(
          [
            { role: "system", content: "You are a careful coding agent." },
            { role: "user", content: prompt }
          ],
          { model: "gemma2" }
        );
      } catch (e) {
        // Offline LLM: demo proposal
        newText = `// (Demo) local model not reachable. Original:\n// ${(e as Error).message}\n\n${oldText}\n// --- end\n`;
        void vscode.window.showWarningMessage(
          "Open Code: LLM not reachable; showing diff preview with a stub."
        );
      }
      const prop: ProposedChange = {
        id: `chg_${Date.now()}`,
        uri: doc.uri.toString(),
        oldText,
        newText: stripMaybeFences(newText)
      };
      lastProposed = prop;
      await mem.appendRaw({
        projectId,
        sessionId,
        kind: "diff" as MemoryKind,
        payload: { uri: prop.uri, changeId: prop.id, sizeOld: oldText.length, sizeNew: prop.newText.length }
      });
      await disc.onProposedEdits(`file ${doc.uri.path} newLength=${prop.newText.length}`, "edits");
      const odoc = { original: oldText, proposed: prop.newText };
      const leftDoc = await vscode.workspace.openTextDocument({
        language: doc.languageId,
        content: odoc.original
      });
      const rightDoc = await vscode.workspace.openTextDocument({
        language: doc.languageId,
        content: odoc.proposed
      });
      await mem.appendRaw({
        projectId,
        sessionId,
        kind: "user_action" as MemoryKind,
        payload: { action: "openDiff", changeId: prop.id }
      });
      await vscode.commands.executeCommand(
        "vscode.diff",
        leftDoc.uri,
        rightDoc.uri,
        "Open Code: review proposed"
      );
      const pick = await vscode.window.showInformationMessage(
        "Open Code: apply proposed file body?",
        "Accept",
        "Reject"
      );
      if (pick === "Accept") {
        const edit = new vscode.WorkspaceEdit();
        const full = doc.getText();
        const range = new vscode.Range(doc.positionAt(0), doc.positionAt(full.length));
        edit.replace(doc.uri, range, prop.newText);
        const ok = await vscode.workspace.applyEdit(edit);
        await mem.appendRaw({
          projectId,
          sessionId,
          kind: "user_action" as MemoryKind,
          payload: { action: "acceptEdit", changeId: prop.id, applyOk: ok }
        });
        void vscode.window.showInformationMessage("Open Code: changes applied (undo: Cmd/Ctrl+Z).");
      } else {
        await mem.appendRaw({
          projectId,
          sessionId,
          kind: "user_action" as MemoryKind,
          payload: { action: "rejectEdit", changeId: prop.id }
        });
      }
    }
  );
}

function stripMaybeFences(s: string): string {
  const t = s.trim();
  if (t.startsWith("```")) {
    const n = t.indexOf("\n");
    const rest = t.slice(n + 1);
    const end = rest.lastIndexOf("```");
    if (end > 0) {
      return rest.slice(0, end).trim();
    }
  }
  return t;
}

export function getLastProposed(): ProposedChange | undefined {
  return lastProposed;
}

export async function reviewProposed() {
  const p = lastProposed;
  if (!p) {
    void vscode.window.showInformationMessage("Open Code: no recent proposal to review");
    return;
  }
  const left = await vscode.workspace.openTextDocument({ language: "text", content: p.oldText });
  const right = await vscode.workspace.openTextDocument({ language: "text", content: p.newText });
  await vscode.commands.executeCommand(
    "vscode.diff",
    left.uri,
    right.uri,
    "Open Code: last proposal"
  );
}
