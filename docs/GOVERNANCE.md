# Governance: fork and branches

## Recommended model: connected fork (Option A)

See [FORK_AND_RELEASE.md](FORK_AND_RELEASE.md). Open Code product work that lives **inside** the Code-OSS tree should use:

- **`upstream`** → `https://github.com/microsoft/vscode.git`
- **`origin`** → this repository (or your fork of it)
- **Product branch:** e.g. `open-code/main`, cut from `upstream/main` when you import history

Detached mode is allowed; document lineage in release notes if you omit `upstream`.

## This repository (bootstrap + extension)

Until Code-OSS history is merged, product code lives under `packages/` and `crates/` in this repo. When you promote into a full fork, move or merge these packages into the workbench/extension host layout described in [BUILD.md](BUILD.md).
