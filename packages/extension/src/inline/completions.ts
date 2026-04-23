import * as vscode from "vscode";
import { GemmaLocalProvider } from "../providers/gemmaLocal";

/**
 * Optional ghost-text path: when local model is up, return a one-line completion after cursor.
 * Falls back to no suggestion if the model is offline.
 */
export function registerInlineCompletion(
  context: vscode.ExtensionContext,
  llm: GemmaLocalProvider
): vscode.Disposable {
  return vscode.languages.registerInlineCompletionItemProvider(
    { scheme: "file" },
    {
      provideInlineCompletionItems: async (doc, pos) => {
        if (pos.line < 0) {
          return undefined;
        }
        const before = doc.getText(
          new vscode.Range(new vscode.Position(0, 0), pos)
        );
        if (before.length > 2_000) {
          return undefined;
        }
        try {
          const linePrefix = doc.lineAt(pos).text.slice(0, pos.character);
          if (linePrefix.trim().length < 2) {
            return undefined;
          }
          const out = await llm.complete(
            [
              {
                role: "system",
                content:
                  "You complete the current line of code. Reply with a single line fragment only, no quotes."
              },
              { role: "user", content: `Complete: ${linePrefix}` }
            ],
            { model: "gemma2" }
          );
          const oneLine = out.split("\n")[0] ?? out;
          const range = new vscode.Range(pos, pos);
          return { items: [new vscode.InlineCompletionItem(oneLine, range)] };
        } catch {
          return undefined;
        }
      }
    }
  );
}
