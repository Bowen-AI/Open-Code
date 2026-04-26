# Open Code

Open Code is shifting into an **open, logic-first coding workspace**: users shape project logic as cards and topics first, then agents implement each approved card in isolated git branches/worktrees.

The new product center is a lightweight **Tauri + Svelte desktop app** in [`packages/desktop/`](packages/desktop/) backed by the Rust logic core in [`crates/open-code-logic/`](crates/open-code-logic/). The previous VS Code extension remains in [`packages/extension/`](packages/extension/) as a bootstrap/prototype, but it is no longer the primary UX direction.

Read the new architecture notes at [docs/LOGIC_WORKSPACE.md](docs/LOGIC_WORKSPACE.md), [docs/MVP_DELIVERY_TRACK.md](docs/MVP_DELIVERY_TRACK.md), [docs/AGENT_RUNTIME.md](docs/AGENT_RUNTIME.md), and [docs/DOCUMENTATION_PRESENTATIONS.md](docs/DOCUMENTATION_PRESENTATIONS.md).

## Current status (this repository)

The repo is a **bootstrap** that now contains both the earlier VS Code prototype and the new logic-first rebuild scaffold:

- **Logic core** in [`crates/open-code-logic/`](crates/open-code-logic/): project schema, topic/card model, branch-per-card work planning, conflict classification, and generated documentation.
- **Desktop app scaffold** in [`packages/desktop/`](packages/desktop/): Tauri + Svelte UI for topics, cards, documentation presentations, conflict review, agent status, and VS Code handoff.
- **Readable project state** in [`logic/open-code.project.json`](logic/open-code.project.json) and [`logic/open-code.paper.md`](logic/open-code.paper.md).
- **VS Code extension** in [`packages/extension/`](packages/extension/) (Autodrive panel with stop, local Gemma/Ollama-style provider, **Open Code Dark** theme, hunk-based agent review, health + memory commands, **inline completions** when a local model is up).
- **Rust memory service** in [`crates/open-code-memory/`](crates/open-code-memory/): `open-code-memoryd` (HTTP on localhost) with **raw + semantic** SQLite tables.

A **full Code-OSS or Electron app fork** is *not* in this tree yet; the extension is designed to be **promoted** into a fork later. See [docs/GOVERNANCE.md](docs/GOVERNANCE.md).

**Agents / implementers:** start with **[docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)** for the canonical scan of what works, what is missing, priorities, and done criteria.

**For the full picture**—MVP plan vs. what is implemented, what is still missing, and **suggestions** for next work (Gemma packaging, hunk review, pluggable mindsets, vector memory, E2E tests, and everything we discussed in product planning)—read **[docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)**.

For the concrete Mac/Linux execution path from this bootstrap to a smooth MVP, read **[docs/MVP_EXECUTION_PLAN.md](docs/MVP_EXECUTION_PLAN.md)**.

| Topic | Document |
|--------|----------|
| Build, run, develop extension | [docs/BUILD.md](docs/BUILD.md) |
| Agent handoff and missing-pieces checklist | [docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md) |
| Fork model and product branch | [docs/GOVERNANCE.md](docs/GOVERNANCE.md) |
| Releasable bar, Open VSX, models | [docs/RELEASE.md](docs/RELEASE.md) |
| Concrete Mac/Linux MVP execution plan | [docs/MVP_EXECUTION_PLAN.md](docs/MVP_EXECUTION_PLAN.md) |
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
- Review controls to accept/reject changes **line-by-line** and **logic-by-logic** (the bootstrap now has selectable line hunks; see remaining **gaps** in [docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)).
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

## Desktop logic workspace

```bash
npm install
npm run dev:desktop
```

The desktop app reads and writes `logic/open-code.project.json`, regenerates `logic/open-code.paper.md`, and creates card worktrees under the ignored `.open-code/worktrees/` directory when a ready card is started.

## Mac/Linux MVP bootstrap

```bash
scripts/install-mvp-macos-linux.sh
```

This bootstraps missing Node/Rust tools into the ignored `.open-code/toolchain/` sandbox, builds the extension and Rust memory daemon, and pulls the configured local model (`gemma3:4b` by default) when Ollama is installed.

- **TypeScript** and **Rust** build through the sandboxed installer even when system `npm` / `cargo` are missing, as long as `curl` and network access are available.
- **Develop extension:** `npm run watch` and **Run Extension** in VS Code (see [docs/BUILD.md](docs/BUILD.md)).
- **Package VSIX:** `npm run package` (output under `packages/extension/`).

## Next steps (summary)

1. Read **[docs/AGENT_HANDOFF.md](docs/AGENT_HANDOFF.md)** for the scannable missing-pieces checklist and current implementation state.
2. Read **[docs/MVP_AND_ROADMAP.md](docs/MVP_AND_ROADMAP.md)** for **MVP / gaps / suggestions**.
3. Decide fork mode and, when ready, import Code-OSS and promote `packages/extension` into the fork.
4. Ship documented, reproducible releases per [docs/RELEASE.md](docs/RELEASE.md) and [docs/FORK_AND_RELEASE.md](docs/FORK_AND_RELEASE.md).
