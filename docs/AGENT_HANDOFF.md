# Open Code Agent Handoff

This is the canonical quick-scan file for future AI agents and engineers. Read this before changing implementation code.

## Agent Quick Read

- This repository is currently a VS Code extension plus a Rust memory daemon bootstrap. It is not a full Code-OSS/Electron desktop app yet.
- The current local model target is Gemma 3 4B through `openCode.gemmaModel = gemma3:4b`.
- The MVP install target is macOS and Linux only. Windows support is out of scope for now.
- Do not commit model weights, generated model artifacts, private keys, tokens, or local memory databases.
- Keep detailed implementation notes here when major features land so the next agent does not need to rediscover project state.

## Current Working Pieces

- VS Code extension prototype in `packages/extension` with command registration, Autodrive webview with stop/cancel, inline completions, local Gemma/Ollama-compatible HTTP provider, health command, SecretStorage credential-ref commands, memory commands, and the Open Code Dark theme.
- Rust `open-code-memoryd` service in `crates/open-code-memory` with localhost HTTP endpoints, SQLite raw + semantic tables, and a schema version record.
- `npm run test:memoryd:probe` starts and probes `open-code-memoryd` health/append/recent/semantic/clear when localhost listeners are allowed; CI and release hosts should run it strictly.
- Agent edit loop can propose a whole-file replacement, compute line hunks, open a native VS Code diff, block stale applies, and apply all or selected hunks through `WorkspaceEdit`.
- Basic memory clear/show commands exist for the current project id.
- Hunk proposals, accepted/rejected hunk ids, stale blocks, and latest-change reverts are logged to raw memory for change tracking.
- Partial discriminator exists with mindset toggles and prompt/edit/commit hooks that write critic summaries to memory.
- The Mac/Linux installer can bootstrap missing Node/Rust tools into ignored `.open-code/toolchain/`, build the extension and memory daemon, write `.open-code/toolchain/env.sh`, pull `gemma3:4b` when Ollama is installed, and verify one local model response.
- `npm run test:e2e` is the strict local readiness matrix across docs/bootstrap, desktop, extension, Rust logic/memory, and local Gemma via Ollama. `npm run test:e2e:ci` skips only the multi-GB model call.
- CI builds/checks Rust and TypeScript on Ubuntu and macOS. A dependency-free bootstrap check verifies core commands, docs, tests, manifest, and model defaults. `@vscode/test-electron` activation smoke tests are wired into the extension test script.
- The Tauri logic workspace now has production worker-run paths: after a card worktree starts, the app can persist a notes-only `agentRuns[]` entry with model/mode, prompt summary, branch/worktree, diagnostics, preflight conflicts, and scoped proposed changes. The desktop loop can also ask the local Gemma/Ollama brain for structured JSON edits, then apply linked-file replacements through the backend after plan matching, linked-file scope validation, worktree-scope validation, duplicate/path traversal rejection, no-op rejection, edit-size limiting, and stale-file text checks. Reviewable structured edits persist hunk range metadata without storing raw diff text in the logic project, and the desktop/preview inspectors show those hunks. Reviewers can close the latest reviewable run as merged/rejected, cancel a running card, or reset blocked rejected/failed/cancelled runs for retry through guarded Tauri commands; cancellation aborts active model requests and late worker completions are ignored. Accepted review closeout commits proposed files on the card branch, merges that branch into the project root, and attempts scoped cleanup. Retry reset records an `abandoned` audit run and cleans up only scoped Open Code branches/worktrees before clearing active card metadata.

## Missing Pieces Inventory

| Priority | Subsystem | What is missing | Implementation direction | Done when |
| --- | --- | --- | --- | --- |
| P0 | Product shell | Full Code-OSS/Electron desktop app fork. | Keep the extension as the bootstrap until agent review and local model readiness are stable, then promote it into a Code-OSS lineage fork with product branding and release wiring. | A branded Mac/Linux desktop build can launch with Open Code features preinstalled. |
| P1 | Install | Product-grade first-run flow. | Build on the sandboxed installer with a GUI/status flow that detects missing Ollama/model/runtime state and offers one recovery action. | A fresh macOS/Linux user can launch and complete model readiness from inside the product. |
| P1 | Local inference | Bundled or fully managed local inference runtime. | Use Ollama for the first working MVP path; evaluate a bundled llama.cpp or Ollama-compatible sidecar for the desktop product. Keep the extension speaking to a small localhost HTTP API. | The app can start or prepare the local model runtime without requiring users to manually run a separate server. |
| P1 | Models | Exact Gemma 3 / Gemma 3n artifact checksums for desktop release. | Replace the MVP Ollama runtime-managed manifest with exact artifact URLs, sizes, checksums, and notices for the chosen bundled/managed runtime. | Public releases do not rely on mutable tags and can verify downloaded artifacts before use. |
| P1 | Status UX | Health UI polish and first-run remediation. | Extend the current Open Code health command into a status bar/webview flow with actionable fixes for missing memory daemon, missing runtime, missing model, and disk-space errors. | Users can diagnose and fix readiness from guided actions, not just an output report. |
| P1 | Edit review | Dedicated hunk review UI and stronger conflict handling. | Build on the current selectable hunk apply path with a review tree, inline decorations, stale-document detection, and conflict-safe patch application. | Users can review hunks in-editor and cannot accidentally apply hunks against changed text. |
| P1 | Edit review | Later logic-level/AST-aware review. | After hunk review is stable, add language-aware grouping using existing parser/LSP signals where available, falling back to hunks. | Users can review a coherent logical change group when a file contains multiple related hunks. |
| P1 | Edit tracking | Rich action timeline. | Build on latest-change revert and hunk memory logs with a user-facing timeline view that shows prompt, model, files, hunks, accepts/rejects, and revert status. | Users can inspect the full agent action chain without reading raw memory JSON. |
| P1 | Desktop agent worker | Hunk review, true resume, and stronger merge-conflict recovery. | Build on the safe Tauri linked-file replacement, hunk metadata, git merge closeout, cancellation, and reset-for-retry path by adding hunk-level accept/reject, resume from partially completed runs, and conflict recovery around branch merge failures. | A ready card produces real linked-file edits through the model loop and users can inspect hunks, accept, reject, merge, or abandon them safely. |
| P1 | Autodrive | Streaming output. | Build on current stop/cancel behavior by using runtime streaming endpoints where supported. | Long model responses visibly stream token-by-token and remain cancellable. |
| P1 | Autodrive safety | Scope, budgets, allowlists, and tool safety. | Add explicit session scope, step budget, allowed actions, and confirmation gates before any file/tool action beyond chat. | Autodrive cannot silently exceed the chosen scope or continue runaway work. |
| P1 | Memory schema | Real forward migrations. | Build on the schema version table with ordered migrations and compatibility tests before adding more record types. | Existing memory databases can be upgraded predictably without dropping user data. |
| P1 | Memory controls | Memory retention/export/delete policy. | Add project-level retention settings, export, and clear/delete behavior for raw and semantic records. | Users can inspect, export, and revoke stored memory per project. |
| P1 | Memory scopes | Real host/user/session/repo memory scopes. | Replace the current project-id approximation with explicit scoped records and retrieval filters. Keep `credential_ref` as metadata only. | Memory reads/writes can target session, repo, host, and user scopes without leaking secrets. |
| P2 | Retrieval | Vector/semantic retrieval with raw evidence links. | Add optional embeddings and ANN/vector search while preserving links from every semantic result back to raw evidence ids. | Agent context can retrieve relevant prior facts and show the raw source ids behind them. |
| P1 | Credentials | Credential usage audit path. | Build on the SecretStorage credential-ref commands by logging privileged credential usage metadata without writing secret values to memory. | No plaintext secrets are stored in SQLite, and credential usage can be audited. |
| P1 | Tests | Broader `@vscode/test-electron` coverage. | Build on the activation smoke test with memory daemon startup, health command, and hunk review command tests. | CI proves the extension activates inside VS Code and basic workflows are wired. |
| P1 | CI | Richer Mac/Linux release checks. | Build on the current Ubuntu/macOS CI matrix with packaged VSIX checks and memory daemon startup probes on both platforms. | Pull requests validate the supported MVP platforms and packaging assumptions. |
| P1 | Release | Release signing/package story for desktop artifacts. | Define reproducible build steps, notarization/signing expectations, artifact names, and checksum publication for Mac/Linux. | Desktop release artifacts are reproducible, signed where needed, and documented. |

## Recommended Build Order

1. **Phase 0: Bootstrap reliability**
   - Keep docs current, mature the health/status command, add extension smoke tests, and make CI cover packaged artifacts on the MVP platforms.
2. **Phase 1: Local model readiness**
   - Make first-run Gemma setup smooth, visible, and recoverable. Users should not need to know which background runtime is serving the model.
3. **Phase 2: Cursor-style edits**
   - Replace whole-file proposals with hunk-based review, persistent change-set tracking, and a reliable revert path.
4. **Phase 3: Memory hardening**
   - Add migrations, retention/export/delete controls, explicit scopes, and secret-reference auditing.
5. **Phase 4: Desktop packaging**
   - Promote the stable extension/runtime pieces into a Code-OSS fork and ship Mac/Linux desktop artifacts.

## Agent Rules

- Do not overwrite or revert user changes unless the user explicitly asks.
- Do not commit model weights or generated multi-GB model artifacts.
- Prefer Code-OSS, VS Code built-ins, and established open-source libraries before writing custom infrastructure.
- Keep macOS and Linux as the only supported install targets for this MVP.
- Keep README concise; link detailed implementation state from this handoff doc and update it when major features land.
- When editing code, keep changes scoped to the requested subsystem and preserve the extension + Rust daemon bootstrap shape until the desktop fork begins.

## Problems, Improvements, And Risks

### Still Missing

- Full Code-OSS/Electron desktop app fork and signed Mac/Linux desktop release artifacts.
- Product-owned model runtime and GUI first-run Gemma download/verification flow.
- Exact Gemma 3 / Gemma 3n artifact checksums, sizes, source URLs, and notices for non-Ollama release builds.
- Streaming token output for Autodrive and other long-running model calls.
- Per-hunk accept/reject UI, inline diff review, true resume from partial worker progress, stronger merge-conflict recovery, and stronger conflict-safe patch review for logic-card worker output.
- Rich user-facing action timeline beyond latest-change revert.
- Ordered memory migrations, explicit scopes, retention/export/delete controls, and vector retrieval.
- Broader `@vscode/test-electron` workflow tests beyond activation.

### Can Be Improved

- The current hunk selector uses QuickPick; a review tree plus inline decorations would feel closer to Cursor.
- The hunk diff is dependency-free and line-based; later work should use a proven diff/patch library or VS Code-native review model if available.
- Health output is useful for agents but should become a first-run guided readiness flow for users.
- The installer now bootstraps Node/Rust into a sandbox, but product install should also hide Ollama/runtime details and surface plain recovery actions.
- CI should package the VSIX and run the strict memory daemon HTTP probe on both Ubuntu and macOS.

### Vulnerabilities / Security Risks

- Raw memory can contain file paths, diffs, prompts, and tool output; treat the SQLite database as sensitive user data.
- No retention/export/delete policy exists beyond clearing the current project id.
- Secret values can be stored in VS Code SecretStorage, but credential usage audit metadata is not implemented yet.
- MVP model pulls are runtime-managed by Ollama; non-Ollama release downloads are not checksum-verified yet.
- The local HTTP services should stay bound to `127.0.0.1`; do not widen binding without authentication and threat modeling.

### Latest Validation

- On May 7, 2026, sandboxed verification passed through `.open-code/toolchain/`: `npm run lint`, `npm run -w open-code-vscode-extension test:unit`, `npm run test:desktop:preview`, `cargo test --workspace --all-targets`, `npm run build`, `npm run package`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci`.
- On May 8, 2026, the in-flight cancellation iteration passed `.open-code/toolchain/node-v20.18.3-darwin-arm64/bin/npm run -w open-code-desktop check`, `.open-code/toolchain/node-v20.18.3-darwin-arm64/bin/npm run test:desktop:preview`, `npm run lint`, `npm run build`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci` through the sandboxed toolchain environment.
- On May 8, 2026, the structured worker edit iteration passed `cargo test -p open-code-logic` with 22 tests covering exact linked-file reads, safe writes, no-op rejection, stale-file rejection, worktree scope rejection, and unlinked-file rejection.
- On May 8, 2026, `npm run -w open-code-desktop check` passed after wiring the desktop model loop to structured JSON edit generation and guarded backend apply.
- On May 8, 2026, the review-closeout iteration passed `cargo test -p open-code-logic` with 25 tests covering merged/rejected review closeout and `npm run -w open-code-desktop check` with no Svelte diagnostics.
- On May 8, 2026, the cancellation iteration added guarded running-card cancellation in the Rust logic core, Tauri backend, Svelte desktop UI, and browser preview. Validation passed for `cargo test -p open-code-logic`, `npm run test:desktop:preview`, `npm run -w open-code-desktop check`, `npm run lint`, `npm run build`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci`; the memory daemon HTTP probe kept the expected non-strict localhost skip in this sandbox.
- On May 8, 2026, the reset-for-retry iteration added guarded reset for blocked rejected, failed, or cancelled desktop worker runs. Validation passed for `cargo test -p open-code-logic`, `npm run test:desktop:preview`, `npm run -w open-code-desktop check`, `npm run lint`, `npm run build`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci`. The first E2E run caught Rust 1.85-incompatible `str::as_str()` calls in logic hunk generation; those were fixed and the gate passed. Direct `cargo check --manifest-path packages/desktop/src-tauri/Cargo.toml` remained blocked by crates.io DNS resolution in this sandbox.
- On May 8, 2026, the merge-closeout iteration added production Tauri git closeout for accepted review runs and cleared active card branch/worktree state after merge. Validation passed for `cargo test -p open-code-logic`, `npm run test:desktop:preview`, `npm run -w open-code-desktop check`, `npm run lint`, `npm run build`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci`. `npm run test` remained blocked by the invalid cached macOS VS Code test app, after extension TypeScript and compiled unit tests passed; direct Tauri `cargo check` remained blocked by crates.io DNS/offline cache limits.
- On May 8, 2026, the hunk-metadata iteration added persisted review hunk ranges for structured worker edits and rendered them in desktop/preview inspectors. Validation passed for `cargo test -p open-code-logic`, `npm run test:desktop:preview`, `npm run -w open-code-desktop check`, `npm run lint`, `npm run build`, `git diff --check`, and `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e:ci`; the memory daemon probe kept the expected non-strict localhost skip in this sandbox.
- `npm run test:memoryd:probe` is wired into the E2E matrix. In this Codex sandbox it reports a non-strict skip because localhost listener startup returns `Operation not permitted`; run `OPEN_CODE_MEMORYD_PROBE_STRICT=1 npm run test:memoryd:probe` on a release-capable Mac/Linux host.
- Still release-host only here: full `npm run test:e2e:ci` with VS Code GUI smoke, `npm run test:e2e:model` with a reachable Ollama/Gemma runtime, and strict `OPEN_CODE_MEMORYD_PROBE_STRICT=1 npm run test:memoryd:probe`.
- Blocked in this sandbox: `cargo fmt --check` and `cargo clippy` because the sandboxed Rust toolchain lacks `rustfmt` and `clippy`.
- In the Codex sandbox, direct Cargo/npm commands need `.open-code/toolchain/env.sh` or equivalent `CARGO_HOME`, `RUSTUP_HOME`, and `PATH` values.
