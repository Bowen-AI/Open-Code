# Release and distribution

## Reproducible build

1. `npm install`
2. `npm run test:e2e` on a Mac/Linux machine with Ollama and the target local Gemma model ready.
3. `npm run build` (TypeScript extension + Rust `open-code-memoryd` if `cargo` is in `PATH`)
4. Extension VSIX: `cd packages/extension && npx @vscode/vsce package` (install `@vscode/vsce` dev dependency if you prefer it scripted)

## Open VSX

Publish the generated `.vsix` to [Open VSX](https://open-vsx.org/) under your namespace after you have an access token. This repo uses publisher `open-code` in the extension `package.json`; change it to a namespace you own before publishing.

## Desktop product

For a full branded Electron app, merge this extension into a **Code-OSS fork** and follow [FORK_AND_RELEASE.md](FORK_AND_RELEASE.md): reproducible build docs, signed binaries where required, changelog and attribution, extension strategy (Open VSX first), credential policy.

## Model packaging

Default open model: **Gemma 3 4B** on **localhost** (Ollama-compatible or your bundled `llama.cpp` sidecar). The extension default is `gemma3:4b` for the MVP bootstrap, and the current MVP manifest lives at [`runtime/model-manifest.json`](../runtime/model-manifest.json). **Pin** exact model artifacts and checksums in your server manifest before a consumer desktop release. First-run model download should be **only** from your updater, not a separate end-user Ollama install, when you ship a consumer build.

## Credentials

Store API keys in the OS keychain; memory stores **metadata** only. See [SECURITY.md](SECURITY.md).
