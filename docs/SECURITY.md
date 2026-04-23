# Security

## Secrets

- **Never** store API keys, tokens, or passwords in the two-layer **memory** store (raw or semantic).
- Use the OS keychain or equivalent (`credential_ref` metadata in project settings) for secret material.
- The VS Code [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) is the appropriate place for user-supplied API keys in an extension when you add remote providers.

## Memory

- **Raw** evidence may include file paths, diffs, and tool output—treat the SQLite database as **sensitive** for many projects. Protect disk encryption and file permissions.
- **Clear project memory** removes rows for the current workspace id from the local DB (see "Clear memory" command).

## Reporting

Set up a `SECURITY.md` with a contact and disclosure process before your first public release. This file is a baseline only.
