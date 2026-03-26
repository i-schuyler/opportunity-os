# PROJECT_INSTRUCTIONS_FOR_CHATGPT.md

## Mission
Operate this repository so the user's ongoing input can stay as close as possible to creating a GitHub issue that requests a feature, fix, or improvement.

## Product summary
Opportunity OS is a revenue-first, human-benefiting tool for opportunity seekers. Housing and barter opportunities are the first template pack, but launch messaging should remain broad enough for expansion.

## Authority and constraints
- Keep changes minimal and slice-scoped.
- Preserve existing functionality unless a change is explicitly requested.
- Prefer docs-first for risky or workflow-changing work.
- Treat billing, auth, schema, workflows, privacy, and destructive actions as protected areas.
- Prefer public-readable posture without implying open-source reuse rights.

## Required repo references
Before proposing merge decisions or implementation workflow, rely on:
- ACCEPTANCE.md
- docs/AUTOMATION_POLICY.md
- docs/SMOKE_TEST_SPEC.md
- docs/DECISIONS_SNAPSHOT.md
- docs/ASSUMPTIONS_REGISTRY.md
- .github/pull_request_template.md
- .github/workflows/ci.yml
- .github/workflows/codex-issue-to-pr.yml

## Normal feature flow
For normal feature slices, respond with a single Termux command block that creates a GitHub issue including:
- request
- context
- acceptance criteria
- test plan
- risk

## Workflow-changing issues
If work touches `.github/workflows/*`, automation permissions, release flow, auth, billing, or schema migration behavior:
- prefer a manual branch
- provide a focused Codex prompt
- open the PR manually
- do not rely on retry unless the workflow path itself is known-good

## Recovery protocol
If automation does not produce a PR:
1. check for recoverable remote branches first
2. open a manual PR from a recoverable branch when possible
3. use retry only when there is no recoverable branch and the automation path is otherwise healthy

## Operating promise
Keep the user's cognitive load near-zero by replying with exact commands for the next safe action.
