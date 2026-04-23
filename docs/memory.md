# Memory System

Open-Cursor implements a two-tier persistent memory system that allows the AI agent to remember facts across sessions.

## Scopes

### Repo Memory

Stored inside the current repository at `.open-cursor/memory/`.

**When to use:**
- Architecture and design decisions
- Project-specific coding conventions
- Bug-fix history and post-mortems
- API contracts the team has agreed on

**Sharing:** These files can be committed to git so the whole team shares them, or added to `.gitignore` to keep them private.

**Directory layout:**
```
.open-cursor/
└── memory/
    ├── api/          ← memories tagged with 'api'
    ├── design/       ← memories tagged with 'design'
    └── general/      ← untagged memories
```

### Host Memory

Stored in `~/.open-cursor/memory/` on the developer's machine.

**When to use:**
- Personal coding preferences
- Cross-repo patterns you consistently follow
- Environment-specific notes (local DB passwords, dev server URLs)
- Notes you do not want in the repository

**Sharing:** Never shared automatically. Lives on the machine.

## Memory Entry Format

Each memory is stored as a JSON file:

```jsonc
{
  "id": "mem_abc123",           // UUID
  "scope": "repo",              // "repo" | "host"
  "tags": ["api", "design"],   // free-form tags for organisation
  "content": "The content of the memory …",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

## Automatic Memory Saving

The agent can save memories automatically by including `{{SAVE_MEMORY}}` directives in its response:

```
{{SAVE_MEMORY scope="repo" tags="api,design"}}
REST endpoints follow HATEOAS conventions. Always include _links.
{{/SAVE_MEMORY}}
```

The directive is stripped from the visible reply and the content is persisted.

## Memory Organisation

### Tagging

- Use concise, lowercase tags separated by commas: `api`, `design`, `bug`, `performance`
- The first tag determines the storage subdirectory
- All tags are used for filtering in the Memory View

### Eviction

When the number of memories in a scope exceeds `openCursor.memory.maxEntriesPerScope` (default: 500), the oldest entries are evicted automatically (FIFO).

## Querying Memories via the API

```typescript
// Search memories containing "HATEOAS" with tag "api"
const results = await memoryManager.query({
  search: 'HATEOAS',
  tags: ['api'],
  limit: 10,
});

// Build a context block for injection into an LLM prompt
const block = await memoryManager.buildContextBlock({ scope: 'repo', limit: 5 });
```
