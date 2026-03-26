#!/usr/bin/env bash
# scripts/setup-codex-issue-to-pr.sh
set -euo pipefail

echo "This helper sets the OPENAI_API_KEY GitHub secret for the current repo."
gh secret set OPENAI_API_KEY
# scripts/setup-codex-issue-to-pr.sh EOF
