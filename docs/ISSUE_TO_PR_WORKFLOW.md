# docs/ISSUE_TO_PR_WORKFLOW.md

## Normal flow
1. Create or label an issue with `codex`, or comment `/codex`.
2. Workflow comments `Codex started…` on the issue.
3. Codex attempts the smallest valid slice.
4. If changes are produced, workflow pushes `codex/issue-<n>-<slug>` and opens a draft PR.
5. Workflow comments `PR created: <link>` on the issue.

## Recovery when nothing seems to happen
1. Check Actions tab for `codex-issue-to-pr`.
2. If the issue predated the workflow, comment `/retry` or `/codex`.
3. If Actions shows failure, inspect the run link from the issue comment.
4. Before retrying, check for a recoverable remote branch named `codex/issue-*`.
5. If the problem is workflow/plumbing related, prefer a manual branch + PR fix over retry.
6. If automation reports a skipped duplicate run, use the existing PR/run rather than retriggering.

## Placeholder payload failure mode
If an issue-to-PR run receives unresolved placeholder metadata (for example `${ISSUE_TITLE}` or `${ISSUE_BODY}`), treat it as workflow/input failure:
- fail fast and stop before Codex execution
- correct the issue payload source, then rerun with concrete issue metadata

## Why comments matter
The issue comments are the lowest-friction status surface:
- `Codex started…`
- `PR created: <link>`
- failure/recovery comment with Actions run URL

## PR review workflow
Non-draft PRs receive a Codex summary comment for a second-pass review.
