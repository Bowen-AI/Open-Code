import * as path from "path";
import { workspace } from "vscode";

/**
 * Stable id for memory partitioning (per project / workspace).
 */
export function getProjectId(): string {
  const f = workspace.workspaceFolders?.[0];
  if (f) {
    return `ws:${f.uri.fsPath.replace(/\\/g, "/")}`;
  }
  return "ws:default";
}

export function getSessionId(): string {
  return `sess:${process.pid}`; // refined per Autodrive thread later
}
