# SMOKE_TEST_SPEC.md

## CI smoke expectations
- `npm run lint` exits 0
- `npm test` exits 0
- `npm run build` exits 0

## Manual smoke for v0.1
1. Open landing page.
2. Confirm headline speaks to opportunity seekers generally.
3. Confirm housing/barter appears as the lead example.
4. Sign in.
5. Create an opportunity.
6. Edit the opportunity.
7. Archive the opportunity.
8. Save a template.
9. Generate a draft reply.
10. Confirm premium-gated screen appears for premium-only paths when unpaid.

## Weekly summary smoke
- Trigger scheduled or manual summary path.
- Confirm a summary object is generated without crashing.
