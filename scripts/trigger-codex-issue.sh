#!/usr/bin/env bash
# scripts/trigger-codex-issue.sh
set -euo pipefail

ISSUE_NUMBER=${1:?Usage: ./scripts/trigger-codex-issue.sh <issue-number>}

echo "Adding codex label to issue #${ISSUE_NUMBER}"
gh issue edit "$ISSUE_NUMBER" --add-label codex

echo "Posting /codex trigger comment"
gh issue comment "$ISSUE_NUMBER" --body "/codex"
# scripts/trigger-codex-issue.sh EOF
