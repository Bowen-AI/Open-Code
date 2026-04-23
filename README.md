# Open-Cursor

> An open-source, Cursor-like AI code editor built on VSCode — with persistent agent memory, open-weights model support, and first-class developer credential management.

---

## Vision

Open-Cursor aims to replicate (and improve upon) the AI-assisted coding experience pioneered by [Cursor](https://cursor.so), while remaining **fully open-source** and **model-agnostic**.  Key differentiators:

| Feature | Open-Cursor | Cursor |
|---|---|---|
| Source code | ✅ Public (MIT) | ❌ Closed |
| Open-weights models | ✅ Native (Ollama, llama.cpp) | ⚠️ Limited |
| OpenAI-compatible API | ✅ Yes | ✅ Yes |
| Persistent agent memory | ✅ Repo + Host | ❌ None |
| Memory organisation | ✅ Tagged, searchable | ❌ None |
| Developer credentials vault | ✅ Encrypted local store | ❌ None |
| Coding preference profiles | ✅ Per-repo & global | ❌ None |

---

## Architecture

```
Open-Cursor (VSCode Extension)
│
├── Agent System          ← orchestrates completions & tool calls
│   ├── AgentContext      ← assembles memory + tools per request
│   └── Agent             ← main loop: plan → act → remember
│
├── Memory System
│   ├── RepoMemory        ← git-tracked .open-cursor/memory/ files
│   ├── HostMemory        ← ~/.open-cursor/memory/ (machine-local)
│   └── MemoryOrganizer   ← tag, search & retrieve memories
│
├── AI Model Integration
│   ├── OpenWeightsProvider ← Ollama / llama.cpp (local)
│   └── APIProvider         ← OpenAI-compatible REST endpoint
│
├── Credentials & Preferences
│   ├── CredentialManager ← encrypted vault (VSCode SecretStorage)
│   └── PreferenceManager ← coding-style, model, formatting prefs
│
└── VSCode UI
    ├── AgentPanel        ← chat / inline-edit side panel
    └── MemoryView        ← browse & manage stored memories
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [VSCode](https://code.visualstudio.com) ≥ 1.85
- *(optional)* [Ollama](https://ollama.ai) for local open-weights inference

### Install & Run (development)

```bash
git clone https://github.com/Bowen-AI/Open-Cursor.git
cd Open-Cursor
npm install
npm run compile
# Then press F5 in VSCode to launch the Extension Development Host
```

### Running tests

```bash
npm test
```

---

## Memory System

Open-Cursor stores agent memories in two scopes:

### Repo Memory (`.open-cursor/memory/`)

Checked into (or git-ignored from) the project repository.  Ideal for:

- Design decisions and architecture notes
- Project-specific coding conventions
- Past bug-fix summaries

```jsonc
// .open-cursor/memory/decisions/2024-api-design.json
{
  "id": "mem_abc123",
  "scope": "repo",
  "tags": ["api", "design"],
  "content": "REST endpoints follow HATEOAS conventions …",
  "created_at": "2024-01-15T10:00:00Z"
}
```

### Host Memory (`~/.open-cursor/memory/`)

Stored on the developer's machine, never leaves the host.  Ideal for:

- Personal coding preferences
- Cross-repo patterns the developer prefers
- Environment-specific notes

---

## AI Model Configuration

Open-Cursor supports **any OpenAI-compatible API** as well as native **Ollama** models.

### Using a local model (Ollama)

```jsonc
// .vscode/settings.json
{
  "openCursor.model.provider": "openweights",
  "openCursor.model.ollamaHost": "http://localhost:11434",
  "openCursor.model.ollamaModel": "codellama:13b"
}
```

### Using an API provider

```jsonc
{
  "openCursor.model.provider": "api",
  "openCursor.model.apiBaseUrl": "https://api.openai.com/v1",
  "openCursor.model.apiModel": "gpt-4o"
  // API key stored in the encrypted credential vault — never in settings
}
```

---

## Developer Credentials

API keys and tokens are stored in VSCode's built-in `SecretStorage` (OS keychain on desktop).  They are **never** written to settings files or the repository.

```
> Open-Cursor: Manage Credentials   (Command Palette)
```

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Commit your changes (`git commit -m 'feat: add my feature'`)
4. Push to the branch (`git push origin feat/my-feature`)
5. Open a Pull Request

Please follow the [Conventional Commits](https://www.conventionalcommits.org) specification.

---

## License

MIT — see [LICENSE](LICENSE) for details.
