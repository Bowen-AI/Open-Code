/**
 * CredentialManager – secure storage for developer API keys and tokens.
 *
 * Uses VSCode's SecretStorage API which maps to the OS keychain on desktop
 * (macOS Keychain, Windows Credential Manager, libsecret on Linux).
 * Credentials are NEVER written to settings files or the file system in plain text.
 */

import * as vscode from 'vscode';

/** Well-known credential keys used by Open-Cursor. */
export const CREDENTIAL_KEYS = {
  /** API key for the configured OpenAI-compatible provider. */
  API_KEY: 'openCursor.apiKey',
} as const;

export type CredentialKey = (typeof CREDENTIAL_KEYS)[keyof typeof CREDENTIAL_KEYS];

export class CredentialManager {
  private readonly store: vscode.SecretStorage;

  constructor(store: vscode.SecretStorage) {
    this.store = store;
  }

  /** Retrieve a stored credential value, or undefined if not set. */
  async get(key: CredentialKey | string): Promise<string | undefined> {
    return this.store.get(key);
  }

  /** Store a credential value securely. */
  async set(key: CredentialKey | string, value: string): Promise<void> {
    await this.store.store(key, value);
  }

  /** Remove a stored credential. */
  async delete(key: CredentialKey | string): Promise<void> {
    await this.store.delete(key);
  }

  /**
   * Interactive credential management flow.
   * Presents a quick-pick of known credential keys and lets the developer
   * set or clear each one.
   */
  async promptManage(): Promise<void> {
    const action = await vscode.window.showQuickPick(
      [
        {
          label: '$(key) Set API Key',
          description: 'Store an API key for the configured provider',
          action: 'set',
        },
        {
          label: '$(trash) Clear API Key',
          description: 'Remove the stored API key',
          action: 'clear',
        },
      ],
      { title: 'Open-Cursor: Manage Credentials' },
    );

    if (!action) {
      return;
    }

    if (action.action === 'set') {
      const key = await vscode.window.showInputBox({
        title: 'Enter API Key',
        prompt:
          'Paste your API key. It will be stored in the OS keychain and never written to disk in plain text.',
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await this.set(CREDENTIAL_KEYS.API_KEY, key);
        vscode.window.showInformationMessage('Open-Cursor: API key saved.');
      }
    } else {
      await this.delete(CREDENTIAL_KEYS.API_KEY);
      vscode.window.showInformationMessage('Open-Cursor: API key cleared.');
    }
  }
}
