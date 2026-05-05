# MVP plan, current status, gaps, and suggestions

This document captures the **product vision** and **MVP** we aligned on in planning, what **exists in this repository today**, what is **still missing** for a full MVP or 1.0, and **suggestions** for the next iteration.

It is a living document—update it when major features land.

---

## 1. The north star

Open Code aims to be a **logic-first, agentic coding workspace**: users shape the project as readable cards/topics first, then parallel agents implement approved cards in isolated git branches/worktrees.

- **Logic board** + **agent runtime** + **memory as infrastructure** (not a chat bolt-on).
- **Card-per-agent isolation:** each runnable logic card gets its own branch/worktree; code conflicts go to merge agents, logic conflicts go to humans.
- **Readable source of truth:** structured JSON plus generated Markdown under `logic/` so project logic can be reviewed on GitHub.
- **Default open model: Gemma 3 4B (pinned)** on **localhost**, with Auto model selection and everything **packaged** so users are not required to install Ollama or other runtimes by hand in a future consumer build (Ollama-style API remains a *compatibility* target).
- **Autodrive / Autopilot**: a **multi-turn conversational agent** (like a persistent chat) with **pause/stop**, scope, and **review/undo** where the product contract requires it.
- **Multi-mindset self-critique** (QA, tests, scalability, fault tolerance, extensible) with **per-project toggles** (e.g. turn off “scalability” for a tiny project so the “brain” does not think about it).
- **Discriminator** (persistent): run enabled mindsets on **prompts**, **proposed edits**, and **commits** (or equivalent), and log results into memory.
- **Two-layer memory**:
  - **Raw evidence:** messages, files, diffs, tool output, user actions, and later media (screenshots, audio/video) with user consent and retention policy.
  - **Semantic layer:** summaries, facts/triples, preferences, goals, decisions, timelines, open tasks (lightweight in MVP, richer over time). Links back to **raw ids** for every surfaced claim.
- **Rust** for **fast** subsystems, **especially the memory** pipeline; **TypeScript** for VS Code / workbench integration and most UI. **Re-use Code-OSS/VS Code** built-ins (theming, diff, commands, webviews) before building bespoke UI.

---

## 2. What is implemented in *this* repo (bootstrap)

| Area | What exists |
|------|-------------|
| **Logic workspace** | `crates/open-code-logic`: topics/cards schema, branch/worktree planning, conflict classification, generated documentation, and tests for the multi-agent model. |
| **Desktop app scaffold** | `packages/desktop`: Tauri + Svelte UI for topic navigation, card inspection, conflict review, running agent badges, and VS Code handoff. |
| **Readable project state** | `logic/open-code.project.json`, `logic/open-code.paper.md`, and presentation docs: GitHub-readable starter state for the new product model. |
| **VS Code extension** | `packages/extension`: commands (Autodrive webview, run agent, review diff, health, clear/show memory, discriminator on **commit** text in active editor), local Gemma/Ollama-style **HTTP** provider, **Open Code Dark** theme, **inline completion** hook (uses local model when available). |
| **Agent loop** | Proposes changes via local LLM, shows **native diff** editor, computes line hunks, supports **Accept All** / **Choose Hunks** / **Reject**; memory logging of diffs, hunk ids, and actions. **Undo** = editor undo. |
| **Memory** | Rust `open-code-memory` + `open-code-memoryd`: **SQLite** **raw** + **semantic** tables, **HTTP** API on `127.0.0.1`, append/clear/recent; **hashed** payload field on raw. |
| **Discriminator (partial)** | Mindset **toggles** in settings; `onPrompt` / proposed edits / **commit** path hook; writes **raw + semantic** (critic summary) when the LLM responds. **Not** full pluggable critic modules or gating of auto-apply. |
| **Build / CI** | `npm` workspace, `Cargo.lock`, GitHub **CI** matrix on Ubuntu/macOS (fmt, clippy, test, build, bootstrap checks), **fork-health** for lineage checks. |
| **Docs** | [BUILD](BUILD.md), [GOVERNANCE](GOVERNANCE.md), [RELEASE](RELEASE.md), [SECURITY](SECURITY.md), [FORK_AND_RELEASE](FORK_AND_RELEASE.md) |

---

## 3. What is missing (relative to the full plan MVP / 1.0)

| Gap | Notes |
|-----|--------|
| **Code-OSS / Electron product fork** | The extension is **not** yet merged into a full editor fork. That is a large follow-on for signed desktop apps. |
| **Packaged local inference (no extra installs)** | No bundled Ollama/llama.cpp sidecar in the extension VSIX; users must run a server at `openCode.gemmaBaseUrl` (e.g. Ollama) or use offline stubs. A **one-installer** story is TBD. |
| **Gemma “pinned in product”** | Default URL assumes a local server; extension setting now defaults to `gemma3:4b`, but release builds still need **exact** artifacts and checksums in a **release** manifest. |
| **Line-by-line / logic-by-logic review** | Basic line-hunk selection exists; still missing a dedicated review tree, inline decorations, stale-document detection, and AST-aware acceptance. |
| **Full raw evidence types** | **Multimedia** (screens, audio, video) and rich **tool output** capture are **not** fully wired (schema can grow). |
| **Semantic layer depth** | No automatic **triple** extraction, nightly compaction, or **vector/ANN** retrieval; summaries are only where the **discriminator** and flows write them. |
| **Memory scopes** | **Host** / **user**-wide stores and `credential_ref` **audit** are not productized; **per-project** is approximated via `workspace` folder id. |
| **Autodrive** | Webview + memory is present; no **formal** step budgets, allowlists, or **block** of auto-apply. |
| **Mindset pluggins** | One LLM call with a **list** of enabled mindsets, not separate critic modules, budgets, or **async** critic queues. |
| **E2E tests** | `npm run test:e2e` now covers docs/bootstrap, desktop preview workflows, extension activation, Rust logic/memory, workspace build, and a strict local Ollama/Gemma response. CI runs `npm run test:e2e:ci`, skipping only the multi-GB model call. |

---

## 4. Suggestions (next steps, prioritized)

1. **Inference packaging** — SPIKE: bundle **Ollama-compatible** binary **or** **llama.cpp** sidecar (Rust is a good fit) per OS; one **managed** first-run or embedded download for **Gemma 3 / Gemma 3n** weights. Keep the app talking only to a **small HTTP API** on localhost.
2. **Memory: profile then optimize** — Keep **Rust** for ingest/index hot paths; add **migrations** and **version** table. Add **retention** and export for GDPR-style deletion.
3. **Review UX** — Move from “replace whole file” to **patch hunks** using workspace edits + a dedicated review tree or inline decorations consistent with [README](../README.md) must-haves.
4. **Vector retrieval** — Add optional **embedder** and ANN (or SQLite extension) for semantic search; always **point back** to **raw** rows.
5. **Credentials** — Wire **SecretStorage** for any non-local API keys; keep memory as **metadata only** ([SECURITY](SECURITY.md)).
6. **Promote to fork** — When stable, place the extension under `extensions/` in a **Code-OSS** fork and wire **product.json** for a branded app ([GOVERNANCE](GOVERNANCE.md), [FORK_AND_RELEASE](FORK_AND_RELEASE.md)).
7. **Test matrix** — Keep extending the E2E matrix toward packaged-app flows, managed runtime download, memory retention/export, and fork-health checks.

---

## 5. How this relates to the original README

The **Must-Have UX** and **Memory Scopes** in the [README](../README.md) are still the **contract**. This file explains **how far the bootstrap** has progressed and what remains before claiming **MVP** or **1.0** against that contract.

**Definition of a stronger MVP candidate (internal bar):** packaged or documented **local** Gemma 3 path, **stable** two-layer memory with **revoke/clear**, **autodrive** with clear **stop** semantics, and **at least two** real mindset + **documented** discriminator hooks on **prompt + edit + commit**—all without requiring undisclosed **plaintext** secrets in SQLite.

For release mechanics, see [RELEASE](RELEASE.md) and [FORK_AND_RELEASE](FORK_AND_RELEASE.md) (“Definition of Releasable”).
