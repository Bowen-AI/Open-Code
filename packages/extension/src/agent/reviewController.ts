import * as vscode from "vscode";
import { ProposedChange } from "../types";
import { Discriminator } from "../mindset/discriminator";
import { HttpMemoryClient } from "../memoryClient";
import { MemoryKind } from "../types";
import { getProjectId, getSessionId } from "../util/projectId";
import { GemmaLocalProvider } from "../providers/gemmaLocal";
import { computeLineHunks, detectLineEnding, TextHunk } from "./diffHunks";
import { stripMaybeFences } from "./textSanitizer";

let lastProposed: ProposedChange | undefined;
let lastApplied: { uri: string; beforeText: string; afterText: string; changeId: string } | undefined;

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
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Open Code: agent", cancellable: true },
    async (progress, token) => {
      const abort = new AbortController();
      token.onCancellationRequested(() => abort.abort());
      progress.report({ message: "Calling local model…" });
      let newText: string;
      try {
        newText = await llm.complete(
          [
            { role: "system", content: "You are a careful coding agent." },
            { role: "user", content: prompt }
          ],
          { signal: abort.signal }
        );
      } catch (e) {
        if (token.isCancellationRequested) {
          void vscode.window.showInformationMessage("Open Code: agent run cancelled.");
          return;
        }
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
      const hunks = computeLineHunks(oldText, prop.newText);
      prop.hunks = hunks.map((h) => ({
        id: h.id,
        oldStartLine: h.oldStartLine,
        oldLineCount: h.oldLineCount,
        newStartLine: h.newStartLine,
        newLineCount: h.newLineCount,
        summary: h.summary
      }));
      lastProposed = prop;
      await mem.appendRaw({
        projectId,
        sessionId,
        kind: "diff" as MemoryKind,
        payload: {
          uri: prop.uri,
          changeId: prop.id,
          sizeOld: oldText.length,
          sizeNew: prop.newText.length,
          hunks: prop.hunks
        }
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
      if (hunks.length === 0) {
        await mem.appendRaw({
          projectId,
          sessionId,
          kind: "user_action" as MemoryKind,
          payload: { action: "noOpEdit", changeId: prop.id }
        });
        void vscode.window.showInformationMessage("Open Code: proposal has no text changes.");
        return;
      }
      const pick = await vscode.window.showInformationMessage(
        `Open Code: ${hunks.length} hunks proposed.`,
        "Accept All",
        "Choose Hunks",
        "Reject"
      );
      if (pick === "Accept All" || pick === "Choose Hunks") {
        const selected =
          pick === "Accept All" ? hunks : await chooseHunks(hunks);
        if (!selected || selected.length === 0) {
          await mem.appendRaw({
            projectId,
            sessionId,
            kind: "user_action" as MemoryKind,
            payload: { action: "rejectEdit", changeId: prop.id, rejectedHunkIds: hunks.map((h) => h.id) }
          });
          return;
        }
        if (doc.getText() !== oldText) {
          await mem.appendRaw({
            projectId,
            sessionId,
            kind: "user_action" as MemoryKind,
            payload: { action: "staleEditBlocked", changeId: prop.id }
          });
          void vscode.window.showWarningMessage(
            "Open Code: file changed since proposal was generated. Re-run the agent before applying hunks."
          );
          return;
        }
        const beforeApply = doc.getText();
        const ok = await applyHunks(doc, selected, oldText);
        const afterApply = doc.getText();
        if (ok) {
          lastApplied = {
            uri: doc.uri.toString(),
            beforeText: beforeApply,
            afterText: afterApply,
            changeId: prop.id
          };
        }
        prop.acceptedHunkIds = selected.map((h) => h.id);
        await mem.appendRaw({
          projectId,
          sessionId,
          kind: "user_action" as MemoryKind,
          payload: {
            action: "acceptHunks",
            changeId: prop.id,
            applyOk: ok,
            acceptedHunkIds: prop.acceptedHunkIds,
            rejectedHunkIds: hunks.filter((h) => !prop.acceptedHunkIds?.includes(h.id)).map((h) => h.id)
          }
        });
        void vscode.window.showInformationMessage(
          `Open Code: applied ${selected.length}/${hunks.length} hunks (undo: Cmd/Ctrl+Z).`
        );
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

async function chooseHunks(hunks: TextHunk[]): Promise<TextHunk[] | undefined> {
  const items = hunks.map((h) => ({
    label: h.id,
    description: h.summary,
    detail: previewHunk(h),
    hunk: h
  }));
  const picked = await vscode.window.showQuickPick(items, {
    canPickMany: true,
    placeHolder: "Select the Open Code hunks to apply"
  });
  return picked?.map((p) => p.hunk);
}

async function applyHunks(
  doc: vscode.TextDocument,
  hunks: TextHunk[],
  originalText: string
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();
  const eol = detectLineEnding(originalText);
  const ordered = [...hunks].sort((a, b) => b.oldStartLine - a.oldStartLine);
  for (const hunk of ordered) {
    edit.replace(doc.uri, rangeForHunk(doc, hunk), replacementForHunk(doc, hunk, eol));
  }
  return vscode.workspace.applyEdit(edit);
}

function rangeForHunk(doc: vscode.TextDocument, hunk: TextHunk): vscode.Range {
  if (hunk.oldLineCount === 0) {
    const offset = hunk.oldStartLine >= doc.lineCount
      ? doc.getText().length
      : doc.offsetAt(new vscode.Position(hunk.oldStartLine, 0));
    const pos = doc.positionAt(offset);
    return new vscode.Range(pos, pos);
  }
  const startLine = Math.min(hunk.oldStartLine, Math.max(doc.lineCount - 1, 0));
  const endLine = Math.min(hunk.oldStartLine + hunk.oldLineCount, doc.lineCount);
  const start = new vscode.Position(startLine, 0);
  const end = endLine >= doc.lineCount
    ? doc.positionAt(doc.getText().length)
    : new vscode.Position(endLine, 0);
  return new vscode.Range(start, end);
}

function replacementForHunk(doc: vscode.TextDocument, hunk: TextHunk, eol: string): string {
  if (hunk.newLineCount === 0) {
    return "";
  }
  const text = hunk.newText;
  const current = doc.getText();
  if (
    hunk.oldLineCount === 0 &&
    hunk.oldStartLine >= doc.lineCount &&
    current.length > 0 &&
    !current.endsWith("\n") &&
    !current.endsWith("\r")
  ) {
    return `${eol}${text}`;
  }
  const followedByExistingLine = hunk.oldStartLine + hunk.oldLineCount < doc.lineCount;
  if (followedByExistingLine && !text.endsWith("\n") && !text.endsWith("\r")) {
    return `${text}${eol}`;
  }
  return text;
}

function previewHunk(hunk: TextHunk): string {
  const removed = hunk.oldText ? `- ${hunk.oldText.split(/\r\n|\r|\n/)[0]}` : "";
  const added = hunk.newText ? `+ ${hunk.newText.split(/\r\n|\r|\n/)[0]}` : "";
  return [removed, added].filter(Boolean).join(" / ").slice(0, 240);
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

export async function revertLastChange(mem?: HttpMemoryClient) {
  const applied = lastApplied;
  if (!applied) {
    void vscode.window.showInformationMessage("Open Code: no applied change to revert");
    return;
  }
  const uri = vscode.Uri.parse(applied.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  if (doc.getText() !== applied.afterText) {
    void vscode.window.showWarningMessage(
      "Open Code: latest change cannot be reverted because the file changed after apply."
    );
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
  edit.replace(uri, range, applied.beforeText);
  const ok = await vscode.workspace.applyEdit(edit);
  if (mem) {
    await mem.appendRaw({
      projectId: getProjectId(),
      sessionId: getSessionId(),
      kind: "user_action" as MemoryKind,
      payload: { action: "revertLastChange", changeId: applied.changeId, applyOk: ok }
    });
  }
  if (ok) {
    lastApplied = undefined;
  }
  void vscode.window.showInformationMessage(ok ? "Open Code: reverted latest change." : "Open Code: revert failed.");
}
