# Changelog

## 0.1.0 (Unreleased)

- Initial VS Code extension: **Open Code Dark** color theme, optional **inline completions** (local Gemma if available), **Autodrive** webview, **Run agent** with built-in **diff** review and accept/reject, **clear/show memory** commands.
- Added **Open Code: Health** for memory/model status, selectable line-hunk apply, stale-apply blocking, and latest-change revert for proposed agent edits.
- Added Autodrive stop/cancel, SecretStorage credential-ref commands, sandboxed Mac/Linux toolchain bootstrap, and a Gemma 4 MVP model manifest.
- **Discriminator** on prompts/edits; **Run discriminator on commit message** when editing a commit buffer.
- Rust `open-code-memory` + `open-code-memoryd`: two-layer **SQLite** (raw + semantic), schema version record, HTTP on localhost, `Cargo.lock` and **Rust 1.85** toolchain.
- **CI** (fmt, clippy, test, build) now covers Ubuntu and macOS; bootstrap checks and `@vscode/test-electron` activation smoke test added; **fork-health** workflow preserved.
- Docs: **AGENT_HANDOFF**, **BUILD**, **GOVERNANCE**, **RELEASE**, **SECURITY**; **MVP_AND_ROADMAP** and **MVP_EXECUTION_PLAN**; **VSIX** via `npm run package` in workspace.

## Attribution

Open Code is a downstream project; when you import Code-OSS, follow Microsoft and third-party notices as required by the [LICENSE](LICENSE) and upstream terms.
