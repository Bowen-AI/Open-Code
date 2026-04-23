# Open Code

Open Code is an **open, memory-native coding editor** intended to be built from a Code-OSS lineage and released as a public product.

## Current status (this repository)

The repo is a **bootstrap** that already contains working **prototype** code, not just planning docs:

- **VS Code extension** in [`packages/extension/`](packages/extension/) (Autodrive panel, local Gemma/Ollama-style provider, **Open Code Dark** theme, diff-based agent review, memory commands, **inline completions** when a local model is up).
- **Rust memory service** in [`crates/open-code-memory/`](crates/open-code-memory/): `open-code-memoryd` (HTTP on localhost) with **raw + semantic** SQLite tables.

A **full Code-OSS or Electron app fork** is *not* in this tree yet; the extension is designed to be **promoted** into a fork later. See [docs/GOVERNANCE.md](docs/GOVERNANCE.md).

**For the full picture**—MVP plan vs. what is implemented, what is still missing, and **suggestions** for next work (Gemma packaging, hunk review, pluggable mindsets, vector memory, E2E tests, and everything we discussed in product planning)—read **[docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)**.

| Topic | Document |
|--------|----------|
| Build, run, develop extension | [docs/BUILD.md](docs/BUILD.md) |
| Fork model and product branch | [docs/GOVERNANCE.md](docs/GOVERNANCE.md) |
| Releasable bar, Open VSX, models | [docs/RELEASE.md](docs/RELEASE.md) |
| Secrets and memory | [docs/SECURITY.md](docs/SECURITY.md) |
| Upstream vs detached fork, sync | [docs/FORK_AND_RELEASE.md](docs/FORK_AND_RELEASE.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

## Product direction (unchanged)

Treat this as three first-class systems:

1. **Editor shell**
2. **Agent runtime**
3. **Memory infrastructure**

Memory is infrastructure, not a chat add-on.

## Must-have UX (target contract)

- Inline suggestions in-editor.
- Agent-driven file edits.
- Review controls to accept/reject changes **line-by-line** and **logic-by-logic** (the bootstrap currently uses **whole-file** diff + accept/reject; see **gaps** in [docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)).
- Undoable, transparent agent actions with clear reasoning/context.

## Memory scopes (design)

- `session`
- `repo`
- `host`
- `user`
- `credential_ref` (metadata only; never plaintext secrets)

## Security baseline

- Secrets in OS keychain / secure vaults only.
- Memory stores references/metadata, not secret values.
- Audit trail for privileged credential usage (to be productized; see [docs/SECURITY.md](docs/SECURITY.md)).

## Architecture stack (intent)

- **Base:** Code-OSS lineage
- **Language:** TypeScript-first (VS Code extension); **Rust** for performance-critical **memory** and optional native inference
- **Desktop:** Electron (when you ship a full app fork)
- **Store:** SQLite for structured metadata + memory graph
- **Retrieval:** symbolic + vector hybrid (vector piece not yet in the bootstrap; see roadmap doc)
- **Models:** local open-weights (e.g. **Gemma**) by default, **localhost**; API optional via provider abstraction

## Fork model (practical)

1. **Connected fork (recommended):** GitHub relationship to `microsoft/vscode` with an `upstream` remote.
2. **Detached/independent fork:** your own import cadence, still Code-OSS–lineage.

## License

Open Code is licensed under **Apache License 2.0** ([LICENSE](LICENSE)).

## Build (prototype)

```bash
npm install
npm run build
```

- **TypeScript** always builds. **Rust** `open-code-memoryd` builds when `cargo` is on your `PATH`; if not, the script explains how to install Rust.
- **Develop extension:** `npm run watch` and **Run Extension** in VS Code (see [docs/BUILD.md](docs/BUILD.md)).
- **Package VSIX:** `npm run package` (output under `packages/extension/`).

## Next steps (summary)

1. Read **[docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)** for **MVP / gaps / suggestions**.
2. Decide fork mode and, when ready, import Code-OSS and promote `packages/extension` into the fork.
3. Ship documented, reproducible releases per [docs/RELEASE.md](docs/RELEASE.md) and [docs/FORK_AND_RELEASE.md](docs/FORK_AND_RELEASE.md).
