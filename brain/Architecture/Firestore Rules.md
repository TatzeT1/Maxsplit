---
tags: [architecture, firestore, security]
---

# Firestore Rules

File: `firestore.rules`. Storage rules (`storage.rules`) are currently a blanket deny-all
placeholder — Storage isn't in active use (see [[Settlement PDF Export]] for why receipts/PDF
generation avoid it).

## The posture: deny-by-default, read-gate, write-backstop

Per [[Data Access Pattern]], writes are supposed to go exclusively through Server Actions
using `firebase-admin`, which **bypasses these rules entirely**. So the rules file has two
jobs, not one:

1. **Gate realtime client reads** to signed-in group members — this is the part that's
   actually load-bearing for security, since reads genuinely go through the client SDK.
2. **Deny every client write** as a backstop — belt-and-suspenders in case a bug or a
   compromised client ever tries to write directly. This should never be exercised in normal
   operation; if it ever is, something upstream is already wrong.

> [!warning] Never add a client-write `allow` rule
> AGENTS.md is explicit: "Client writes are denied by rules as a backstop — never add one."
> If a feature seems to need a client write, it needs a Server Action instead.

## Structure

```
isSignedIn()       → request.auth != null
isBanned()         → looks up users/{uid}.banned — see Admin Panel
isGroupMember(id)  → isSignedIn() && !isBanned() && auth.uid in groups/{id}.memberUids

users/{uid}          → read: only your own doc. write: false.
groups/{groupId}     → read: signed-in, not banned, uid in memberUids. write: false.
  expenses/{id}      → read: isGroupMember(groupId). write: false.
  settlements/{id}   → read: isGroupMember(groupId). write: false.
  recurring/{id}     → read: isGroupMember(groupId). write: false.
  activityLog/{id}   → read: isGroupMember(groupId). write: false.
  messages/{id}      → read: isGroupMember(groupId). write: false.
  chatReads/{uid}    → read: isSignedIn() && !isBanned() && auth.uid == uid && isGroupMember(groupId). write: false.

{document=**}        → deny-all backstop for anything unmatched.
```

Every subcollection re-checks `isGroupMember(groupId)` independently rather than inheriting
from the parent — Firestore rules don't cascade, each `match` block is self-contained.

## The ban backstop, specifically

`isBanned()` exists because disabling a Firebase Auth account and revoking its refresh tokens
(`adminSetUserBanned` in `src/lib/actions/admin.ts`) doesn't invalidate an **already-issued**
ID token immediately — a token issued before the ban and not yet expired can keep working
against Firestore Rules for up to an hour otherwise. `isBanned()` closes that window by
checking the live `users/{uid}.banned` flag on every gated read, independent of token
freshness. Note it does *not* protect the session cookie path — that's `checkRevoked: true`
in `getSession()` (see [[Two Auth States]] and [[Admin Panel]]).

## chatReads doc-id trick

`chatReads/{uid}` doesn't need a membership *and* ownership check written out expansively —
because the document id **is** the uid, `request.auth.uid == uid` already means "this is your
own receipt," and membership is checked on top of that. This is a recurring pattern in this
codebase: when a doc id can double as an identity check, rules (and code) lean on that instead
of a separate field comparison.

## Testing

`pnpm test:rules` runs `vitest.rules.config.ts` against the Firebase emulator
(`@firebase/rules-unit-testing`) — see `src/lib/firebase/firestore.rules.test.ts`. This suite
is **not** part of the default `pnpm test` / Definition-of-Done gate because it needs the
emulator running; per AGENTS.md, "a backstop that's never tested isn't one," so don't skip it
when rules change, just run it manually. See [[Local Development and Testing]].

## Related
[[Data Access Pattern]] · [[Two Auth States]] · [[Admin Panel]] · [[Data Model]]
