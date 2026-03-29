# BILLING_AND_ENTITLEMENTS_PLAN.md

## Goal
Enable the first real paid conversion with the smallest safe slice, while keeping current local/mock subscription preview behavior for development.

## Non-goals for this slice
- No broad billing platform build-out.
- No pricing experiments or packaging redesign.
- No workflow/automation trigger changes.
- No destructive migration of existing user data.

## Product boundary (v0.1 billing slice)

### Free plan
- Up to 10 active opportunities.
- Core dashboard CRUD remains available.
- Paid-gated features remain locked:
  - import/export
  - bulk actions
  - next best actions panel

### Paid subscription ($9/month)
- Unlimited active opportunities.
- Unlock import/export, bulk actions, and next best actions.

### Founder lifetime ($79)
- Same entitlements as paid subscription.
- No recurring billing.
- Limited to first 50 founders.

### First 50 founders rule
- First implementation slice uses a conservative, auditable check:
  - Stripe-side product/price separation for founder lifetime.
  - Manual operator verification of founder-count threshold before enabling checkout link in production.
- Automated cap enforcement can follow in a later slice after first successful conversion path is stable.

## Entitlement model

### Source of truth
- Real entitlement source of truth: server-side entitlement record tied to authenticated user.
- Local URL params remain development-only preview controls and never become production entitlement truth.

### Minimal entitlement states
- `free`
- `paid_subscription_active`
- `paid_founder_lifetime`
- `unknown` (transient read/lookup failure state)

### Effective access mapping
- `free` -> free boundary.
- `paid_subscription_active` -> paid boundary.
- `paid_founder_lifetime` -> paid boundary.
- `unknown` -> fail closed to free boundary, with non-blocking messaging.

### Relation to current mock preview
- Keep current local preview path for development/testing only.
- Paid preview via URL requires explicit mock enablement (for example `?mockAuth=1&mockPlan=paid`).
- Real billing slice should keep this mock path isolated from real entitlements.

## Billing implementation sequence (smallest safe order)

1. **Server-side entitlement read path (no purchase yet)**
- Add authenticated entitlement lookup endpoint/path.
- Wire dashboard entitlement resolution to server state with fail-closed fallback.

2. **Monthly checkout path**
- Add minimal checkout session creation for monthly plan.
- Keep one success URL and one cancel URL.
- On success return, show pending/confirming state until entitlement read reflects paid state.

3. **Webhook entitlement update path**
- Process checkout completion events.
- Persist entitlement state transitions idempotently.
- Keep event handling narrow to required event types.

4. **Founder lifetime checkout path (after monthly path is stable)**
- Add one-time founder lifetime checkout path.
- Grant `paid_founder_lifetime` entitlement on successful payment.
- Keep founder cap handling conservative (manual gate first, automate later).

## Checkout/success/cancel behavior
- Checkout starts only from explicit upgrade action.
- Success URL:
  - returns user to dashboard,
  - shows "purchase processing" until entitlement refresh confirms paid state,
  - avoids optimistic unlock without entitlement confirmation.
- Cancel URL:
  - returns user to dashboard with neutral cancellation message,
  - leaves entitlement unchanged.

## First post-purchase UX
- Immediate dashboard refresh of entitlement status.
- Unlock paid features once entitlement state is paid.
- Preserve free experience if entitlement refresh is delayed or unavailable.

## Risk controls
- Must not ship in first slice:
  - tax/VAT complexity,
  - coupons/promotions,
  - team plans/seat management,
  - proration/plan switching,
  - refund automation,
  - billing portal complexity beyond minimal need.
- Keep reversible choices:
  - isolate entitlement checks behind a small adapter,
  - keep legacy local mock preview path available for development,
  - fail closed to free on unknown state.
- Keep manual/docs-first controls:
  - founder-cap go/no-go checklist,
  - runbook for webhook outage and replay.

## Verification plan before first live conversion

### Must-pass tests
- Entitlement resolution tests:
  - free, paid subscription, paid founder, unknown fallback.
- Gating tests:
  - paid features unlock only on paid entitlements,
  - free limits still enforced when entitlement is free/unknown.
- Checkout path tests:
  - session creation request validation,
  - success/cancel return behavior,
  - webhook idempotency for entitlement update.

### Minimum smoke tests (pre-production)
- Complete one monthly checkout in test mode and confirm entitlement unlock.
- Confirm canceled checkout does not unlock.
- Confirm webhook retry/replay does not duplicate or corrupt entitlement state.
- Confirm unknown entitlement read falls back to free and does not crash UI.

### May remain mock/local-only temporarily
- Founder lifetime automated cap enforcement (manual gate acceptable initially).
- Advanced billing portal self-serve flows.
- Non-critical billing analytics dashboards.

## Proposed first implementation slice after this plan
- Implement real server-side entitlement read + monthly checkout + webhook-driven paid entitlement update.
- Keep founder lifetime handling available but operationally conservative until monthly conversion path is proven.
