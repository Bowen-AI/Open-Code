/**
 * PreferenceManager – manages developer coding preferences.
 *
 * Preferences influence every agent prompt:
 *  - Coding style (minimalistic / verbose / balanced)
 *  - Preferred language
 *  - Custom free-text system instructions
 *
 * Values are read from VSCode workspace configuration so they can be set
 * globally or per-repository via .vscode/settings.json.
 */

import * as vscode from 'vscode';

export type CodingStyle = 'minimalistic' | 'verbose' | 'balanced';

export interface Preferences {
  codingStyle: CodingStyle;
  language: string;
  customInstructions: string;
}

export class PreferenceManager {
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /** Read current preferences from configuration. */
  get(): Preferences {
    const cfg = vscode.workspace.getConfiguration('openCursor');
    return {
      codingStyle: (cfg.get<string>('preferences.codingStyle') ??
        'minimalistic') as CodingStyle,
      language: cfg.get<string>('preferences.language') ?? 'TypeScript',
      customInstructions:
        this.context.globalState.get<string>(
          'openCursor.customInstructions',
        ) ?? '',
    };
  }

  /** Persist custom free-text instructions that supplement the system prompt. */
  async setCustomInstructions(instructions: string): Promise<void> {
    await this.context.globalState.update(
      'openCursor.customInstructions',
      instructions,
    );
  }

  /**
   * Build the system-prompt fragment that encodes the developer's preferences.
   */
  buildSystemFragment(): string {
    const prefs = this.get();
    const lines: string[] = [
      `You are Open-Cursor, an expert AI coding assistant.`,
      `Preferred coding style: ${prefs.codingStyle}.`,
      `Primary language: ${prefs.language}.`,
    ];

    if (prefs.codingStyle === 'minimalistic') {
      lines.push(
        'Write the smallest correct implementation. Avoid boilerplate, unnecessary abstractions, and excessive comments.',
      );
    } else if (prefs.codingStyle === 'verbose') {
      lines.push(
        'Add thorough docstrings, inline comments, and defensive error handling.',
      );
    }

    if (prefs.customInstructions.trim()) {
      lines.push(`Additional instructions: ${prefs.customInstructions.trim()}`);
    }

    return lines.join('\n');
  }
}
