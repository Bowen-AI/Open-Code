/**
 * APIProvider – calls any OpenAI-compatible REST API.
 *
 * Works with:
 *  - OpenAI (https://api.openai.com/v1)
 *  - Azure OpenAI
 *  - Anthropic (via compatibility layer)
 *  - Together, Groq, Fireworks, Mistral, …
 */

import { CredentialManager } from '../credentials/CredentialManager';
import { ChatMessage, CompletionOptions, ModelProvider } from './ModelProvider';

interface OpenAIChoice {
  message: { content: string };
}

interface OpenAIResponse {
  choices?: OpenAIChoice[];
  error?: { message: string };
}

export class APIProvider implements ModelProvider {
  readonly modelName: string;
  private readonly baseUrl: string;
  private readonly credentialManager: CredentialManager;

  constructor(
    baseUrl: string,
    model: string,
    credentialManager: CredentialManager,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelName = model;
    this.credentialManager = credentialManager;
  }

  async chat(
    messages: ChatMessage[],
    opts: CompletionOptions = {},
  ): Promise<string> {
    const apiKey = await this.credentialManager.get('openCursor.apiKey');
    if (!apiKey) {
      throw new Error(
        'No API key configured. Run "Open-Cursor: Manage Credentials" to set one.',
      );
    }

    const url = `${this.baseUrl}/chat/completions`;
    const body = {
      model: this.modelName,
      messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 2048,
      stop: opts.stopSequences,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API request failed (${response.status}): ${text}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    if (data.error) {
      throw new Error(`API error: ${data.error.message}`);
    }

    return data.choices?.[0]?.message?.content?.trim() ?? '';
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = await this.credentialManager.get('openCursor.apiKey');
    return !!apiKey;
  }
}
