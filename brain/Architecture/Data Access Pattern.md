---
tags: [architecture, adr, firebase]
---

# Data Access Pattern (ADR-001)

Full record: `docs/DECISIONS.md`. This note is the working summary — read the ADR itself
before touching auth or the read/write boundary, it has the rejected alternatives and the
"what would make us reverse this" section this note doesn't repeat in full.

## The decision

**Hybrid**: reads via the client Firestore SDK (`onSnapshot`, realtime), writes via Next.js
Server Actions using `firebase-admin` (validated, trusted). Two SDKs, two files:

- `src/lib/firebase/client.ts` — browser SDK, used by components for reads
- `src/lib/firebase/admin.ts` — server-only (`import "server-only"`), used by everything
  under `src/lib/actions/*` for writes

## Why this split exists

The non-negotiable constraint: **money math is never trusted from the client.**
`sum(paidBy) === amountMinor`, `sum(splits) === amountMinor`, and group balances summing to
zero (see [[Money Invariants]]) must be enforced in plain, unit-tested TypeScript — not in
Firestore Rules' expression language, and not in a React component that a modified client
could bypass.

Two alternatives were rejected:
- **Pure client + rules-only enforcement** — rules can't express largest-remainder rounding,
  so the money math would have to live in the client, which is not a trust boundary.
- **Pure server (reads too)** — turns every balance/activity view into a serverless function
  call, adding Vercel cold-start latency and invocation cost for reads that don't need
  write-time validation, and losing free realtime listeners.

## What this means in practice

- **Every mutating flow needs a Server Action.** There is no "quick client write" escape
  hatch — this is intentional friction, not an oversight. If you're tempted to write
  directly from a component, that's the smell that you've reached for the wrong SDK.
- **`firestore.rules` denies all writes** (see [[Firestore Rules]]) as a backstop, not the
  primary enforcement — the real enforcement is "only the Admin SDK, from a Server Action
  that checked membership, can reach Firestore for a write."
- **Reads are gated by rules**, not by Server Actions — a page reads Firestore directly with
  `onSnapshot`, and `firestore.rules` decides whether that read is allowed based on group
  membership (`request.auth.uid in resource.data.memberUids`).
- **Server Actions live in `src/lib/actions/*.ts`**, one file per feature area (`groups.ts`,
  `expenses.ts`, `settlements.ts`, `messages.ts`, `admin.ts`, `onboarding.ts`, `profile.ts`,
  `recurring.ts`, `settlement-share.ts`). Every exported function starts the same way:
  1. `const session = await getSession();` — see [[Two Auth States]]
  2. Fetch the group doc with `adminDb`, check `session.uid` is in `memberUids` or `members`
  3. Validate input (amounts are integers, participants exist, etc.)
  4. Mutate, then (for anything touching expenses/settlements) call
     `recomputeGroupBalances(groupRef)` — see [[Money Invariants]]
  5. Return `ActionResult<T>` = `{ ok: true, data: T } | { ok: false, error: string }` — never
     throw across the Server Action boundary for expected failures; `error` is a string code
     the UI maps to a German message via `t()`.

## Optimistic UI caveat

Because the source-of-truth write happens server-side and the realtime read is a separate
subscription, optimistic UI updates need to reconcile with *both* the Server Action's
response and the next `onSnapshot` emission — they are two different signals arriving at
different times, not one round trip.

## Related
[[Two Auth States]] · [[Money Invariants]] · [[Firestore Rules]] · [[Data Model]]
