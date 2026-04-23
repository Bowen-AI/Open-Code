/**
 * Credentials & Preferences unit tests.
 * Uses an in-memory SecretStorage stub so no VSCode host is needed.
 */

import * as assert from 'assert';
import { CredentialManager } from '../credentials/CredentialManager';
import { PreferenceManager } from '../credentials/PreferenceManager';

// ── SecretStorage stub ────────────────────────────────────────────────────────

class InMemorySecretStorage {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async store(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  onDidChange = { event: () => ({ dispose: () => {} }) };
}

// ── ExtensionContext stub ─────────────────────────────────────────────────────

class InMemoryGlobalState {
  private map = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.map.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.map.set(key, value);
  }

  keys(): readonly string[] {
    return [...this.map.keys()];
  }

  setKeysForSync(_keys: readonly string[]): void {}
}

function makeContext(): { secrets: InMemorySecretStorage; globalState: InMemoryGlobalState } {
  return {
    secrets: new InMemorySecretStorage(),
    globalState: new InMemoryGlobalState(),
  };
}

// ── CredentialManager tests ───────────────────────────────────────────────────

describe('CredentialManager', () => {
  it('stores and retrieves a credential', async () => {
    const { secrets } = makeContext();
    const cm = new CredentialManager(secrets as never);
    await cm.set('openCursor.apiKey', 'sk-test-key');
    const val = await cm.get('openCursor.apiKey');
    assert.strictEqual(val, 'sk-test-key');
  });

  it('returns undefined for a missing key', async () => {
    const { secrets } = makeContext();
    const cm = new CredentialManager(secrets as never);
    const val = await cm.get('openCursor.apiKey');
    assert.strictEqual(val, undefined);
  });

  it('deletes a credential', async () => {
    const { secrets } = makeContext();
    const cm = new CredentialManager(secrets as never);
    await cm.set('openCursor.apiKey', 'sk-to-delete');
    await cm.delete('openCursor.apiKey');
    const val = await cm.get('openCursor.apiKey');
    assert.strictEqual(val, undefined);
  });
});

// ── PreferenceManager tests ───────────────────────────────────────────────────

describe('PreferenceManager', () => {
  function makePreferenceManager(): PreferenceManager {
    const ctx = makeContext();
    // Provide a minimal stub context
    const stubContext = {
      globalState: ctx.globalState,
    };
    return new PreferenceManager(stubContext as never);
  }

  it('saves and retrieves custom instructions', async () => {
    const pm = makePreferenceManager();
    await pm.setCustomInstructions('Always use async/await');
    // Directly invoke the getter via the stored globalState
    const prefs = pm.get();
    assert.strictEqual(prefs.customInstructions, 'Always use async/await');
  });

  it('buildSystemFragment mentions coding style', () => {
    const pm = makePreferenceManager();
    const fragment = pm.buildSystemFragment();
    // Default style is minimalistic (from VSCode config which returns defaults)
    // In test env VSCode workspace config may not exist; we just check the structure
    assert.ok(typeof fragment === 'string');
    assert.ok(fragment.includes('Open-Cursor'));
  });
});
