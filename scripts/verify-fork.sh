#!/usr/bin/env bash
set -euo pipefail

echo "== Open Code lineage verification =="

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "❌ Not inside a git repository"
  exit 1
fi

if git remote | grep -qx upstream; then
  upstream_url="$(git remote get-url upstream)"
  echo "ℹ️ Found upstream remote: $upstream_url"

  if [[ "$upstream_url" == *"github.com/microsoft/vscode"* ]]; then
    echo "✅ Upstream points to microsoft/vscode"
  else
    echo "⚠️ Upstream exists but is not microsoft/vscode"
  fi

  if git merge-base --is-ancestor upstream/main HEAD 2>/dev/null; then
    echo "✅ HEAD contains upstream/main ancestry"
  else
    echo "⚠️ Unable to confirm upstream/main ancestry from local refs"
  fi
else
  echo "ℹ️ No upstream remote configured (detached fork mode is allowed)"
  echo "⚠️ Ensure Code-OSS lineage is documented in release notes/repo docs"
fi

echo "✅ Verification completed"
