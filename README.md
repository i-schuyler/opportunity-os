# Opportunity OS

Revenue-first, human-benefiting web platform for opportunity seekers.
Public-readable repo; hosted service is the product.

## v0.1 focus
- Broad brand: Opportunity OS
- Lead example: housing + barter opportunities
- Audience: individuals
- Goal: fastest path to revenue with strong automation rails
- Pricing: free tier, $9/month, $79 founder lifetime (cap: 50)

## Product promise
Put every opportunity in one place, get clear next steps, and stop dropping the ball.

## Repo posture
This repository is public-readable for transparency and story value.
Unless and until a license is added, no open-source reuse rights are granted.

## v0.1 features
- Sign in
- Save and manage opportunities
- Track link, contact, deadline, status, tags, notes
- Save response templates
- Generate draft replies
- Weekly AI summary
- Billing gate for premium features

## Automation loop
Issue -> Codex PR -> CI gates -> merge

## Billing API runtime adapter
The repo now includes a minimal Node runtime adapter at `server/index.mjs` that exposes:
- `GET /api/entitlements`
- `POST /api/billing/checkout-session`
- `POST /api/billing/webhook/stripe`

Required runtime configuration for real monthly checkout testing:
- `BILLING_SESSION_SECRET` for trusted signed-session cookie identity
- `APP_BASE_URL` (or `BILLING_BASE_URL`) for checkout success/cancel return URLs
- `STRIPE_SECRET_KEY` and `STRIPE_MONTHLY_PRICE_ID` for checkout-session creation
- `STRIPE_WEBHOOK_SECRET` for Stripe webhook signature verification
- `BILLING_STORE_FILE` plus file-system access in explicit real/prod-like mode

Notes:
- Billing routes derive user identity from a server-verified signed cookie, not client user-id headers.
- Session cookie name is `opportunity_os_session` with value `<base64url({"userId":"..."})>.<hmac_sha256_hex(payload, BILLING_SESSION_SECRET)>`.
- Missing auth or required billing/webhook config fails closed.
- Founder lifetime automation remains deferred; monthly subscription is the only real checkout path in this slice.
- Static serving from `server/index.mjs` is intentionally narrowed to app assets (`/`, `/app/*`, root-level app files like `/auth.html`) plus browser-required client helpers (`/lib/auth-scaffold.js`, `/lib/opportunity-model.js`).
- Internal server/billing source files under `/lib/*` are not publicly served.

Run locally with `npm start`.

## Re-entry hint
Read in this order:
1. docs/PROJECT_INSTRUCTIONS_FOR_CHATGPT.md
2. docs/FOUNDING_SPEC.md
3. ACCEPTANCE.md
4. docs/AUTOMATION_POLICY.md
5. docs/DECISIONS_SNAPSHOT.md
6. docs/ASSUMPTIONS_REGISTRY.md
