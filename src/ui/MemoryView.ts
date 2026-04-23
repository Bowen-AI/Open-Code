/**
 * MemoryView – a VSCode Webview panel for browsing and managing memories.
 */

import * as vscode from 'vscode';
import { MemoryManager } from '../memory/MemoryManager';
import { MemoryEntry, MemoryScope } from '../memory/types';

export class MemoryView {
  public static currentPanel: MemoryView | undefined;
  private static readonly viewType = 'openCursor.memoryView';

  private readonly panel: vscode.WebviewPanel;
  private readonly memoryManager: MemoryManager;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, memoryManager: MemoryManager) {
    this.panel = panel;
    this.memoryManager = memoryManager;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      async (message: { type: string; id?: string; query?: string; scope?: string }) => {
        if (message.type === 'load') {
          await this.sendEntries(message.query, message.scope as MemoryScope | undefined);
        } else if (message.type === 'delete' && message.id) {
          await this.memoryManager.delete(message.id);
          await this.sendEntries();
        }
      },
      null,
      this.disposables,
    );

    this.panel.webview.html = this.getHtml();
  }

  static createOrShow(extensionUri: vscode.Uri, memoryManager: MemoryManager): void {
    if (MemoryView.currentPanel) {
      MemoryView.currentPanel.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      MemoryView.viewType,
      'Open-Cursor Memory',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    MemoryView.currentPanel = new MemoryView(panel, memoryManager);
  }

  private async sendEntries(search?: string, scope?: MemoryScope): Promise<void> {
    const entries: MemoryEntry[] = await this.memoryManager.query({
      search,
      scope,
      limit: 200,
    });
    await this.panel.webview.postMessage({ type: 'entries', entries });
  }

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Open-Cursor Memory</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100vh;
  }
  h2 { font-size: 1.1em; }
  .controls { display: flex; gap: 6px; }
  input, select {
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: inherit;
  }
  input { flex: 1; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 4px;
    padding: 4px 12px; cursor: pointer;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
  .entry {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px; padding: 8px 10px;
  }
  .entry-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tag {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 3px; padding: 1px 5px; font-size: 0.75em;
  }
  .scope { font-size: 0.75em; color: var(--vscode-descriptionForeground); }
  .content { margin-top: 4px; white-space: pre-wrap; word-break: break-word; line-height: 1.4; }
  .del-btn {
    background: transparent;
    color: var(--vscode-errorForeground);
    border: none; cursor: pointer; font-size: 0.85em; padding: 0;
  }
  .empty { color: var(--vscode-descriptionForeground); text-align: center; margin-top: 40px; }
</style>
</head>
<body>
<h2>🧠 Open-Cursor Memory</h2>
<div class="controls">
  <input id="search" type="text" placeholder="Search memories…">
  <select id="scope-filter">
    <option value="">All scopes</option>
    <option value="repo">Repo</option>
    <option value="host">Host</option>
  </select>
  <button id="reload-btn">Search</button>
</div>
<div id="list"><div class="empty">Loading…</div></div>
<script>
  const vscode = acquireVsCodeApi();
  const listEl = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const scopeEl = document.getElementById('scope-filter');

  function load() {
    vscode.postMessage({ type: 'load', query: searchEl.value.trim() || undefined, scope: scopeEl.value || undefined });
  }

  document.getElementById('reload-btn').addEventListener('click', load);
  searchEl.addEventListener('keydown', function(e) { if (e.key === 'Enter') load(); });
  scopeEl.addEventListener('change', load);

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.type !== 'entries') return;
    const entries = msg.entries;
    if (!entries || entries.length === 0) {
      listEl.innerHTML = '<div class="empty">No memories found.</div>';
      return;
    }
    listEl.innerHTML = '';
    entries.forEach(function(e) {
      const div = document.createElement('div');
      div.className = 'entry';
      const tagsHtml = (e.tags || []).map(function(t) { return '<span class="tag">' + t + '</span>'; }).join('');
      div.innerHTML =
        '<div class="entry-header">' +
          '<div class="tags">' + tagsHtml + '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="scope">' + e.scope + '</span>' +
            '<button class="del-btn" data-id="' + e.id + '" title="Delete">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="content">' + e.content.slice(0, 400) + (e.content.length > 400 ? '…' : '') + '</div>';
      listEl.appendChild(div);
    });
    listEl.querySelectorAll('.del-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        vscode.postMessage({ type: 'delete', id: btn.dataset.id });
      });
    });
  });

  load();
</script>
</body>
</html>`;
  }

  dispose(): void {
    MemoryView.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
