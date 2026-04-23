# Building Open Code (bootstrap layout)

For **MVP status, missing pieces, and product suggestions** (Gemma packaging, hunk review, mindsets, memory layers), see [MVP_AND_ROADMAP.md](MVP_AND_ROADMAP.md).

## Prerequisites

- **Node.js** 20+
- **Rust** 1.85+ (stable), `cargo`, `rustc` — for `crates/open-code-memory` (see [rust-toolchain.toml](../rust-toolchain.toml))
- **VS Code** or **VSCodium** for extension development

No Ollama or other local LLM installs are required for development; the default **Gemma** profile targets `http://127.0.0.1` and is satisfied by a stub in dev or your packaged runtime later.

## Install

```bash
npm install
```

## Build everything

```bash
npm run build
```

This compiles the VS Code extension (`packages/extension`) and the Rust memory daemon (`crates/open-code-memory`).

## Run the memory daemon (optional, for manual testing)

```bash
npm run memoryd -- --data-dir /tmp/open-code-memory
```

## Develop the extension

```bash
npm run watch
```

In VS Code: **Run and Debug** → **Run Extension** (see `.vscode/launch.json`).

## Full Code-OSS fork (later)

1. Add `upstream` per [FORK_AND_RELEASE.md](FORK_AND_RELEASE.md).
2. Copy or submodule this repo’s `packages/extension` into your fork’s `extensions/open-code` (or equivalent).
3. Register the extension in your product’s `product.json` / build if you ship a branded app.

See [RELEASE.md](RELEASE.md) for packaging and Open VSX.
