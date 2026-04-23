# Developer Credentials & Preferences

## Credentials

API keys and other secrets are managed through VSCode's `SecretStorage` API.

### Managing credentials

Run from the Command Palette:

```
> Open-Cursor: Manage Credentials
```

You will be prompted to:
- **Set API Key** – paste an API key that is immediately stored in the OS keychain
- **Clear API Key** – remove a stored key

### Security guarantees

- Keys are stored in the OS keychain (macOS Keychain, Windows Credential Manager, libsecret on Linux).
- Keys are **never** written to `settings.json`, `.env`, or any file in the workspace.
- Keys are **never** logged or transmitted except to the configured AI provider endpoint.

---

## Developer Preferences

Preferences are stored in VSCode settings (`settings.json`) and can be scoped globally or per-repository.

| Setting | Default | Description |
|---|---|---|
| `openCursor.preferences.codingStyle` | `minimalistic` | Controls the agent's verbosity: `minimalistic`, `balanced`, or `verbose` |
| `openCursor.preferences.language` | `TypeScript` | Primary language hint injected into every prompt |

### Coding Style Options

**`minimalistic`** (default)
> Write the smallest correct implementation. Avoid boilerplate, unnecessary abstractions, and excessive comments.

**`balanced`**
> Strike a balance between conciseness and clarity. Add comments for non-obvious logic.

**`verbose`**
> Add thorough docstrings, inline comments, and defensive error handling.

### Custom Instructions

You can add free-text instructions that supplement every agent prompt via the extension API:

```typescript
// Programmatic API
await preferenceManager.setCustomInstructions(
  'Always prefer functional programming patterns. Avoid classes where possible.'
);
```

These are stored in VSCode's `globalState` (local machine, not committed to git).
