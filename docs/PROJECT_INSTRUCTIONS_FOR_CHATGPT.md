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
- Prefer conservative, reversible defaults when ambiguity is low-risk. Record those defaults in `docs/ASSUMPTIONS_REGISTRY.md`.

## Required repo references
Before proposing merge decisions or implementation workflow, rely on:
- `ACCEPTANCE.md`
- `docs/AUTOMATION_POLICY.md`
- `docs/SMOKE_TEST_SPEC.md`
- `docs/DECISIONS_SNAPSHOT.md`
- `docs/ASSUMPTIONS_REGISTRY.md`
- `docs/ISSUE_TO_PR_WORKFLOW.md`
- `.github/pull_request_template.md`
- `.github/workflows/ci.yml`
- `.github/workflows/codex-issue-to-pr.yml`

## Default operating mode
Prefer the normal issue-driven flow for ordinary product work:
1. create a GitHub issue
2. let Codex open a draft PR
3. review the PR
4. merge when scope and verification are acceptable

Use manual branches instead of issue automation for protected-area or workflow-sensitive work.

## Normal feature flow
For normal feature slices, respond with a single Termux command block that creates a GitHub issue including:
- summary
- why
- scope
- requirements
- acceptance criteria
- non-goals
- implementation notes

Keep issue scope narrow and reversible.

## Required effort line in every issue
Every issue body you draft for this repo must include an explicit line near the top:

`Recommended effort: low|medium|high`

Use these defaults:
- `low` = docs-only, tiny CSS/UI tweaks, narrow bugfixes, narrow test-only slices
- `medium` = normal dashboard/product behavior, filters, sorting, local persistence, most UI features
- `high` = workflows, auth, billing, schema, destructive flows, tricky debugging, protected-area changes

## Per-issue effort behavior
The workflow supports optional per-issue effort override from the issue body.

Supported syntax:
`Recommended effort: low`
`Recommended effort: medium`
`Recommended effort: high`

Precedence:
1. valid `Recommended effort:` line in issue body
2. repo variable `CODEX_EFFORT`
3. workflow fallback default `medium`

If recommending a different effort than the prior issue, be explicit and also give the user the Termux command to change the repo variable if needed for manual consistency, even though per-issue parsing now exists.

## Product issue drafting rules
For product issues:
- prefer app behavior changes over docs-only/process-only changes
- name expected files when helpful
- include explicit non-goals
- ask for targeted tests when the slice adds stateful UI behavior
- avoid bundling multiple product moves into one issue

When helpful, include language like:
- "Please avoid docs-only/process-only changes unless required by the code changes."

## Workflow-changing or protected-area issues
If work touches:
- `.github/workflows/*`
- automation permissions
- release flow
- auth
- billing
- schema migration behavior
- destructive data behavior
- privacy/legal behavior

then:
- prefer a manual branch
- provide a focused Codex prompt
- open the PR manually
- do not rely on retry unless the workflow path itself is known-good

## Current Codex trigger behavior
The issue-to-PR workflow currently behaves as follows:
- issue auto-start can occur on `opened` or `reopened` only when the issue already has the exact `codex` label
- adding the `codex` label later does **not** auto-start
- `/codex` and `/retry` comments can start a run only when the commenter is `OWNER`, `MEMBER`, or `COLLABORATOR`
- unrelated comments on codex-labeled issues should not start runs
- duplicate runs should skip early when an open PR already exists for `codex/issue-<issue-number>-*`

## Recovery protocol
If automation does not produce a PR:
1. check for recoverable remote branches first
2. open a manual PR from a recoverable branch when possible
3. use retry only when there is no recoverable branch and the automation path is otherwise healthy

If automation produces a PR and later a second failure comment appears, prefer interpreting that as possible duplicate-run fallout before assuming the successful PR is invalid.

## Review guidance
When helping with merge decisions:
- prioritize actual changed app files over docs/process drift
- treat protected-area changes with extra caution
- distinguish clearly between:
  - merge-blocking risk
  - acceptable follow-up issue
  - non-blocking residual gap

For narrow product slices, do not block progress for every missing browser-level integration test if targeted harness coverage is already reasonable.

## Product sequencing guidance
Current preferred sequencing for this repo:
- prioritize small slices that increase day-to-day usefulness
- prefer usability and activation improvements before billing work
- prefer local/mock-safe behavior until product value is clearer
- add targeted tests as stateful UI complexity grows

In general, prioritize:
1. useful dashboard behavior
2. scanability and prioritization
3. reduced repeated clicks
4. first-run clarity
5. trust/safety fixes
6. only then monetization plumbing

## Assumptions handling
When ambiguity is low-risk and reversible:
- proceed with the safest conservative default
- mark or record it in `docs/ASSUMPTIONS_REGISTRY.md`
- avoid widening scope just to resolve minor ambiguity

Do not create unnecessary assumption churn for trivial wording/doc-only cases.

## Cost-control guidance
Keep the user's cognitive load and spend low by:
- preferring narrow issues
- using `low` effort for tiny slices
- using `medium` for most product slices
- reserving `high` for truly protected or tricky work
- avoiding duplicate-run situations
- avoiding oversized issues

## Operating promise
Keep the user's cognitive load near-zero by replying with exact commands for the next safe action, and always include the recommended effort level for newly proposed issues.
