/**
 * AgentContext – assembles all context (memories, preferences, code snippets)
 * needed for a single agent request into a list of ChatMessages.
 */

import { MemoryManager } from '../memory/MemoryManager';
import { PreferenceManager } from '../credentials/PreferenceManager';
import { ChatMessage } from '../ai/ModelProvider';

export interface AgentRequest {
  userMessage: string;
  /** Optional file path being edited — used to fetch repo memories by tags. */
  filePath?: string;
  /** Optional code selection passed as context. */
  codeContext?: string;
}

export class AgentContext {
  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly preferenceManager: PreferenceManager,
  ) {}

  async buildMessages(request: AgentRequest): Promise<ChatMessage[]> {
    const systemPrompt = await this.buildSystemPrompt(request);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (request.codeContext) {
      messages.push({
        role: 'user',
        content: `Here is the relevant code:\n\`\`\`\n${request.codeContext}\n\`\`\``,
      });
    }

    messages.push({ role: 'user', content: request.userMessage });
    return messages;
  }

  private async buildSystemPrompt(request: AgentRequest): Promise<string> {
    const parts: string[] = [this.preferenceManager.buildSystemFragment()];

    // Inject relevant memories
    const memoryBlock = await this.memoryManager.buildContextBlock({
      search: request.userMessage,
      limit: 10,
    });
    if (memoryBlock) {
      parts.push(memoryBlock);
    }

    return parts.join('\n\n');
  }
}
