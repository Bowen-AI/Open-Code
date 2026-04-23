/**
 * OpenWeightsProvider – uses a local Ollama server to run open-weights models.
 *
 * Compatible with any Ollama deployment (local or remote).
 * Tested against: codellama, deepseek-coder, mistral, llama-3, phi-3, …
 *
 * Ollama API reference: https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import { ChatMessage, CompletionOptions, ModelProvider } from './ModelProvider';

interface OllamaChatResponse {
  message?: { content: string };
  error?: string;
}

export class OpenWeightsProvider implements ModelProvider {
  readonly modelName: string;
  private readonly host: string;

  constructor(host: string, model: string) {
    this.host = host.replace(/\/$/, '');
    this.modelName = model;
  }

  async chat(
    messages: ChatMessage[],
    opts: CompletionOptions = {},
  ): Promise<string> {
    const url = `${this.host}/api/chat`;
    const body = {
      model: this.modelName,
      messages,
      stream: false,
      options: {
        temperature: opts.temperature ?? 0.2,
        num_predict: opts.maxTokens ?? 2048,
        stop: opts.stopSequences,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Ollama request failed (${response.status}): ${text}`,
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }
    return data.message?.content?.trim() ?? '';
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.host}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
