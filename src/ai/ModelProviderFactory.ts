/**
 * ModelProviderFactory – reads VSCode configuration and constructs the
 * appropriate ModelProvider implementation.
 */

import * as vscode from 'vscode';
import { CredentialManager } from '../credentials/CredentialManager';
import { ModelProvider } from './ModelProvider';
import { OpenWeightsProvider } from './OpenWeightsProvider';
import { APIProvider } from './APIProvider';

export class ModelProviderFactory {
  static create(
    cfg: vscode.WorkspaceConfiguration,
    credentialManager: CredentialManager,
  ): ModelProvider {
    const providerType: string = cfg.get('model.provider') ?? 'openweights';

    if (providerType === 'api') {
      const baseUrl: string =
        cfg.get('model.apiBaseUrl') ?? 'https://api.openai.com/v1';
      const model: string = cfg.get('model.apiModel') ?? 'gpt-4o';
      return new APIProvider(baseUrl, model, credentialManager);
    }

    // Default: openweights / Ollama
    const host: string =
      cfg.get('model.ollamaHost') ?? 'http://localhost:11434';
    const model: string = cfg.get('model.ollamaModel') ?? 'codellama:13b';
    return new OpenWeightsProvider(host, model);
  }
}
