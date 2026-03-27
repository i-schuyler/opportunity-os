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
- issue-to-PR implementation slices

## Must require manual review
The following must not auto-merge and must remain draft-or-reviewed work:
- authentication changes
- billing changes
- schema migrations
- GitHub workflow changes
- privacy or legal copy
- destructive data handling
- outbound email logic changes
- any change that expands secret access or automation privileges

## Merge rule
Auto-merge is allowed only when all are true:
- risk is low
- CI is green
- scope is narrow
- no protected area was touched
- PR body includes required fields
- branch protection remains intact

## Issue-to-PR trigger rule
Real Codex runs are intentionally gated to avoid accidental spend.

A Codex issue-to-PR run may start only when one of these is true:
- the issue is opened/reopened with the `codex` label already present, or
- a collaborator comments `/codex`, or
- a collaborator comments `/retry`

Adding the `codex` label after issue creation does not auto-start a run; use `/codex` or `/retry`.

## Draft PR rule
Codex-created PRs are created as draft PRs by default. This preserves a low-oversight workflow without allowing silent merge of high-consequence changes.

## Recovery rule
If issue automation fails, recover existing work first. Check for recoverable remote branches before retrying automation.

## Budget rule
Keep the Codex model and effort configurable through repository variables so cost can be reduced without changing workflow files.
