# ASSUMPTIONS_REGISTRY.md

- [LOCKED] The project is a product business rather than a services business.
- [LOCKED] The initial audience is individuals.
- [LOCKED] The initial product shape is a tool.
- [LOCKED] Fastest path to revenue outranks broader mission breadth for v0.1.
- [LOCKED] Opportunity OS is the product brand.
- [LOCKED] Housing and barter opportunities are the first template pack.
- [LOCKED] Launch messaging should address opportunity seekers generally.
- [LOCKED] The repository may be public-readable.
- [LOCKED] The project should not be implicitly open-source.
- [LOCKED] Launch pricing should include monthly plus founder lifetime.
- [LOCKED] Founder lifetime should be capped to the first 50 customers.
- [TENTATIVE] The first implementation stack will use Next.js, Supabase, Stripe, and Vercel.
- [TENTATIVE] Initial AI features should be limited to drafting and weekly summaries.
- [TENTATIVE] Until real auth is wired, the app shell may use a browser-session mock sign-in to keep slices reversible.
- [TENTATIVE] Mock-auth scaffolding is explicitly enabled per URL via `?mockAuth=1` and remains fail-closed when absent.
- [TENTATIVE] If an issue-to-PR run receives unresolved placeholder metadata (for example `${ISSUE_TITLE}` and `${ISSUE_BODY}`), default to a docs-only clarification and avoid speculative product code changes until a concrete issue payload is provided.
- [TENTATIVE] When placeholder issue metadata is detected, the safest reversible default is a docs-only update to workflow guidance plus a request for concrete issue content before product changes.
