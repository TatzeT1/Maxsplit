---
tags: [feature, admin, auth]
---

# Admin Panel

Auth gate: `src/lib/auth/admin.ts`. Server Actions: `src/lib/actions/admin.ts`. Pages:
`src/app/(app)/admin/**`. Read helpers: `src/lib/admin/{groups,users,stats}.ts`.

## Who is an admin — one hardcoded email

```ts
const ADMIN_EMAILS = ["max123.tietz@gmail.com"];
```

There is no admin role stored in Firestore and no admin-granting UI — admin status is a
single hardcoded allowlist checked against the **session's email**, not a database flag. If
the product ever needs more than one admin, this is the file to change, and it should almost
certainly move to something less hardcoded at that point (an env var at minimum, a Firestore-
backed role more robustly).

> [!warning] `emailVerified` is not optional here
> `isAdminSession` requires `session.emailVerified === true` **in addition to** the email
> match. Without that gate, an attacker could register `max123.tietz@gmail.com` via bare
> email/password sign-up (which never confirms the address, so `email_verified: false`) and
> inherit full admin. Google Sign-In always sets `email_verified: true`, so the real admin is
> never affected by this check — it only ever blocks an *unverified* claim of that email. See
> the same pattern generalized in [[Two Auth States]] and the `Session.emailVerified` doc
> comment in `src/lib/auth/session.ts`.

## Two different gates for two different call sites

- `requireAdminSession()` — for **pages** (Server Components). Calls `notFound()` (404, not a
  redirect) on failure, so a non-admin poking at `/admin` sees a plain 404, not a "you're not
  allowed" page that confirms the route exists.
- `requireAdminActionSession()` (private, inside `admin.ts`) — for **Server Actions**, which
  run inside a client-driven request/response cycle rather than a page render and so can't
  call `notFound()`. Returns `null` instead, and the caller turns that into
  `{ ok: false, error: "forbidden" }`.

Both ultimately call the same `isAdminSession(session)` predicate — don't reimplement the
check a third way if you add a new admin surface.

## What admin can do

- `adminDeleteGroup` / `adminSetGroupArchived` — moderate any group, bypassing the
  owner-only checks normal group deletion/editing requires.
- `adminSetUserBanned` — see below.
- `adminResetOnboarding` — clears `onboardingCompletedAt` so the setup guide auto-shows again
  on next sign-in (support / testing the first-run flow against a real account).

## Banning a user, precisely

`adminSetUserBanned` deliberately does **not** touch group memberships or expense/settlement
history — removing a banned user from their groups would leave balances that no longer sum to
zero (the [[Money Invariants]] zero-sum property). Instead:

1. `adminAuth.updateUser(uid, { disabled: banned })` — blocks future sign-ins.
2. `adminAuth.revokeRefreshTokens(uid)` when banning — kills the **current** session cookie
   too, since `getSession()` verifies with `checkRevoked: true`.
3. `users/{uid}.banned` is set as a Firestore flag — this is what `firestore.rules`'
   `isBanned()` checks on every gated read (see [[Firestore Rules]]), closing the up-to-an-
   hour window where an already-issued, not-yet-expired ID token could otherwise still pass
   rules checks even after the Auth account is disabled.

An admin **cannot ban themselves** (`"cannot-ban-self"`) or ban another admin
(`"cannot-ban-admin"`, checked via `isAdminEmail` on the target's stored email).

## Related
[[Two Auth States]] · [[Firestore Rules]] · [[Money Invariants]] · [[Groups and Members]]
