# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately to the maintainer through the contact options on [their GitHub profile](https://github.com/Thanatos9404) rather than opening a public issue. Include steps to reproduce and the impact you observed.

## How Exhale protects users

**Secrets**

- API keys (Gemini, Anthropic) exist only as server environment variables. They are never bundled, logged or returned.

**Input validation**

- Every request body is size-capped, content-type checked and parsed with zod schemas before use.

**Abuse limits**

- AI endpoints have per-client rate limits.
- The Claude fallback has a global per-minute budget.

**Prompt injection**

- User and household text is wrapped in tagged blocks and treated as data.
- Model output is schema-validated and filtered to known action ids.
- Output is rendered as text, with Markdown raw HTML disabled.

**Errors**

- Internal errors are logged server-side with a fixed prefix and returned to clients as generic messages with `Cache-Control: no-store`.

**Headers** (`vercel.json`)

- Content-Security-Policy, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and COOP.

**Privacy**

- Household data stays in the browser's storage, is re-validated when read and can be deleted from Settings.
- Coordinates are rounded to about 1 km before any request.

## Supported versions

Only the `main` branch, deployed at https://exhale-air.vercel.app, receives fixes.
