# AUTOMATION_POLICY.md

## Purpose
This repository uses an automation-first workflow while keeping human review on high-consequence changes.

## Allowed automation
AI may draft:
- code
- tests
- documentation
- copy
- low-risk UI changes
- analytics summaries

## Must require manual review
The following must not auto-merge:
- authentication changes
- billing changes
- schema migrations
- GitHub workflow changes
- privacy or legal copy
- destructive data handling
- outbound email logic changes

## Merge rule
Auto-merge is allowed only when all are true:
- risk is low
- CI is green
- scope is narrow
- no protected area was touched
- PR body includes required fields

## Recovery rule
If issue automation fails, recover existing work first. Check for recoverable remote branches before retrying automation.
