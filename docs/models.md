# AI Model Configuration

Open-Cursor supports two provider types:

| Provider | When to use |
|---|---|
| `openweights` | Local inference via Ollama (no API key needed) |
| `api` | Any OpenAI-compatible REST endpoint |

## Local Models (Ollama)

### 1. Install Ollama

Follow the instructions at https://ollama.ai.

### 2. Pull a model

```bash
ollama pull codellama:13b
# or
ollama pull deepseek-coder:6.7b
# or
ollama pull phi3:medium
```

### 3. Configure Open-Cursor

```jsonc
// .vscode/settings.json  (or global user settings)
{
  "openCursor.model.provider": "openweights",
  "openCursor.model.ollamaHost": "http://localhost:11434",
  "openCursor.model.ollamaModel": "codellama:13b"
}
```

## API Providers

### OpenAI

```jsonc
{
  "openCursor.model.provider": "api",
  "openCursor.model.apiBaseUrl": "https://api.openai.com/v1",
  "openCursor.model.apiModel": "gpt-4o"
}
```

Then run **Open-Cursor: Manage Credentials** to store your API key securely.

### Together AI

```jsonc
{
  "openCursor.model.provider": "api",
  "openCursor.model.apiBaseUrl": "https://api.together.xyz/v1",
  "openCursor.model.apiModel": "codellama/CodeLlama-34b-Instruct-hf"
}
```

### Groq

```jsonc
{
  "openCursor.model.provider": "api",
  "openCursor.model.apiBaseUrl": "https://api.groq.com/openai/v1",
  "openCursor.model.apiModel": "llama3-70b-8192"
}
```

### Ollama (remote instance)

```jsonc
{
  "openCursor.model.provider": "openweights",
  "openCursor.model.ollamaHost": "http://my-server:11434",
  "openCursor.model.ollamaModel": "mistral:7b"
}
```

## Security

- API keys are **never** stored in settings files or the repository.
- They are stored in VSCode's `SecretStorage`, which uses the OS keychain on desktop (macOS Keychain, Windows Credential Manager, libsecret on Linux).
- Run **Open-Cursor: Manage Credentials** from the Command Palette to set or clear keys.
