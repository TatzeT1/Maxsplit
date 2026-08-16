# Architecture Decision Records

## ADR-001: Data access pattern — hybrid client reads / server-validated writes

**Status:** Accepted
**Date:** 2026-08-10

### Context

We need to choose how the app talks to Firestore. Three options were on the table:

- **(A) Pure client SDK.** React components read and write Firestore directly; Firestore
  Security Rules are the only enforcement layer. Free realtime listeners everywhere.
- **(B) Pure server.** All reads and writes go through Next.js Server Actions / Route
  Handlers using the Firebase Admin SDK, with a session cookie minted from the ID token.
  Firestore Rules become a deny-all backstop that's rarely exercised. No client SDK usage.
- **(C) Hybrid.** Reads via the client SDK (realtime listeners), writes via Server Actions
  using the Admin SDK (validated, trusted).

The deciding constraint from the project brief: **balance/settlement math must never be
computed on the client as source of truth**, and money invariants (`sum(paidBy) ===
amountMinor`, `sum(splits) === amountMinor` via largest-remainder rounding, group balances
sum to zero) must be enforced and unit-tested in code, not reimplemented in the Firestore
Rules language.

### Decision

**Option (C) — hybrid.**

- **Writes** (create/edit/delete expense, settle up, join group, etc.) go through Next.js
  Server Actions using the Firebase Admin SDK. All money math — split calculation, largest-
  remainder rounding, payer/split-sum validation — happens in plain TypeScript on the
  server, where it's trivial to unit test with Vitest and impossible for a client to bypass.
  The Admin SDK write is the only place `amountMinor` sums are trusted.
- **Reads** for anything that benefits from realtime UX (balance view, activity feed,
  expense list while others are editing) use the client Firestore SDK with `onSnapshot`
  listeners, subject to Firestore Security Rules.
- **Firestore Security Rules** are deny-by-default. For reads they enforce group
  membership (`request.auth.uid in resource.data.memberUids`). For writes they act as a
  backstop that rejects anything not routed through a Server Action — e.g. rules require a
  custom claim or document marker that only the Admin SDK can set, so a compromised or
  buggy client can't write directly even if it tried.
- **Auth session:** Google Sign-In on the client via Firebase Auth, ID token exchanged for
  an HTTP-only session cookie (minted server-side, verified with the Admin SDK on every
  Server Action / protected route). This avoids re-verifying the ID token on every request
  and works cleanly with Vercel's serverless functions.

### Rationale against the alternatives

| Criterion              | (A) Client-only                                                                                                                            | (B) Server-only                                                                          | (C) Hybrid — chosen                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Money-math correctness | Rules can't express largest-remainder rounding; math would live in untested, unenforceable rule expressions or (worse) trusted client code | Fully server-validated, easy to unit test                                                | Fully server-validated, easy to unit test                         |
| Firestore read cost    | Cheapest — listeners only pay for changed docs                                                                                             | More expensive — every read is a function invocation + Admin SDK read, no listener reuse | Cheapest for reads — same as (A)                                  |
| Realtime UX            | Best, free                                                                                                                                 | Requires polling or a custom pub/sub layer to fake realtime                              | Best, free — same as (A)                                          |
| Vercel cold starts     | None — no server round-trip for reads                                                                                                      | Every read _and_ write pays a cold start                                                 | Only writes pay a cold start; reads are unaffected                |
| Testability            | Business logic scattered into rules + client code, hard to unit test                                                                       | Easiest — all logic in one place, plain functions                                        | Easiest — write logic isolated in Server Actions, plain functions |

(B) was rejected mainly on realtime UX and cost: turning every balance/activity read into a
serverless function call adds latency and Vercel invocation cost for no correctness benefit,
since reads don't need write-time validation. (A) was rejected because it cannot satisfy the
non-negotiable that money math is never trusted from the client.

### Consequences

- Two SDKs in the codebase (`firebase/*` client SDK for reads, `firebase-admin` for writes)
  instead of one — slightly more surface area, mitigated by isolating each behind
  `src/lib/firebase/client.ts` and `src/lib/firebase/admin.ts`.
- Every mutating flow needs a Server Action; there is no "quick client write" escape hatch.
  This is intentional friction — it's the mechanism that keeps money math server-only.
- Firestore Rules still need real test coverage against the emulator (membership checks,
  deny-by-default, negative cases) even though they're a backstop, because a backstop that's
  never tested isn't one.
- Optimistic UI updates (Phase 5) need care: the client shows an optimistic state, then
  reconciles with the Server Action result and the realtime listener, since the source of
  truth write happens server-side.

### What would make us reverse this

- If Server Action cold starts on Vercel become a measured UX problem for common write paths
  (e.g. adding an expense feels laggy on 4G), we'd consider moving the _validation logic
  only_ into a callable Cloud Function kept warm, while keeping the "server, not client,
  computes money" rule intact.
- If Firestore Rules gain a real expression language capable of safely validating
  largest-remainder splits (unlikely), pure client writes for expenses could be
  reconsidered — but settlements and balance math would still need a trusted recompute step.

## ADR-002: PayPal.Me payment links with pre-filled amount — reverted

**Status:** Reverted
**Date:** 2026-08-16

### Context

Members already stored a bare PayPal email / IBAN for others to copy and paste into PayPal
by hand. We tried replacing that with a direct "Jetzt bezahlen" button: a member's PayPal.Me
username (`paypalMeHandle`, denormalized onto `GroupMember` the same way `paypalEmail`/`iban`
are) fed into `buildPaypalMeLink(handle, amount, currency)`, producing
`https://paypal.me/<handle>/<amount><currency>` — PayPal's own documented link format for
pre-filling the amount on their payment page.

### What we found

The amount is genuinely present in the link, but whether PayPal actually pre-fills it with
that amount is entirely up to PayPal, not the page that links to it:

- Multiple PayPal Community threads report that a `paypal.me/<handle>/<amount><currency>`
  link pre-fills correctly in a desktop/mobile **browser**, but when the OS instead hands the
  link to the installed **PayPal native app** (iOS/Android Universal/App Links — a decision
  made by the OS, not the linking web page), the app opens straight to the recipient's
  profile and drops the amount, leaving the payer to type it in by hand.
- Testing against this app's own deployment went further: even opening the link as an
  installed **PWA on iOS**, which should behave like a browser rather than trigger the native
  app's own handoff, still didn't carry the amount over.

There is no reliable client-side fix: a web page cannot force iOS/Android to keep a
Universal/App Link inside the browser once the OS decides to hand it to an installed app, and
even PayPal's own web flow isn't consistently honoring the amount segment.

### Decision

Reverted the feature (commits `1b7e176`, `05d8862`, `d8333f7`, `dc44255`, `14466d0`) rather
than keep a button whose label ("Jetzt bezahlen" with an amount already filled in) silently
didn't do what it implied. Without a reliably pre-filled amount, the button had no real
advantage left over the existing "copy PayPal email, paste it in by hand" flow it was meant
to improve on.

### What would change this

Worth revisiting only if PayPal ships a documented, reliable way to carry an amount through
to their **native app** on both iOS and Android — not just their web flow — or if the payment
method gets redesigned around something that doesn't depend on their public URL scheme at all
(e.g. a real PayPal Checkout/Payouts API integration, which is materially bigger in scope than
a payment link).
