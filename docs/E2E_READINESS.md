# E2E Readiness

This is the current end-to-end contract for the Open Code bootstrap: after a fresh Mac/Linux checkout, a developer should be able to run one installer, prepare a local Gemma model, and prove that the logic workspace, desktop shell, extension, Rust services, documentation contract, and local model path are usable.

## Fresh Mac/Linux Download

```bash
git clone https://github.com/Bowen-AI/Open-Code.git
cd Open-Code
scripts/install-mvp-macos-linux.sh
. .open-code/toolchain/env.sh
npm run test:e2e
```

What the installer does:

- Installs missing Node.js and Rust into `.open-code/toolchain/`.
- Writes `.open-code/toolchain/env.sh` so later shells can reuse the sandboxed toolchain.
- Installs JavaScript dependencies.
- Builds the VS Code extension, desktop app, Rust logic core, and Rust memory daemon.
- Pulls `gemma3:4b` through Ollama when Ollama is installed.
- Sends one local readiness prompt to the pulled model.

Ollama is the MVP runtime path. If Ollama is not installed, the installer still builds the app and prints the platform-specific Ollama install step. Rerun the installer after installing Ollama to pull and verify the model.

## E2E Streams

`npm run test:e2e` runs the strict local readiness matrix:

| Stream | Command covered | What it proves |
| --- | --- | --- |
| Bootstrap/docs contract | `npm run check:bootstrap` | Required docs, commands, model defaults, and starter logic files are present. |
| Extension TypeScript | `npm run -w open-code-vscode-extension check` | Extension code typechecks. |
| Extension provider unit | `npm run -w open-code-vscode-extension test:unit` | Local model URL normalization, health readiness, chat fallback, diff hunk, and sanitizer behavior pass without launching VS Code. |
| Desktop Svelte contract | `npm run check:desktop` | Desktop Svelte/TypeScript code has no diagnostics. |
| Desktop preview workflows | `npm run test:desktop:preview` | Logic-card workflows, docs rendering, conflict review, model selector behavior, UI contract, and synthetic graph performance pass. |
| Workspace build | `npm run build` | Extension, desktop, Rust logic, and memory daemon build together. |
| Extension package | `npm run package` | VSIX packaging succeeds and excludes local test caches/build junk. |
| Logic core | `npm run test:logic` | Rust logic-card coordinator behavior passes. |
| Memory daemon | `npm run test:rust:required` | Rust memory schema and append path pass. |
| Memory daemon HTTP probe | `npm run test:memoryd:probe` | Starts `open-code-memoryd`, probes localhost health/append/recent/semantic/clear, and records startup/API latency. |
| VS Code extension activation | `npm run -w open-code-vscode-extension test` | VS Code can load the extension and see core commands. |
| Local Gemma model | `npm run test:e2e:model` | Ollama is reachable, the configured model is installed, and the local model returns a response. |

Useful variants:

```bash
npm run test:e2e:ci
OPEN_CODE_E2E_SKIP_EXTENSION=1 npm run test:e2e
OPEN_CODE_MEMORYD_PROBE_STRICT=1 npm run test:memoryd:probe
OPEN_CODE_E2E_PULL_MODEL=1 npm run test:e2e:model
OPEN_CODE_E2E_MODEL=gemma3:12b npm run test:e2e:model
```

- `test:e2e:ci` skips the actual local model call so CI does not download multi-GB weights.
- `OPEN_CODE_E2E_SKIP_EXTENSION=1` is for environments that cannot launch Electron/VS Code.
- `OPEN_CODE_MEMORYD_PROBE_STRICT=1` requires the memory daemon localhost listener probe to pass; CI also runs it in strict mode whenever `CI` is set.
- `OPEN_CODE_E2E_PULL_MODEL=1` lets the model E2E pull the configured Ollama model if it is missing.
- `OPEN_CODE_E2E_MODEL` overrides the model under test; the default is `gemma3:4b`.

## CI Rule

CI should run the full matrix except the actual model download. That still validates every code stream and keeps the expensive local-model proof available for release machines and developer laptops:

```bash
npm run test:e2e:ci
```

On Linux CI, wrap the VS Code smoke test with `xvfb-run` because the test host is an Electron app.

On macOS, if `packages/extension/test/runTest.mjs` reports an invalid cached VS Code code signature, remove `packages/extension/.vscode-test/vscode-darwin-arm64-*` and rerun in a network-enabled, GUI-capable environment so `@vscode/test-electron` can download a fresh test host. The unit and no-extension E2E streams can still run without launching Electron.

## Current Limit

This is still an MVP bootstrap, not a signed consumer desktop release. The strict E2E path proves the documented local Ollama/Gemma flow works from source. The product release path still needs a bundled or managed inference runtime, pinned model artifacts, checksums, signing/notarization, and a first-run GUI that hides runtime setup from end users.
