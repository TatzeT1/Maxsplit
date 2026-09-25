---
tags: [architecture, auth, gotcha]
---

# Two Auth States

> [!danger] This has burned a full debugging session before
> Conflating these two is the single most expensive mistake to make in this codebase.
> A correct display name in the header proves the **cookie** is good. It says **nothing**
> about whether client Firestore reads work.

Split has two completely independent notions of "am I signed in":

| | server session cookie | client Firebase Auth |
|---|---|---|
| Set by | `POST /api/auth/session` (`src/app/api/auth/session/route.ts`) | `signInWithPopup` (client SDK) |
| Read by | `getSession()` in Server Components / Server Actions | `useCurrentUser()` / `useAuthState()` (`src/lib/firebase/use-current-user.ts`) |
| Gates | route access (`(app)/layout.tsx` redirects to `/` if absent), the app header/sidebar | every `onSnapshot` listener in every page |
| Lifetime | up to 14 days (Firebase max); this app sets 5 days (`SESSION_EXPIRES_IN_MS`) | tied to the client SDK's own persisted session / refresh token |

## Why they can desync

The cookie is minted once, server-side, from an ID token at sign-in time. The client SDK's
own session is separately persisted in the browser and can be evicted (private browsing,
storage clearing, an expired refresh token) **without the cookie knowing anything happened**.
Result: `(app)/layout.tsx` lets the request through (cookie valid), but every
`onSnapshot` listener in the page fails or never resolves, because `useCurrentUser()` returns
`null`.

Before [[#The fix — SessionGuard]] existed, this desync rendered as a **permanent loading
skeleton with no error** — visually identical to "still loading." See
[[#Never swallow a Firestore listener error]] below for the sibling bug this pattern created.

## The fix — SessionGuard

`src/components/session-guard.tsx` wraps every page under `(app)/layout.tsx`. It watches
`useAuthState()` (which distinguishes `"loading" | "authenticated" | "unauthenticated"` —
plain `user === null` from `useCurrentUser()` collapses "not resolved yet" and "confirmed
signed out" into the same value, which is exactly the ambiguity that hid this bug). On
`"unauthenticated"` it signs out (clearing both the stale cookie and the dead client
session) and the sign-out flow sends the user back to `/` to sign in fresh. This is the same
recovery a human would do manually — the guard just does it automatically instead of
stranding them on a silent skeleton.

## Diagnosing a bug that looks auth-related

1. Is it "the page loads but data never appears"? → suspect client Firebase Auth
   (`useCurrentUser()`), not the cookie. Check `useAuthState().status`.
2. Is it "the page redirects to `/` unexpectedly" or "the header shows the wrong user"? →
   suspect the session cookie (`getSession()` server-side).
3. **Never assume one implies the other is fine.** Check both explicitly.

## Never swallow a Firestore listener error

Related but distinct rule, same root cause class: `onSnapshot` error callbacks used to drop
`permission-denied` silently to avoid console noise during the sign-out race. That made a
*genuine* rules rejection or a *misconfigured project id* pixel-identical to "still loading."
It hid a wrong `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in production for an entire session (see
[[Environment and Config]]).

The fix, `reportSnapshotError` (`src/lib/firebase/snapshot-error.ts`): always log and return
the error code; suppress sign-out noise by gating the **render** of the error on "is there a
current user" (not by discarding the error itself). The general rule this encodes:

> [!warning] A failure state must never be indistinguishable from a loading state.

This applies everywhere in the app, not just auth — if you add a new listener or a new async
flow, make sure "it failed" and "it's still working" are visually distinct.

## Related
[[Data Access Pattern]] · [[Mobile iOS Quirks]] (a different "looks the same, isn't" class of bug)
