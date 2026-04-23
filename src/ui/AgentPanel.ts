/**
 * AgentPanel – a VSCode Webview panel that provides the chat / inline-edit UI.
 *
 * Users can type messages, see the agent's replies, and have memories
 * automatically saved when the agent emits {{SAVE_MEMORY ...}} directives.
 */

import * as vscode from 'vscode';
import { Agent } from '../agent/Agent';

export class AgentPanel {
  public static currentPanel: AgentPanel | undefined;
  private static readonly viewType = 'openCursor.agentPanel';

  private readonly panel: vscode.WebviewPanel;
  private readonly agent: Agent;
  private disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, agent: Agent) {
    this.panel = panel;
    this.agent = agent;

    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message: { type: string; text?: string; tags?: string; scope?: string }) => {
        if (message.type === 'chat' && message.text) {
          await this.handleChat(message.text);
        } else if (
          message.type === 'saveMemory' &&
          message.text &&
          message.scope
        ) {
          const tags = (message.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean);
          await this.agent.saveMemory(
            message.text,
            tags,
            message.scope as 'repo' | 'host',
          );
          await this.panel.webview.postMessage({
            type: 'memorySaved',
            text: message.text,
          });
        }
      },
      null,
      this.disposables,
    );
  }

  static createOrShow(extensionUri: vscode.Uri, agent: Agent): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AgentPanel.currentPanel) {
      AgentPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      AgentPanel.viewType,
      'Open-Cursor Agent',
      column ?? vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true },
    );

    AgentPanel.currentPanel = new AgentPanel(panel, agent);
  }

  private async handleChat(userMessage: string): Promise<void> {
    await this.panel.webview.postMessage({ type: 'thinking' });

    try {
      const editor = vscode.window.activeTextEditor;
      const codeContext = editor?.document.getText(editor.selection) || undefined;
      const filePath = editor?.document.uri.fsPath;

      const response = await this.agent.chat({
        userMessage,
        codeContext,
        filePath,
      });

      await this.panel.webview.postMessage({
        type: 'reply',
        text: response.reply,
        savedMemories: response.savedMemories,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.panel.webview.postMessage({ type: 'error', text: message });
    }
  }

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Open-Cursor Agent</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    display: flex;
    flex-direction: column;
    height: 100vh;
    padding: 8px;
    gap: 8px;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px;
  }
  .message {
    padding: 8px 12px;
    border-radius: 6px;
    max-width: 90%;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
  }
  .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; }
  .assistant { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
  .system { color: var(--vscode-descriptionForeground); font-style: italic; align-self: center; font-size: 0.85em; }
  .memory-badge {
    display: inline-block;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 0.75em;
    margin-top: 4px;
  }
  #input-row {
    display: flex;
    gap: 6px;
  }
  #user-input {
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 4px;
    padding: 8px;
    font-family: inherit;
    font-size: inherit;
    resize: vertical;
    min-height: 36px;
  }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    padding: 8px 14px;
    cursor: pointer;
    font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
</style>
</head>
<body>
<div id="messages">
  <div class="message system">Open-Cursor Agent is ready. Ask anything about your code.</div>
</div>
<div id="input-row">
  <textarea id="user-input" rows="2" placeholder="Ask the agent…"></textarea>
  <button id="send-btn">Send</button>
</div>
<script>
  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById('messages');
  const inputEl = document.getElementById('user-input');
  const sendBtn = document.getElementById('send-btn');

  function addMessage(role, text, extras) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    div.textContent = text;
    if (extras && extras.savedMemories && extras.savedMemories.length > 0) {
      extras.savedMemories.forEach(function(m) {
        const badge = document.createElement('div');
        badge.className = 'memory-badge';
        badge.textContent = '🧠 Memory saved: ' + m.slice(0, 60) + (m.length > 60 ? '…' : '');
        div.appendChild(badge);
      });
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    addMessage('user', text);
    inputEl.value = '';
    vscode.postMessage({ type: 'chat', text });
  }

  sendBtn.addEventListener('click', send);
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (msg.type === 'thinking') {
      addMessage('system', 'Thinking…');
    } else if (msg.type === 'reply') {
      const lastSystem = [...messagesEl.querySelectorAll('.system')].pop();
      if (lastSystem && lastSystem.textContent === 'Thinking…') lastSystem.remove();
      addMessage('assistant', msg.text, msg);
    } else if (msg.type === 'error') {
      addMessage('system', '⚠ ' + msg.text);
    } else if (msg.type === 'memorySaved') {
      addMessage('system', '🧠 Memory saved.');
    }
  });
</script>
</body>
</html>`;
  }

  dispose(): void {
    AgentPanel.currentPanel = undefined;
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
