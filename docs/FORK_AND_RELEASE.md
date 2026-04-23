# Fork + Release Guide

This guide covers both ways to launch Open Code from Code-OSS while keeping it releasable.

## Option A — Connected Fork (recommended for easier sync)

1. Create a GitHub fork from `microsoft/vscode`.
2. Keep `origin` as your repo and add:

```bash
git remote add upstream https://github.com/microsoft/vscode.git
git fetch upstream
```

3. Create your main product branch from upstream:

```bash
git checkout -b open-code/main upstream/main
git push -u origin open-code/main
```

4. Periodically sync:

```bash
git fetch upstream
git checkout open-code/main
git rebase upstream/main
git push --force-with-lease origin open-code/main
```

## Option B — Detached/Independent Fork

Use this if you do **not** want permanent `upstream` wiring.

1. Import Code-OSS history into your repository baseline.
2. Remove or avoid `upstream` remote.
3. Pull upstream changes on your own cadence (manual mirror/import).

You are still a downstream fork in engineering terms as long as your code lineage is from Code-OSS.

## Release Baseline

Before public release:

- reproducible build docs
- signed binaries where required
- changelog + attribution discipline
- security policy and disclosure process
- extension strategy (Open VSX first)
- explicit credential handling policy (no plaintext secrets)

## Definition of Releasable

Open Code is releasable when:

- Code-OSS lineage is documented,
- branch governance is clear,
- agent edit/review loop is stable,
- memory behavior is explicit and revocable,
- desktop artifacts are reproducible and publishable.
