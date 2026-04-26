import * as vscode from "vscode";

const PREFIX = "openCode.credential.";

export class CredentialStore {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  async set(ref: string, value: string): Promise<void> {
    await this.secrets.store(key(ref), value);
  }

  async get(ref: string): Promise<string | undefined> {
    return this.secrets.get(key(ref));
  }

  async delete(ref: string): Promise<void> {
    await this.secrets.delete(key(ref));
  }
}

export function normalizeCredentialRef(ref: string): string {
  return ref.trim().replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function key(ref: string): string {
  return `${PREFIX}${normalizeCredentialRef(ref)}`;
}
