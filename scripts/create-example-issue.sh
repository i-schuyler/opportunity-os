#!/usr/bin/env bash
# scripts/create-example-issue.sh
set -euo pipefail

gh issue create   --title "feat: bootstrap web app shell"   --label feature   --label v0.1   --body $'Request
Create the first web app shell for Opportunity OS.

Context
This should establish the initial app structure without adding billing or AI integrations yet.

Acceptance criteria
1. A basic app shell exists.
2. The repo still passes ./ci.sh.
3. No billing, auth, or schema migrations are introduced in this slice.

Test plan
- Run ./ci.sh
- Verify placeholder app structure exists

Risk
low'
# scripts/create-example-issue.sh EOF
