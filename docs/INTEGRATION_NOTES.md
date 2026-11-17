# Integration notes

## Backends (neither was shipped; contracts taken from what the legacy UIs call)
- A (VulnWatch): `/api/*`, `/auth/github`, SSE `/api/events`. Proxied via `/api/a/*` -> `VULNWATCH_API_URL` (default http://localhost:3001).
- B (SecureDevOps): `/api/webhooks/{info,activity,test-fetch,simulate,events}`. Proxied via `/api/b/*` -> `SECUREDEVOPS_API_URL` (default http://localhost:4000).

## Verified vs unknown
Verified only against `mock-backends/` (sample data). NOT verified against real servers.
Unknown: whether A and B are one server; A's real port; OAuth callback URL; whether A's scan-repo returns packages[]/lockfile data.

## Intentionally omitted (no backend support)
PR fix generation, false-positive dismissal, org switcher, Smee latency.

## Security
- Rotate the webhook secret that appeared in the original files (`dghdfhsdfjsfgjsfgjf`). It is not used or rendered anywhere in this app.
- Fix commands are only shown for plain npm package/version tokens; external links are http(s) only.

## Cleanup
`legacy/` holds the original code. Delete it after you confirm feature parity.
