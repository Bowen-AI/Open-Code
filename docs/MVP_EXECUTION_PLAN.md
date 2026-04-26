# Open Code MVP execution plan

This is the concrete path from the current bootstrap to a smooth Mac/Linux MVP.

## Current problems

- The repository is a VS Code extension plus Rust memory daemon, not a full desktop editor app yet.
- Local inference is not bundled yet. The extension assumes a localhost Ollama-compatible server, and the MVP installer pulls the configured model when Ollama is present.
- The model was hard-coded to an old or unverified Gemma tag in call sites. It now reads `openCode.gemmaModel`, defaulting to `gemma3:4b`.
- Review UX now supports selectable line hunks through QuickPick, stale-apply blocking, and latest-change revert, but still needs a dedicated review tree, inline decorations, conflict-safe patching, and later logic-level review.
- Autodrive is a chat panel, but it does not yet stream, cancel, scope tools, or keep an obvious action timeline.
- Memory has raw and semantic tables plus a schema version record, but no ordered migrations, retention policy, vector search, or explicit memory scopes.
- Install has a sandboxed Mac/Linux bootstrap for Node/Rust build tools. A product-grade first-run runtime/model flow is still needed.

## Model decision

As of April 25, 2026, Google's official Gemma release page and model overview list Gemma 3 / Gemma 3n as the current open Gemma families for local deployment, with specialized Gemma-family releases after that. Ollama's Gemma 3 library page describes `gemma3` as the current most capable Gemma model that runs on a single GPU.

- https://ai.google.dev/gemma/docs/releases
- https://ai.google.dev/gemma/docs
- https://ollama.com/library/gemma3

MVP default: `gemma3:4b`.

Why:

- It is the smoothest local default for laptops while still being useful for coding.
- Ollama lists `gemma3:4b` at about 3.3 GB with a 128K context window.
- Stronger options can be selected manually or by Auto when installed: `gemma3:12b`, `gemma3:27b`.
- Efficient fallback for everyday devices: `gemma3n:e4b`.
- Release builds should pin exact artifacts and checksums in a product manifest. Do not rely on a mutable "latest" tag for public releases.

## Open-source reuse

- Editor shell: Code-OSS / VSCodium lineage, plus VS Code extension APIs while this stays a bootstrap.
- Runtime MVP: Ollama for first working Mac/Linux local model setup.
- Runtime product path: llama.cpp or Ollama-compatible sidecar with a tiny localhost HTTP API.
- Model format: GGUF quantized Gemma 3 / Gemma 3n for local CPU/GPU reach.
- Edit review: VS Code native diff editor, `WorkspaceEdit`, editor decorations, and a small diff library such as `diff` or `diff-match-patch` for hunk creation.
- Tests: `@vscode/test-electron` for extension smoke tests and Rust unit tests for memory.
- Packaging: Open VSX for extension MVP; Code-OSS desktop packages later for `.dmg`/`.zip` on macOS and `.deb`/`.AppImage` on Linux.

## Phase 0: make the bootstrap reliable

1. Mac/Linux bootstrap command checks or installs sandboxed Node/Rust, builds the extension and memory daemon, and pulls `gemma3:4b` when Ollama is present.
2. Make the Gemma model tag a setting and remove old hard-coded model names from code.
3. Health command reports memory daemon status, model runtime status, selected model, and last model error.
4. Dependency-free bootstrap check verifies core commands, docs, tests, manifest, and model defaults.
5. CI runs on macOS and Linux so installer assumptions are exercised before release.

## Phase 1: smooth local model experience

1. First-run flow checks for the model runtime and offers one action: prepare local Gemma.
2. Product installer owns model download. Users should not need to know Ollama exists.
3. Store runtime state under extension/app global storage, not inside project repos.
4. Add clear status states: downloading, ready, offline, updating, disk-space error, unsupported machine.
5. Stream model output everywhere the user waits longer than a moment.

## Phase 2: Cursor-style inline edits and tracking

1. Build on the current line-hunk apply path with a dedicated review tree and inline editor decorations.
2. Add stale-document detection before hunk application.
3. Persist every proposed hunk into memory with `change_id`, file path, old range, new range, prompt id, model id, and acceptance state.
4. Add a user-facing action timeline: prompt, model call, proposed hunks, accepted/rejected hunks, files changed, revert status.
5. Keep native undo working and keep hardening the Open Code revert command for the latest accepted change set.

## Phase 3: app packaging

1. Keep extension MVP publishable through Open VSX.
2. Promote the extension and Rust daemon into a Code-OSS fork once hunk review and model readiness are stable.
3. Ship Mac/Linux desktop artifacts with the memory daemon and model runtime sidecar included.
4. On first launch, download or verify the pinned Gemma artifact with checksum validation.
5. Do not commit model weights to this repo or include multi-GB weights in a VSIX.

## MVP acceptance bar

- Fresh Mac/Linux user can install, launch, and get a ready local Gemma 3 model without manual model setup.
- Inline completions work when the model is ready and silently back off when it is not.
- Agent edits are visible as hunks before apply.
- User can accept/reject hunks and inspect a timeline of what changed.
- Memory can be cleared per project and does not store plaintext secrets.
- CI covers TypeScript, Rust, and at least one extension activation smoke test.
