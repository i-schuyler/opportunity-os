#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

rm -rf .github/codex
rm -f .github/prompts/_runtime_*.md

git rm -r --cached .github/codex 2>/dev/null || true
git rm --cached .github/prompts/_runtime_*.md 2>/dev/null || true

echo "Removed local Codex runtime artifacts and unstaged cached runtime files if present."
# cleanup-codex-runtime-artifacts.sh EOF
