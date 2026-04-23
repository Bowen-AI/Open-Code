/**
 * Agent – main orchestrator for Open-Cursor AI interactions.
 *
 * Responsibilities:
 *  1. Build request context (memories + preferences)
 *  2. Call the configured model provider
 *  3. Parse the response for memory-save directives
 *  4. Persist new memories extracted from the conversation
 */

import { MemoryManager } from '../memory/MemoryManager';
import { PreferenceManager } from '../credentials/PreferenceManager';
import { ModelProvider } from '../ai/ModelProvider';
import { AgentContext, AgentRequest } from './AgentContext';
import { MemoryScope } from '../memory/types';

export interface AgentOptions {
  memoryManager: MemoryManager;
  modelProvider: ModelProvider;
  preferenceManager: PreferenceManager;
}

export interface AgentResponse {
  /** The model's reply text (with memory directives stripped out). */
  reply: string;
  /** Memories that were automatically saved during this turn. */
  savedMemories: string[];
}

/**
 * Inline memory-save syntax the model can use:
 *   {{SAVE_MEMORY scope="repo" tags="api,design"}}Some content to remember{{/SAVE_MEMORY}}
 */
const MEMORY_DIRECTIVE_RE =
  /\{\{SAVE_MEMORY\s+scope="(repo|host)"\s+tags="([^"]*)"\}\}([\s\S]*?)\{\{\/SAVE_MEMORY\}\}/g;

export class Agent {
  private readonly agentContext: AgentContext;
  private readonly memoryManager: MemoryManager;
  private readonly modelProvider: ModelProvider;

  constructor(opts: AgentOptions) {
    this.memoryManager = opts.memoryManager;
    this.modelProvider = opts.modelProvider;
    this.agentContext = new AgentContext(
      opts.memoryManager,
      opts.preferenceManager,
    );
  }

  async chat(request: AgentRequest): Promise<AgentResponse> {
    const messages = await this.agentContext.buildMessages(request);
    const raw = await this.modelProvider.chat(messages);
    return this.processResponse(raw);
  }

  /** Manually save a memory from the UI. */
  async saveMemory(
    content: string,
    tags: string[],
    scope: MemoryScope,
  ): Promise<void> {
    await this.memoryManager.add(content, tags, scope);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async processResponse(raw: string): Promise<AgentResponse> {
    const savedMemories: string[] = [];
    let reply = raw;

    // Extract and process all {{SAVE_MEMORY ...}} directives
    const matches = [...raw.matchAll(MEMORY_DIRECTIVE_RE)];
    for (const match of matches) {
      const scope = match[1] as MemoryScope;
      const tags = match[2]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const content = match[3].trim();

      if (content) {
        await this.memoryManager.add(content, tags, scope);
        savedMemories.push(content);
      }
    }

    // Strip memory directives from the visible reply
    reply = reply.replace(MEMORY_DIRECTIVE_RE, '').trim();

    return { reply, savedMemories };
  }
}
