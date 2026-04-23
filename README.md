# Open Code

Open Code is an **open, memory-native coding editor** intended to be built from a Code-OSS lineage and released as a public product.

## Current Status

This repository is currently a **planning/bootstrap repo**. It is not yet a full Code-OSS code fork with product changes.

## Fork Model (Practical)

You can be a fork in two valid ways:

1. **Connected fork (recommended):** GitHub fork relationship to `microsoft/vscode` with an `upstream` remote for easy sync.
2. **Detached/independent fork:** You start from Code-OSS history and maintain your own brand/repo without a permanent `upstream` remote.

OpenShift-style precedent: projects can begin from an upstream codebase, heavily diverge, and still remain a legitimate downstream distribution with independent release governance.

## Product Direction

Treat this as three first-class systems:

1. **Editor Shell**
2. **Agent Runtime**
3. **Memory Infrastructure**

Memory is infrastructure, not a chat add-on.

## Must-Have UX

- Inline suggestions in-editor.
- Agent-driven file edits.
- Review controls to accept/reject changes **line-by-line** and **logic-by-logic**.
- Undoable, transparent agent actions with clear reasoning/context.

## Memory Scopes

- `session`
- `repo`
- `host`
- `user`
- `credential_ref` (metadata only; never plaintext secrets)

## Security Baseline

- Secrets in OS keychain / secure vaults only.
- Memory stores references/metadata, not secret values.
- Audit trail for privileged credential usage.

## Architecture Stack

- **Base:** Code-OSS lineage
- **Language:** TypeScript-first
- **Desktop:** Electron
- **Store:** SQLite for structured metadata + memory graph
- **Retrieval:** symbolic + vector hybrid
- **Models:** local open-weights by default, API optional via provider abstraction

## License

Open Code is licensed under **Apache License 2.0** (`LICENSE`).

## Next Steps

1. Decide fork mode: connected (`upstream`) vs detached (manual sync cadence).
2. Import/sync Code-OSS history as baseline.
3. Build extension-first prototype for agent/memory loop.
4. Promote validated pieces into product-native surfaces.
5. Ship reproducible, signed releases.
