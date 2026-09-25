---
tags: [ops, deployment, vercel, debugging]
---

# Deployment and Production Debugging

Hosting: Vercel, auto-deploy from GitHub `main`. Cron: `vercel.json`. Security headers:
`next.config.ts`.

## Deployment pipeline (from the original project brief)

- `main` protected; feature branches → PR → preview deploy.
- Env vars set for **both** Production and Preview in Vercel.
- `NEXT_PUBLIC_FIREBASE_*` client vars are public by design; `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64`
  and `CRON_SECRET` are non-public, base64/secret, never committed to the repo (`.env.local`
  stays gitignored, `.env.example` is the committed template — see [[Environment and Config]]).
- Deploying rule changes: `pnpm exec firebase deploy --only firestore:rules,storage` — rules
  are **not** deployed automatically by `next build`/Vercel; that's a separate, explicit step.

### The Firebase Auth authorized-domains gotcha

Firebase Auth only allows sign-in from domains listed under Authentication → Settings →
Authorized domains. Vercel preview URLs are randomly generated per deploy and **will break
Google sign-in** on preview deployments unless solved deliberately (e.g. a stable preview
alias domain added to the authorized list). If `docs/DEPLOYMENT.md` exists, it has the exact
console steps; if it doesn't yet, this is a known gap flagged in the original project brief,
not something to assume is already solved.

## Security headers (`next.config.ts`)

Applied to every route via `headers()`:

| Header | Value | Why |
|---|---|---|
| `X-Frame-Options` | `DENY` | money actions + the public settlement PDF must never render inside a frame |
| `Content-Security-Policy` | `frame-ancestors 'none'` | same clickjacking concern, belt-and-suspenders |
| `X-Content-Type-Options` | `nosniff` | standard MIME-sniffing hardening |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | standard |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | app is HTTPS-only on Vercel; long max-age + preload opts the apex domain into the browser preload list |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | no route needs any of these — deny outright |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` | **not** the standard strict COOP — see below |

> [!warning] No full CSP, deliberately
> A strict Content-Security-Policy has to be tuned against Firebase Auth/Firestore origins,
> Next's inline bootstrap script, and the app's own styling — shipping a wrong one *silently
> breaks auth*. This is tracked as a deliberate gap, not guessed at. Don't add a strict CSP
> without testing sign-in end-to-end against it.

The COOP override exists because **Vercel's platform default is a stricter COOP that silently
blocks `signInWithPopup`**: the opener tab can no longer poll `window.closed` on the popup, so
`onAuthStateChanged` never fires client-side — even though the server session cookie was set
correctly. This is its own flavor of the [[Two Auth States]] desync (cookie fine, client Auth
never resolves) but caused by an infra header rather than a client bug.

## Debugging production — the prescribed order

Per AGENTS.md, **get signal before forming theories**, in this order:

1. **Read the deployed bundle** for inlined config — don't infer what's running from the
   Vercel dashboard, which can lag or be misread:
   ```sh
   curl -s https://maxsplit-ten.vercel.app/ \
     | grep -oE 'src="/_next/static/[^"]*\.js"'   # then curl a chunk and grep
   ```
   This is the only reliable way to know what `NEXT_PUBLIC_*` values a given deployment
   actually baked in — see [[Environment and Config]] for why that matters so much here.
2. **`get_runtime_errors` / `get_deployment_build_logs`** (Vercel tooling) for server-side
   failures.
3. **Only then** reason about the client.

> [!warning] Runtime errors are attributed to the deployment that produced them
> Check `lastDeployment` before assuming a runtime error is current — an error from a stale
> deployment can otherwise look like an active, ongoing incident.

## Related
[[Environment and Config]] · [[Two Auth States]] · [[Recurring Expenses]] (the cron job deployed here) · [[Design System and Theming]] (headers)
