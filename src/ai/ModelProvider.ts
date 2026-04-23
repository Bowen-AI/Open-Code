/**
 * ModelProvider – common interface for all AI model backends.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface ModelProvider {
  /**
   * Send a chat conversation and return the assistant reply text.
   */
  chat(messages: ChatMessage[], opts?: CompletionOptions): Promise<string>;

  /**
   * Return true if the provider is reachable / configured.
   */
  isAvailable(): Promise<boolean>;

  /** Human-readable name for the current model / provider. */
  readonly modelName: string;
}
