#!/usr/bin/env bash
set -euo pipefail

ISSUE_NUMBER=${1:?Usage: ./scripts/diagnose-codex-issue.sh <issue-number>}

echo "== Workflows =="
gh workflow list

echo
echo "== Recent runs for codex-issue-to-pr =="
gh run list --workflow codex-issue-to-pr --limit 10 || true

echo
echo "== Issue comments =="
gh issue view "$ISSUE_NUMBER" --comments

echo
echo "== Remote Codex branches =="
git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune >/dev/null 2>&1 || true
git branch -r | grep 'origin/codex/issue-' || true
# scripts/diagnose-codex-issue.sh EOF
