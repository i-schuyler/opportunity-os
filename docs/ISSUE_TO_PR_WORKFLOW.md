# ISSUE_TO_PR_WORKFLOW.md

## Purpose
This document defines the real Issue → Codex → Draft PR workflow for Opportunity OS.

## Trigger methods
The workflow will run when any of the following happen on an open issue:
- the issue is labeled `codex`
- a collaborator comments `/codex`
- a collaborator comments `/retry`

This avoids spending API credits on every issue automatically.

## What the workflow does
1. Checks out the default branch.
2. Builds a runtime prompt from the issue title/body plus repository docs.
3. Runs `openai/codex-action@v1` with repository-scoped settings.
4. If files changed, creates a branch.
5. Commits the changes.
6. Pushes the branch.
7. Opens a draft PR linked to the issue.
8. Comments back on the issue with the PR URL and Codex summary.

## Default repo variables
Set these as repository variables so you can tune behavior without editing the workflow:
- `CODEX_ALLOWED_USERS` → GitHub usernames allowed to trigger Codex if they do not already have write access
- `CODEX_MODEL` → default `gpt-5.3-codex`
- `CODEX_EFFORT` → default `medium`
- `CODEX_BRANCH_PREFIX` → default `codex`

## Required secret
Set this as a repository secret:
- `OPENAI_API_KEY`

## Expected branch pattern
- `codex/issue-<number>-<slug>`

## Safety posture
- sandbox mode: `workspace-write`
- safety strategy: `drop-sudo`
- PRs open as draft by default
- branch protection on `main` remains required

## Recommended human behavior
- Use `codex` label for a normal automation attempt.
- Use `/retry` only after reading the previous failure comment or failed run.
- Keep issues narrow and acceptance-based.
- Keep auth, billing, migration, workflow, and legal changes under manual review.
