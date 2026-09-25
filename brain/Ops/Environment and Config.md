---
tags: [ops, config, env, firebase]
---

# Environment and Config

Reference: `.env.example`. Client config + validation: `src/lib/firebase/config.ts`. Build-time
gate: `next.config.ts`.

## Every env var

| Var | Public? | Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | yes | Firebase client config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | Firebase client config |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | yes | `"true"` routes the **client** SDK at local emulators |
| `FIREBASE_AUTH_EMULATOR_HOST` | no | Admin SDK auto-detects this standard name → routes server-side Auth calls to the emulator |
| `FIRESTORE_EMULATOR_HOST` | no | same, for Firestore |
| `FIREBASE_STORAGE_EMULATOR_HOST` | no | same, for Storage |
| `FIREBASE_SERVICE_ACCOUNT_KEY_BASE64` | no | base64-encoded service account JSON, powers `firebase-admin` |
| `CRON_SECRET` | no | Bearer token Vercel Cron sends automatically — see [[Recurring Expenses]] |

Only set the three `*_EMULATOR_HOST` vars **together with**
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` — the client flag and the server-side host vars are
two independent switches that need to point the same direction, or the client talks to the
emulator while the Admin SDK talks to production (or vice versa).

## `NEXT_PUBLIC_*` vars are inlined at build time, not read at runtime

This is the single most consequential fact about this app's config, and it's called out at
length in AGENTS.md — repeating the load-bearing parts here:

> [!danger] Changing a `NEXT_PUBLIC_*` var in Vercel requires a rebuild with build cache
> disabled. A cached redeploy silently keeps the old value baked into the client bundle.

A **well-formed but wrong** value is the dangerous failure mode, not a missing one — it fails
far from its cause. Production once had the storage bucket
(`split-f54a5.firebasestorage.app`) pasted into `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. Auth kept
working (it only needs `apiKey` + `authDomain`), so sign-in looked completely healthy, while
every Firestore listener addressed a project that doesn't exist and got rejected with
`permission-denied` — which (before `reportSnapshotError` existed, see
[[Two Auth States]]) rendered as a silent, permanent loading skeleton.

## The build-time gate

`config.ts`'s `validateFirebaseClientConfig` format-checks all six Firebase vars (project id
is bare lowercase-alphanumeric-hyphen, auth domain and storage bucket look like hostnames not
paths, sender id is numeric, app id contains a colon) — encoding exactly the realistic
copy-paste swaps between these six values that have actually happened. `next.config.ts` calls
`assertFirebaseClientEnvFormat()` at module load, so a malformed (but present) value **fails
the build** with the offending variable named, rather than shipping a broken deployment that
looks healthy. **Extend these checks when you find a new failure mode; don't remove them** —
per AGENTS.md, this is exactly the mechanism meant to survive the next version of this bug.

An **absent** var is deliberately left to `requireEnv`'s runtime error (`"Missing required
environment variable: X"`) rather than failing at this build-time gate — so cloning the repo
without a `.env.local` yet still gets a clear, familiar error instead of a config-load crash
somewhere unrelated.

## Related
[[Two Auth States]] · [[Deployment and Production Debugging]] · [[Local Development and Testing]]
