/**
 * Open-Cursor VSCode Extension – main entry point.
 *
 * Registers commands, initialises sub-systems (memory, credentials, AI model)
 * and wires them together via the Agent.
 */

import * as vscode from 'vscode';
import { MemoryManager } from './memory/MemoryManager';
import { CredentialManager } from './credentials/CredentialManager';
import { PreferenceManager } from './credentials/PreferenceManager';
import { ModelProviderFactory } from './ai/ModelProviderFactory';
import { Agent } from './agent/Agent';
import { AgentPanel } from './ui/AgentPanel';
import { MemoryView } from './ui/MemoryView';

let agent: Agent | undefined;
let memoryManager: MemoryManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const credentialManager = new CredentialManager(context.secrets);
  const preferenceManager = new PreferenceManager(context);

  memoryManager = new MemoryManager({
    context,
    workspaceRoot: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  });

  const modelProvider = ModelProviderFactory.create(
    vscode.workspace.getConfiguration('openCursor'),
    credentialManager,
  );

  agent = new Agent({ memoryManager, modelProvider, preferenceManager });

  // ── Commands ────────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('openCursor.openAgentPanel', () => {
      AgentPanel.createOrShow(context.extensionUri, agent!);
    }),

    vscode.commands.registerCommand('openCursor.openMemoryView', () => {
      MemoryView.createOrShow(context.extensionUri, memoryManager!);
    }),

    vscode.commands.registerCommand('openCursor.manageCredentials', async () => {
      await credentialManager.promptManage();
    }),

    vscode.commands.registerCommand('openCursor.clearMemory', async () => {
      const confirmed = await vscode.window.showWarningMessage(
        'This will permanently delete all Open-Cursor memories. Continue?',
        { modal: true },
        'Delete All',
      );
      if (confirmed === 'Delete All') {
        await memoryManager!.clearAll();
        vscode.window.showInformationMessage('Open-Cursor: All memories cleared.');
      }
    }),
  );

  vscode.window.showInformationMessage('Open-Cursor is active.');
}

export function deactivate(): void {
  memoryManager = undefined;
  agent = undefined;
}
