# app/README.md

This directory contains the static web app shell and signed-in scaffolding for Opportunity OS.

## Files
- `index.html`: landing shell and CTA links
- `auth.html`: mock/dev-safe auth entry page
- `dashboard.html`: signed-in dashboard with mock-backed opportunity CRUD
- `auth.js`: auth page behavior for mock session sign-in
- `dashboard.js`: dashboard guard, local CRUD render/actions, sign-out
- `styles.css`: shared shell styling
- `main.js`: landing-page footer year behavior

Notes:
- Auth supports a minimal real server-session path via `/api/auth/session` plus a separate mock preview mode.
- Mock auth is fail-closed by default and only runs when `?mockAuth=1` is present in the auth/dashboard URL.
- Mock auth remains dev-only and is not a production security boundary.
- Billing and workflow files remain untouched.
