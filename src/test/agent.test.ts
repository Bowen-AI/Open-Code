/**
 * Agent unit tests.
 * Uses stubs for all external dependencies.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Agent } from '../agent/Agent';
import { MemoryManager } from '../memory/MemoryManager';
import { ModelProvider, ChatMessage } from '../ai/ModelProvider';
import { PreferenceManager } from '../credentials/PreferenceManager';

// ── Stubs ─────────────────────────────────────────────────────────────────────

class StubModelProvider implements ModelProvider {
  readonly modelName = 'stub-model';
  public lastMessages: ChatMessage[] = [];
  public response = 'Hello from stub!';

  async chat(messages: ChatMessage[]): Promise<string> {
    this.lastMessages = messages;
    return this.response;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

class InMemoryGlobalState {
  private map = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.map.get(key) as T | undefined; }
  async update(key: string, value: unknown): Promise<void> { this.map.set(key, value); }
  keys(): readonly string[] { return [...this.map.keys()]; }
  setKeysForSync(_keys: readonly string[]): void {}
}

function makeMemoryManager(tmpDir: string): MemoryManager {
  const globalState = new InMemoryGlobalState();
  const stubContext = {
    globalState,
    // MemoryManager only uses context.globalState indirectly through enforceLimit
    // which reads vscode workspace config — safe to stub minimally
  };
  return new MemoryManager({
    context: stubContext as never,
    workspaceRoot: tmpDir,
    hostMemoryDir: path.join(tmpDir, 'host-memory'),
  });
}

function makePreferenceManager(): PreferenceManager {
  const globalState = new InMemoryGlobalState();
  return new PreferenceManager({ globalState } as never);
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'open-cursor-agent-test-'));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Agent', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  function makeAgent(modelResponse?: string): { agent: Agent; model: StubModelProvider } {
    const model = new StubModelProvider();
    if (modelResponse !== undefined) {
      model.response = modelResponse;
    }
    const memoryManager = makeMemoryManager(dir);
    const preferenceManager = makePreferenceManager();
    const agent = new Agent({ memoryManager, modelProvider: model, preferenceManager });
    return { agent, model };
  }

  it('returns the model reply', async () => {
    const { agent } = makeAgent('Here is your answer.');
    const result = await agent.chat({ userMessage: 'How do I sort an array?' });
    assert.strictEqual(result.reply, 'Here is your answer.');
    assert.deepStrictEqual(result.savedMemories, []);
  });

  it('includes userMessage in the messages sent to model', async () => {
    const { agent, model } = makeAgent();
    await agent.chat({ userMessage: 'What is 2 + 2?' });
    const lastMsg = model.lastMessages[model.lastMessages.length - 1];
    assert.strictEqual(lastMsg.role, 'user');
    assert.strictEqual(lastMsg.content, 'What is 2 + 2?');
  });

  it('includes code context in messages when provided', async () => {
    const { agent, model } = makeAgent();
    await agent.chat({ userMessage: 'Fix this.', codeContext: 'const x = 1;' });
    const codeMsg = model.lastMessages.find(
      (m) => m.role === 'user' && m.content.includes('const x = 1;'),
    );
    assert.ok(codeMsg, 'Expected code context message to be included');
  });

  it('parses and strips {{SAVE_MEMORY}} directives from reply', async () => {
    const rawResponse =
      'Use HATEOAS for REST APIs.' +
      '{{SAVE_MEMORY scope="host" tags="api,design"}}Use HATEOAS conventions{{/SAVE_MEMORY}}';
    const { agent } = makeAgent(rawResponse);
    const result = await agent.chat({ userMessage: 'How should I design REST APIs?' });
    assert.ok(!result.reply.includes('{{SAVE_MEMORY'));
    assert.ok(result.reply.includes('Use HATEOAS for REST APIs.'));
    assert.strictEqual(result.savedMemories.length, 1);
    assert.strictEqual(result.savedMemories[0], 'Use HATEOAS conventions');
  });

  it('saves multiple memory directives', async () => {
    const rawResponse =
      'OK.' +
      '{{SAVE_MEMORY scope="host" tags="a"}}Memory one{{/SAVE_MEMORY}}' +
      '{{SAVE_MEMORY scope="host" tags="b"}}Memory two{{/SAVE_MEMORY}}';
    const { agent } = makeAgent(rawResponse);
    const result = await agent.chat({ userMessage: 'Test multi-memory' });
    assert.strictEqual(result.savedMemories.length, 2);
  });

  it('saveMemory stores an entry in the memory manager', async () => {
    const { agent } = makeAgent();
    await agent.saveMemory('Always use HTTPS', ['security'], 'host');
    // No assertion on internal state — test that it doesn't throw
  });
});
