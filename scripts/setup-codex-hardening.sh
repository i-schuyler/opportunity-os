#!/usr/bin/env bash
set -euo pipefail

OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo "Setting OPENAI_API_KEY secret for ${OWNER_REPO}"
gh secret set OPENAI_API_KEY

echo "Setting repository variables"
gh variable set CODEX_ALLOWED_USERS --body "i-schuyler"
gh variable set CODEX_MODEL --body "gpt-5.3-codex"
gh variable set CODEX_EFFORT --body "medium"
gh variable set CODEX_BRANCH_PREFIX --body "codex"

echo "Ensuring labels exist"
gh label create codex --color 1d76db --description "Ready for Codex issue-to-PR automation" 2>/dev/null || gh label edit codex --color 1d76db --description "Ready for Codex issue-to-PR automation"
gh label create needs-human-review --color d93f0b --description "Protected area or judgment-heavy change" 2>/dev/null || gh label edit needs-human-review --color d93f0b --description "Protected area or judgment-heavy change"
gh label create low-risk --color 0e8a16 --description "Narrow reversible change" 2>/dev/null || gh label edit low-risk --color 0e8a16 --description "Narrow reversible change"

echo "Done. Next: run ./scripts/apply-branch-protection.sh"
# scripts/setup-codex-hardening.sh EOF
