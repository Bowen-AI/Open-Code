# Security

## Secrets

- **Never** store API keys, tokens, or passwords in the two-layer **memory** store (raw or semantic).
- Use the OS keychain or equivalent (`credential_ref` metadata in project settings) for secret material.
- The extension includes basic `Open Code: Store credential reference` and `Open Code: Delete credential reference` commands backed by VS Code SecretStorage. These commands store secret values outside the SQLite memory database.
- The VS Code [SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) is the appropriate place for user-supplied API keys in an extension when you add remote providers.

## Memory

- **Raw** evidence may include file paths, diffs, and tool output—treat the SQLite database as **sensitive** for many projects. Protect disk encryption and file permissions.
- **Clear project memory** removes rows for the current workspace id from the local DB (see "Clear memory" command).
- `open-code-memoryd` binds only to `127.0.0.1` and should not be exposed outside the local machine. Do not add permissive browser CORS to the daemon for GA; extension and desktop callers should use local process or localhost clients instead of cross-origin browser access.
- Memory reads must fail closed on corrupt rows. Do not silently skip malformed raw evidence because that hides data corruption from health checks and exports.

## Reporting

Set up a `SECURITY.md` with a contact and disclosure process before your first public release. This file is a baseline only.
