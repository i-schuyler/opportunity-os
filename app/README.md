# app/README.md

This directory contains the static web app shell and signed-in scaffolding for Opportunity OS.

## Files
- `index.html`: landing shell and CTA links
- `auth.html`: mock/dev-safe auth entry page
- `dashboard.html`: signed-in dashboard placeholder
- `auth.js`: auth page behavior for mock session sign-in
- `dashboard.js`: dashboard guard, placeholder render, sign-out
- `styles.css`: shared shell styling
- `main.js`: landing-page footer year behavior

Notes:
- Auth is scaffolded with a browser-session placeholder until real auth is wired.
- Mock auth is fail-closed by default and only runs when `?mockAuth=1` is present in the auth/dashboard URL.
- Billing and workflow files remain untouched.
