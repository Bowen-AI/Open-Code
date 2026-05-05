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
- Agent edit loop can propose a whole-file replacement, compute line hunks, open a native VS Code diff, block stale applies, and apply all or selected hunks through `WorkspaceEdit`.
- Basic memory clear/show commands exist for the current project id.
- Hunk proposals, accepted/rejected hunk ids, stale blocks, and latest-change reverts are logged to raw memory for change tracking.
- Partial discriminator exists with mindset toggles and prompt/edit/commit hooks that write critic summaries to memory.
- The Mac/Linux installer can bootstrap missing Node/Rust tools into ignored `.open-code/toolchain/`, build the extension and memory daemon, write `.open-code/toolchain/env.sh`, pull `gemma3:4b` when Ollama is installed, and verify one local model response.
- `npm run test:e2e` is the strict local readiness matrix across docs/bootstrap, desktop, extension, Rust logic/memory, and local Gemma via Ollama. `npm run test:e2e:ci` skips only the multi-GB model call.
- CI builds/checks Rust and TypeScript on Ubuntu and macOS. A dependency-free bootstrap check verifies core commands, docs, tests, manifest, and model defaults. `@vscode/test-electron` activation smoke tests are wired into the extension test script.

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
- Dedicated hunk review UI and stronger conflict-safe patch application.
- Rich user-facing action timeline beyond latest-change revert.
- Ordered memory migrations, explicit scopes, retention/export/delete controls, and vector retrieval.
- Broader `@vscode/test-electron` workflow tests beyond activation.

### Can Be Improved

- The current hunk selector uses QuickPick; a review tree plus inline decorations would feel closer to Cursor.
- The hunk diff is dependency-free and line-based; later work should use a proven diff/patch library or VS Code-native review model if available.
- Health output is useful for agents but should become a first-run guided readiness flow for users.
- The installer now bootstraps Node/Rust into a sandbox, but product install should also hide Ollama/runtime details and surface plain recovery actions.
- CI should package the VSIX and smoke-test the memory daemon binary on both Ubuntu and macOS.

### Vulnerabilities / Security Risks

- Raw memory can contain file paths, diffs, prompts, and tool output; treat the SQLite database as sensitive user data.
- No retention/export/delete policy exists beyond clearing the current project id.
- Secret values can be stored in VS Code SecretStorage, but credential usage audit metadata is not implemented yet.
- MVP model pulls are runtime-managed by Ollama; non-Ollama release downloads are not checksum-verified yet.
- The local HTTP services should stay bound to `127.0.0.1`; do not widen binding without authentication and threat modeling.

### Latest Validation

- On May 5, 2026, `scripts/install-mvp-macos-linux.sh` completed on macOS with no system `npm`, `cargo`, or `rustc`: it bootstrapped Node/Rust into `.open-code/toolchain/`, installed JavaScript dependencies, built the extension, built the desktop app, built the Rust logic/memory crates, pulled `gemma3:4b` through Ollama, and verified a local model response.
- Verified locally: `npm run build`, `npm run check:desktop`, `npm run test:desktop:preview`, `npm run test:logic`, `npm run test:rust:required`, `npm run test:e2e:model`, and the `@vscode/test-electron` activation smoke test.
- In the Codex sandbox, direct Cargo commands need `CARGO_HOME` and `RUSTUP_HOME` pointed at `.open-code/toolchain/`; the VS Code Electron smoke test needs host-level launch permission.
