# Release and distribution

Before treating any artifact as GA-ready, review and resolve the blocker list in [GA_RELEASE_READINESS.md](GA_RELEASE_READINESS.md). The current repository can pass source-level MVP checks, but the GA path still requires the product shell, real worker, runtime packaging, signing, and strict release-machine E2E work called out there.

## Reproducible build

1. `npm install`
2. `. .open-code/toolchain/env.sh` if you are using the sandboxed toolchain.
3. `cargo fmt --check` and `cargo clippy --workspace --all-targets -- -D warnings` with `rustfmt` and `clippy` installed.
4. `OPEN_CODE_MEMORYD_PROBE_STRICT=1 npm run test:memoryd:probe` on a host that can bind localhost.
5. `npm run test:e2e` on a Mac/Linux machine with Ollama and the target local Gemma model ready.
6. `npm run build`
7. `npm run package`

## Open VSX

Publish the generated `.vsix` to [Open VSX](https://open-vsx.org/) under your namespace after you have an access token. This repo uses publisher `open-code` in the extension `package.json`; change it to a namespace you own before publishing.

## Desktop product

For a full branded Electron app, merge this extension into a **Code-OSS fork** and follow [FORK_AND_RELEASE.md](FORK_AND_RELEASE.md): reproducible build docs, signed binaries where required, changelog and attribution, extension strategy (Open VSX first), credential policy.

## Model packaging

Default open model: **Gemma 3 4B** on **localhost** (Ollama-compatible or your bundled `llama.cpp` sidecar). The extension default is `gemma3:4b` for the MVP bootstrap, and the current MVP manifest lives at [`runtime/model-manifest.json`](../runtime/model-manifest.json). **Pin** exact model artifacts and checksums in your server manifest before a consumer desktop release. First-run model download should be **only** from your updater, not a separate end-user Ollama install, when you ship a consumer build.

## Credentials

Store API keys in the OS keychain; memory stores **metadata** only. See [SECURITY.md](SECURITY.md).
