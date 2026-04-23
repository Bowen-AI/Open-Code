/**
 * Minimal vscode stub for unit tests running outside the VSCode host.
 * Exported as a CommonJS module so it can be required by the test runner.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const stub: any = {
  workspace: {
    getConfiguration: (_section?: string) => ({
      get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    }),
    workspaceFolders: undefined,
  },
  window: {
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    activeTextEditor: undefined,
    createWebviewPanel: () => ({}),
  },
  ViewColumn: { Beside: 2, One: 1 },
  Uri: { file: (p: string) => ({ fsPath: p }) },
};

module.exports = stub;
