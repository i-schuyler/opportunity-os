# Codex Runtime Artifacts

`.github/codex/` and `.github/prompts/_runtime_*.md` are workflow runtime artifacts, not source files.

Policy:
- Do not commit them.
- Keep checked-in prompts only if they are intentional static templates.
- Runtime prompt rendering should use `$RUNNER_TEMP`.
- Codex home/state should use `${{ runner.temp }}`.

If these files appear locally, run:

```bash
./scripts/cleanup-codex-runtime-artifacts.sh
```
