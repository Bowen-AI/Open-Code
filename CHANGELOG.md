# Changelog

## 0.1.0 (Unreleased)

- Initial VS Code extension: **Open Code Dark** color theme, optional **inline completions** (local Gemma if available), **Autodrive** webview, **Run agent** with built-in **diff** review and accept/reject, **clear/show memory** commands.
- Added **Open Code: Health** for memory/model status, selectable line-hunk apply, stale-apply blocking, and latest-change revert for proposed agent edits.
- Added Autodrive stop/cancel, SecretStorage credential-ref commands, sandboxed Mac/Linux toolchain bootstrap, and a Gemma 4 MVP model manifest.
- **Discriminator** on prompts/edits; **Run discriminator on commit message** when editing a commit buffer.
- Rust `open-code-memory` + `open-code-memoryd`: two-layer **SQLite** (raw + semantic), schema version record, HTTP on localhost, `Cargo.lock` and **Rust 1.85** toolchain.
- **CI** (fmt, clippy, test, build) now covers Ubuntu and macOS; bootstrap checks and `@vscode/test-electron` activation smoke test added; **fork-health** workflow preserved.
- Docs: **AGENT_HANDOFF**, **BUILD**, **GOVERNANCE**, **RELEASE**, **SECURITY**; **MVP_AND_ROADMAP** and **MVP_EXECUTION_PLAN**; **VSIX** via `npm run package` in workspace.
- Desktop logic workspace now records production notes-only `agentRuns[]` metadata from the Tauri path, including model/mode, prompt summary, branch/worktree, diagnostics, conflicts, scoped proposed changes, and linked-file scope validation.
- Desktop worker backend can apply structured linked-file replacements in the card worktree after branch/worktree matching, worktree-scope checks, linked-file scope checks, stale-file protection, no-op blocking, duplicate/path traversal rejection, and edit-size limiting.
- Desktop worker loop now reads linked files from the card worktree, asks the local Gemma/Ollama brain for structured JSON edits, applies valid edits through the guarded Tauri backend, and records failed or notes-only attempts without silently marking them mergeable.
- Desktop review closeout can mark the latest reviewable worker run merged or rejected through a guarded Tauri command, updating run/change status while preserving rejected worktrees for inspection.
- Desktop merged review closeout now commits proposed linked-file changes on the card branch, merges that branch into the project root, attempts scoped worktree/branch cleanup, preserves the run audit record, and clears active card branch/worktree metadata after merge.
- Desktop worker cancellation can stop a running card from the Tauri app or browser preview, abort in-flight Ollama calls, ignore late worker completions, record a `cancelled` agent run, move the card to `blocked`, and preserve branch/worktree metadata for recovery.
- Desktop reset-for-retry can return rejected, failed, or cancelled worker runs to `ready`, append an `abandoned` audit run with previous branch/worktree metadata, and clean up scoped agent worktrees/branches from the production Tauri path.
- Logic hunk generation now stays compatible with the repo Rust 1.85 toolchain during source-build E2E checks.
- Desktop structured worker edits now persist review hunk range metadata, propagate hunk status through merge/reject closeout, and show hunk summaries in the desktop and browser preview inspectors without storing raw diff text in the logic project.

## Attribution

Open Code is a downstream project; when you import Code-OSS, follow Microsoft and third-party notices as required by the [LICENSE](LICENSE) and upstream terms.
