# GA release readiness

Last reviewed: 2026-05-07.

This repository is not ready for a GA consumer release. The current tree is a bootstrap/MVP implementation: a Svelte/Tauri logic workspace scaffold, a VS Code extension prototype, Rust logic and memory crates, and documented local Gemma/Ollama readiness paths. The immediate target should be a production-ready source MVP, followed by a GA desktop distribution once the blockers below are closed.

## Current verification snapshot

The strict release gate is still a fully provisioned run:

```bash
npm install
. .open-code/toolchain/env.sh
npm run lint
npm run -w open-code-vscode-extension test:unit
npm run test:desktop:preview
cargo test --workspace --all-targets
npm run test:memoryd:probe
npm run build
npm run package
npm run test:e2e
```

Observed on 2026-05-07; revalidated in the 14:01 UTC automation run:

- `npm run lint`: passed; extension TypeScript and Svelte diagnostics returned no errors or warnings.
- `npm run -w open-code-vscode-extension test:unit`: passed; provider, sanitizer, and diff hunk unit tests passed without opening network listeners.
- `npm run test:desktop:preview`: passed; 18 preview logic tests, the UI contract test, and the synthetic 360-card performance test passed.
- `cargo test --workspace --all-targets`: passed; 11 logic tests and 4 memory tests passed.
- `npm run test:memoryd:probe`: passed with approved localhost access; latest full E2E run observed startup in 461.6 ms and API probe completion in 70.0 ms. In the default Codex sandbox without localhost access, it reports a skipped probe because listener startup fails with `Operation not permitted`; in CI or with `OPEN_CODE_MEMORYD_PROBE_STRICT=1`, that condition is a hard failure.
- `npm run build`: passed; extension compile, desktop Vite build, and Rust memory daemon build passed.
- `npm run package`: passed; generated a 26.89 KB VSIX with 19 files and no `.vscode-test` cache payload.
- `OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e`: passed through the repo sandboxed toolchain with approved localhost access; this covered bootstrap/docs, extension TypeScript, extension unit tests, desktop Svelte, preview workflows, workspace build, VSIX packaging, Rust logic tests, Rust memory tests, memory daemon HTTP behavior, and local Gemma/Ollama readiness.
- `npm run test:e2e`: passed after removing the invalid cached macOS VS Code test host under `packages/extension/.vscode-test/` and allowing `@vscode/test-electron` to download VS Code 1.119.0.
- `npm run test:e2e:model`: passed with Ollama reachable at `http://127.0.0.1:11434`; installed models included `gemma3:4b` and `gemma4:latest`, and `gemma3:4b` returned the readiness response.
- `cargo fmt --check` and `cargo clippy --workspace --all-targets -- -D warnings`: blocked because the sandboxed Rust toolchain does not have `rustfmt` or `clippy` installed.
- Bare `npm` and `cargo` are unavailable on the initial PATH in this shell, but the E2E runner can find the repo sandboxed Node/Rust toolchain under `.open-code/toolchain`.

Fixes made during this review:

- Normalized Ollama/Gemma base URLs so `127.0.0.1` and `http://localhost` resolve to the expected local port `11434`.
- Made extension model health report "not ready" when the selected model is missing.
- Added timeout handling and HTTPS-capable request dispatch to the extension local model provider.
- Preserved non-fenced model output in the agent review path through a tested sanitizer instead of trimming file content.
- Made `runAgentOnActiveEditor` return the VS Code progress promise.
- Added Autodrive webview CSP and nonce handling.
- Prevented Autodrive from getting stuck busy when memory or discriminator writes fail.
- Added extension provider/unit coverage and desktop preview performance coverage.
- Added a memory daemon HTTP integration/performance probe and wired it into the E2E matrix; CI/release runs should use strict mode so localhost listener failures block release.
- Tightened VSIX packaging with extension license metadata, `.vscodeignore`, and a packaged Apache license file.
- Added VSIX packaging to the E2E readiness matrix so packaging regressions block source-level readiness runs.
- Cleared the invalid cached macOS VS Code test host and proved extension activation against a freshly downloaded VS Code 1.119.0 test host.

## GA blockers

### P0 blockers

1. Product shell is not GA-grade.
   - There is no branded Code-OSS/Electron desktop fork or signed production desktop distribution.
   - The Tauri app is a useful logic workspace scaffold, not the final consumer shell.

2. Real agent worker is incomplete.
   - The desktop flow starts/plans card worktrees, but model-backed implementation does not yet edit linked files in the worktree and record a full `agentRuns[]` result from the production worker path.
   - Preview runs can remain simulated when the model is offline, but GA cannot rely on simulated edits for core workflows.

3. Runtime packaging is unresolved.
   - Ollama is the MVP path. GA needs an app-managed local runtime sidecar or a fully guided first-run runtime setup.
   - Model tags such as `gemma3:4b` are mutable; GA release manifests need exact artifact URLs, sizes, checksums, licenses, and notices.

4. Release signing and distribution are missing.
   - Desktop artifacts need reproducible builds, macOS signing/notarization where applicable, Linux package artifacts, checksums, and published release notes.
   - The VSIX/Open VSX path must use an owned publisher namespace before public release.

5. Release E2E still needs CI/release-host hardening.
   - The full local E2E matrix now passes on this machine with approved localhost, network, and GUI access.
   - CI and release machines still need strict `OPEN_CODE_MEMORYD_PROBE_STRICT=1` coverage, a GUI-capable VS Code smoke path, and a pinned local model proof before tagging.

### P1 blockers

1. First-run readiness UX is not product-grade.
   - Users need guided remediation for missing memory daemon, missing runtime, missing model, disk-space failures, and permission failures.

2. Autodrive safety controls need hard gates.
   - GA needs explicit session scope, step budget, tool allowlists, confirmation gates, cancellation, and an obvious action timeline before agent file/tool actions.

3. Review UX is not complete enough for GA.
   - Hunk review exists in the extension prototype, but GA still needs a dedicated review tree, inline decorations, stale-document detection everywhere, and logic-by-logic review connected to the desktop card model.

4. Credential and memory audit trails are incomplete.
   - Secret values use secure storage in the extension path, but credential usage audit metadata and full memory retention/export/delete policy are not production-complete.

5. CI/release coverage needs hardening.
   - CI should run the strict no-model matrix on macOS and Linux, package artifacts, start/probe `open-code-memoryd`, and run a release-machine local model proof before tagging.

### P2 blockers

1. Performance baselines are too shallow.
   - Current checks prove small source builds and unit tests, but not long-running agent latency, memory growth, large-repo logic graphs, or local model throughput.

2. Accessibility and UI acceptance need product QA.
   - The current UI has typed/Svelte checks and a static contract test, but needs keyboard, screen-reader, focus, resize, and visual regression coverage.

3. Security process needs a public release owner.
   - `docs/SECURITY.md` is a baseline. Public GA needs a real disclosure contact, supported versions, and incident response process.

## Execution plans by remaining gap

### 1. Final product shell

Goal: ship one clear primary desktop experience instead of a scaffold plus prototype.

Steps:

1. Decide the GA shell: Tauri logic workspace, Code-OSS/Electron fork, VS Code extension, or a staged combination.
2. Write the GA product contract: supported platforms, minimum memory/disk, model/runtime policy, first-run behavior, update channel, and what "offline ready" means.
3. Convert the chosen shell into an installable product: app identity, icons, window lifecycle, settings storage, update checks, crash/error surfaces, and data locations.
4. Connect the shell to the real logic project lifecycle: open project, save project, regenerate paper, start/stop agent work, review changes, merge/export result.
5. Remove or label prototype-only paths so users never confuse simulated preview behavior with production agent behavior.

Exit criteria:

- A fresh user can install and open the app without development tools.
- The first screen is the actual workspace, not a demo harness.
- The app has a single documented data directory and recovery story.

Verification:

- Installed-artifact launch on clean macOS and Linux machines.
- Fresh project open/save/reopen smoke test.
- Manual product acceptance pass against the release-candidate checklist.

### 2. Real agent worker

Goal: make card execution produce real model-backed file changes in isolated worktrees.

Steps:

1. Define the worker contract: inputs, allowed files/tools, model config, timeout/budget, conflicts, outputs, and failure states.
2. Implement the ready-card execution path from `logicProject` card metadata into a clean branch/worktree.
3. Build prompts from card intent, linked files, dependencies, current conflict report, and relevant memory.
4. Apply bounded edits through a structured patch path; reject edits outside scope, stale files, unsafe paths, and oversized changes.
5. Persist `agentRuns[]` with model ID, prompt summary, started/finished timestamps, branch/worktree, proposed changes, diagnostics, conflicts, and final state.
6. Add cancel/resume behavior and clear failure recovery for model offline, invalid patch, dirty worktree, and merge conflicts.

Exit criteria:

- A ready card can move from planned to running to reviewable with real file changes.
- Human-gated logic conflicts block before model execution.
- Every worker action is replayable from persisted run metadata.

Verification:

- Unit tests for scope checks, stale-file rejection, run-state transitions, and failure recovery.
- Integration test that creates a card worktree, applies a small model/stub edit, and records `agentRuns[]`.
- E2E flow: start card, inspect proposed diff, accept/reject hunks, merge or abandon.

### 3. Runtime packaging

Goal: replace "bring your own Ollama" with a GA-grade runtime and model provisioning story.

Steps:

1. Choose the GA runtime path: app-managed Ollama, bundled sidecar, or guided external runtime for the first release.
2. Pin model artifacts in a release manifest with URLs, sizes, checksums, quantization, license, notices, and minimum hardware requirements.
3. Implement first-run checks for runtime presence, model presence, disk space, network availability, checksum verification, and license display.
4. Add offline and degraded states: model missing, runtime stopped, download interrupted, checksum mismatch, insufficient disk, unsupported CPU/GPU.
5. Ensure runtime configuration is stored outside secrets and can be reset without deleting project memory.

Exit criteria:

- A fresh install can reach a ready local-model state through documented app-controlled steps.
- Model downloads are verified before use.
- Failure modes produce actionable remediation, not raw stack traces.

Verification:

- `npm run test:e2e:model` against the pinned default model.
- First-run tests for missing runtime, missing model, bad checksum, interrupted download, and offline startup.
- License/notice audit before release tagging.

### 4. Signing and distribution

Goal: produce trusted, reproducible artifacts users can install and verify.

Steps:

1. Define artifact set: macOS app or DMG, Linux packages/AppImage/tarball, VSIX/Open VSX package if the extension ships, checksums, SBOM, and release notes.
2. Configure macOS signing and notarization with documented certificate, entitlements, hardened runtime, and notarization commands.
3. Configure Linux package metadata, desktop entry, icons, permissions, and dependency policy.
4. Move VSIX publishing to an owned publisher namespace and document `VSCE_PAT`/Open VSX token handling.
5. Generate checksums and attach dependency inventory/SBOM for every release artifact.

Exit criteria:

- Users can install artifacts without bypassing OS trust warnings.
- Artifacts are reproducible from a documented tag.
- Public release notes name the exact build, model/runtime assumptions, and known limitations.

Verification:

- Clean-machine install on each supported OS.
- Signature/notarization verification commands pass.
- VSIX install/activation passes from the packaged artifact, not only from source.

### 5. Release CI

Goal: make release readiness repeatable on clean infrastructure, not just one developer machine.

Steps:

1. Add macOS and Linux CI jobs for install, lint, extension unit, desktop preview, Rust tests, build, package, and `git diff --check`.
2. Run `OPEN_CODE_MEMORYD_PROBE_STRICT=1 npm run test:memoryd:probe` on hosts that can bind localhost.
3. Run VS Code/Electron smoke tests in GUI-capable environments; use `xvfb-run` on Linux.
4. Add a release-machine job or manual required gate for pinned local-model E2E.
5. Publish artifacts only from protected tags after required checks pass.
6. Store CI logs and artifact checksums as release evidence.

Exit criteria:

- A release tag cannot publish while lint, tests, packaging, strict memoryd probe, or extension smoke fail.
- Local model proof is required before GA tagging, even if skipped in ordinary CI.

Verification:

- Green release-candidate workflow on a clean tag.
- Failed-check simulation proves artifact publishing is blocked.
- Release notes link to the exact CI run and checksum bundle.

### 6. Product safety and UX

Goal: make agent behavior bounded, inspectable, cancelable, and recoverable.

Steps:

1. Add session scope, file allowlists, tool allowlists, write budgets, model-call budgets, and explicit confirmation gates.
2. Persist an action timeline with model calls, file reads/writes, shell/tool attempts, approvals, cancellations, and errors.
3. Implement cancellation that stops queued work, marks current state honestly, and leaves the worktree inspectable.
4. Add first-run remediation for missing memory daemon, missing runtime, missing model, disk-space failures, permission failures, and corrupt project files.
5. Add memory controls: retention policy, export, delete, project-level clear, and schema migration/corruption recovery.
6. Add credential audit metadata for privileged actions without storing plaintext secrets.

Exit criteria:

- Users can tell what the agent did, stop it, and undo or reject its proposed changes.
- Privileged actions require explicit scope and leave audit metadata.
- Data deletion/export behavior is documented and tested.

Verification:

- Safety tests for cancellation, budget exhaustion, out-of-scope file edits, stale applies, and credential-reference logging.
- First-run tests for runtime/model/memory failure states.
- Manual UX pass focused on recovery paths, not happy paths.

### 7. QA depth

Goal: move from smoke confidence to product confidence.

Steps:

1. Add accessibility coverage for keyboard navigation, focus order, labels, screen-reader names, contrast, resize, and reduced-motion behavior.
2. Add visual regression snapshots for the workspace, card states, conflict review, generated documentation, first-run states, and review flows.
3. Expand large-project tests beyond the 360-card synthetic graph to include many topics, dependency cycles, file overlaps, and long generated documents.
4. Add sustained agent-runtime tests for repeated model calls, memory growth, long sessions, cancellation, and repeated apply/reject cycles.
5. Record performance budgets for cold start, warm start, model first token, total agent latency, memory daemon throughput, conflict detection, peak RSS, and packaged artifact size.

Exit criteria:

- Release candidates fail when accessibility, visual, performance, or long-running stability budgets regress.
- QA covers happy paths, failure paths, and repeated-use paths.

Verification:

- Automated accessibility and visual-regression reports attached to RCs.
- Long-running agent soak test on target hardware.
- Performance trend file updated for every release candidate.

### 8. Toolchain polish

Goal: remove local environment ambiguity from release gates.

Steps:

1. Install `rustfmt` and `clippy` into the sandboxed Rust toolchain, or update the installer to provision them automatically.
2. Add explicit release scripts for `cargo fmt --check` and `cargo clippy --workspace --all-targets -- -D warnings`.
3. Make bare-toolchain expectations clear: either source `.open-code/toolchain/env.sh` or use scripts that find the sandboxed tools.
4. Add a bootstrap check that reports missing formatter/linter components before release gates begin.
5. Document the supported Node, npm, Rust, and OS versions in the release guide.

Exit criteria:

- `cargo fmt --check` and `cargo clippy --workspace --all-targets -- -D warnings` pass on a clean release host.
- The bootstrap flow tells contributors exactly how to fix missing local tools.

Verification:

- Clean checkout runs `npm run lint`, Rust fmt, Rust clippy, tests, build, package, and E2E without manual PATH spelunking.
- CI has the same toolchain component coverage as local release machines.

## Release candidate checklist

Run this checklist before every release candidate:

1. Fresh-machine install.
2. First-run model readiness.
3. Open/edit/save logic project.
4. Start card agent.
5. Apply/reject hunks.
6. Resolve logic conflict.
7. Merge or export result.
8. Clear/export memory.
9. Uninstall/reinstall without data loss surprises.

## Test plan for release candidates

- Unit: Rust logic, Rust memory, preview logic, model selection, URL normalization, diff hunk computation, credential reference normalization.
- Integration: Tauri load/save/render/start-agent commands, memory daemon HTTP API, extension command registration, model health checks.
- E2E: strict `npm run test:e2e` with local Gemma installed, plus a fresh-user first-run flow.
- Packaging: desktop app launch from installed artifact, VSIX install/activation, Open VSX package validation if publishing the extension.
- Safety: cancellation, stale file apply rejection, blocked human logic conflict, missing dependency resolution, model offline simulation labeling.
- Performance: cold start, build time, memory daemon startup, conflict detection on large graphs, agent latency, memory growth over repeated agent runs.

## Performance baseline from this review

- The desktop preview performance test covers conflict detection and generated documentation rendering on a synthetic 360-card graph; final verification runs observed single-digit to low-double-digit milliseconds for conflict detection and low single-digit milliseconds for documentation rendering in this environment.
- The sandboxed desktop Vite production build completed in about 321 ms to 504 ms across final E2E verification runs after warm caches.
- The memory daemon HTTP probe passed with approved localhost access; the latest strict E2E run observed startup in 461.6 ms and API probe completion in 70.0 ms.
- The local Gemma/Ollama readiness probe passed against `gemma3:4b`, but no GA runtime performance claim can be made until sustained model throughput, memory daemon throughput, and packaged desktop profiling run on target hardware.

## Documentation updates required before GA

- Replace placeholder security contact and supported-version policy in `docs/SECURITY.md`.
- Add final model artifact URLs, checksums, sizes, and notices to `runtime/model-manifest.json` or a release manifest.
- Add signed artifact names, checksum publication steps, and notarization/package commands to `docs/RELEASE.md`.
- Add first-run recovery docs for runtime/model/memory failures.
- Keep this document current for each release candidate and move resolved blockers into release notes.
