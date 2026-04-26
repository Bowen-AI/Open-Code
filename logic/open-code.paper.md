# Open Code Logic Workspace

A logic-first desktop workspace where project decisions are cards, cards become isolated agent work units, and human review is reserved for design conflicts.

## Conflict Review

- **Agent merge work in crates/open-code-logic/src/lib.rs:** Multiple active cards link to crates/open-code-logic/src/lib.rs; a merge agent should reconcile code changes. (card-agent-coordinator, card-conflict-model, card-logic-schema)
- **Agent merge work in packages/desktop/src-tauri/src/main.rs:** Multiple active cards link to packages/desktop/src-tauri/src/main.rs; a merge agent should reconcile code changes. (card-agent-coordinator, card-vscode-handoff)
- **Agent merge work in packages/desktop/src/App.svelte:** Multiple active cards link to packages/desktop/src/App.svelte; a merge agent should reconcile code changes. (card-conflict-model, card-logic-board-ui)
- **Agent merge work in packages/desktop/preview/app.js:** Multiple active cards link to packages/desktop/preview/app.js; a merge agent should reconcile code changes. (card-documentation-presentations, card-human-conflict-resolution, card-persistent-workspace)
- **Agent merge work in packages/desktop/preview/logic.js:** Multiple active cards link to packages/desktop/preview/logic.js; a merge agent should reconcile code changes. (card-documentation-presentations, card-human-conflict-resolution)
- **Agent merge work in logic/open-code.project.json:** Multiple active cards link to logic/open-code.project.json; a merge agent should reconcile code changes. (card-logic-schema, card-persistent-workspace)

## Logic Runtime

The source of truth for cards, topics, dependencies, conflict detection, and generated documentation output.

### Readable Logic Schema `card-logic-schema`

**Summary:** Store cards and topics in GitHub-readable JSON plus generated documentation views.

**Status:** `ready`

**Linked files:** `crates/open-code-logic/src/lib.rs`, `logic/open-code.project.json`

The structured project file keeps stable card ids, topic order, dependencies, linked files, and conflict metadata. Paper, spec, roadmap, handoff, and website presentations are regenerated from the same state so reviewers can inspect logic in the format that fits the moment.

### Parallel Agent Coordinator `card-agent-coordinator`

**Summary:** Run one isolated branch and worktree per active card.

**Status:** `running`

**Linked files:** `crates/open-code-logic/src/lib.rs`, `packages/desktop/src-tauri/src/main.rs`

**Depends on:** `card-logic-schema`

**Branch:** `open-code/card/card-agent-coordinator-parallel-agent-coordinator`

The coordinator prepares branch names, worktree paths, and command plans. It blocks human-required logic conflicts before an agent starts, but allows code overlaps to continue into merge-agent work.

### Conflict Review Model `card-conflict-model`

**Summary:** Separate agent-resolvable code overlap from human-resolved logic conflict.

**Status:** `ready`

**Linked files:** `crates/open-code-logic/src/lib.rs`, `packages/desktop/src/App.svelte`

**Depends on:** `card-logic-schema`

Same-file work is an agent merge task. Contradictory behavior, duplicated design, incompatible APIs, or dependency cycles become human logic review.

## Desktop Shell

A lightweight Tauri and Svelte app that lets users inspect, edit, and run logic cards.

### Logic Board UI `card-logic-board-ui`

**Summary:** Show topics, card flow, running agents, branches, and conflict badges.

**Status:** `ready`

**Linked files:** `packages/desktop/src/App.svelte`, `packages/desktop/src/app.css`

**Depends on:** `card-logic-schema`, `card-conflict-model`

The main screen uses a topic rail, central logic flow, documentation presentation switcher, and an inspector. Editing happens at the card level because the card is the smallest coherent unit of logic.

### Documentation Presentations `card-documentation-presentations`

**Summary:** Render logic as paper, spec, roadmap, handoff, or website.

**Status:** `ready`

**Linked files:** `packages/desktop/preview/logic.js`, `packages/desktop/preview/app.js`, `docs/DOCUMENTATION_PRESENTATIONS.md`

**Depends on:** `card-logic-schema`, `card-logic-board-ui`

Paper stays useful for long-form reasoning, but the same card graph also needs dense specs, status roadmaps, agent handoffs, and a website-style presentation for stakeholder review. The UI should switch presentation modes without changing the underlying logic cards.

### Open in VS Code `card-vscode-handoff`

**Summary:** Open a card worktree, project folder, or linked file in VS Code.

**Status:** `ready`

**Linked files:** `packages/desktop/src-tauri/src/main.rs`

**Depends on:** `card-agent-coordinator`

Code remains behind the logic surface. Users can jump to VS Code only when they need file-level editing or to inspect an agent worktree.

## MVP Delivery Track

The highest-priority work still needed to move from preview to a real local agent product.

### Local Gemma Brain `card-local-gemma-brain`

**Summary:** Use Gemma 3 4B through Ollama now, with Auto/custom model selection.

**Status:** `ready`

**Linked files:** `packages/desktop/preview/models.js`, `packages/desktop/src/lib/models.ts`, `runtime/model-manifest.json`

**Depends on:** `card-logic-board-ui`

The MVP should always show whether the agent brain is online. Auto prefers installed Gemma 3 models, defaulting to gemma3:4b. Agent runs call the local Ollama API when available and otherwise remain explicit simulations.

### Persistent Logic Workspace `card-persistent-workspace`

**Summary:** Keep preview edits across refresh and mirror the Tauri save/load contract.

**Status:** `ready`

**Linked files:** `packages/desktop/preview/app.js`, `logic/open-code.project.json`

**Depends on:** `card-logic-schema`, `card-logic-board-ui`

The browser preview should persist card edits, statuses, links, selected cards, and activity in localStorage so users can test-drive the workflow. The Tauri app uses the same contract with project JSON and generated Markdown.

### Human Logic Conflict Resolution `card-human-conflict-resolution`

**Summary:** Let humans resolve design conflicts by editing, unblocking, or marking cards obsolete.

**Status:** `ready`

**Linked files:** `packages/desktop/preview/app.js`, `packages/desktop/preview/logic.js`

**Depends on:** `card-conflict-model`, `card-persistent-workspace`

Logic conflicts should not be auto-merged. The UI needs explicit actions to select conflicting cards, resolve declared conflict links, remove missing dependencies, and mark obsolete logic blocked.

### Real Agent Worker `card-real-agent-worker`

**Summary:** Turn a ready card into model-backed code changes in its worktree.

**Status:** `draft`

**Linked files:** `crates/open-code-logic/src/lib.rs`, `packages/desktop/src-tauri/src/main.rs`

**Depends on:** `card-agent-coordinator`, `card-local-gemma-brain`, `card-human-conflict-resolution`

After a card starts, the worker should prompt Gemma with card intent, linked files, dependencies, and conflict report, then produce implementation notes and code changes on the card branch.

### Packaged Model Runtime `card-packaged-runtime`

**Summary:** Bundle a local inference sidecar and manage Gemma download/verification.

**Status:** `draft`

**Linked files:** `docs/AGENT_RUNTIME.md`, `runtime/model-manifest.json`

**Depends on:** `card-local-gemma-brain`

Ollama is the MVP path. The product path bundles a llama.cpp-compatible runtime, stores models under app data, verifies checksums, and exposes one local HTTP API for agents.
