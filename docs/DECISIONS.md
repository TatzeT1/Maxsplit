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

## ADR-002: Tournament brackets as a new Firestore collection, synced live

**Status:** Accepted
**Date:** 2026-09-27

### Context

The four 1-vs-1 duel split mini-games (Tic-Tac-Toe, Vier gewinnt, Memory-Duell,
Reaktionsduell) previously scaled to a pool bigger than two players with only the
knockout ladder (`lib/games/knockout-ladder.ts`): a "winner stays on" chain, one match at a
time, on one shared phone passed between players.

The ask was a real tournament bracket ("Turnierbaum") that (a) shows an actual bracket
tree rather than a flat chain, and (b) lets several pairs play their own matches on their
own phones at the same time — the concrete example given was 10 people, several games
running simultaneously — with everyone watching the bracket fill in live.

That "watch it fill in live, from any phone" requirement is the one this ADR is about: it
needs state that outlives any single device's local React state and syncs across devices,
which the ladder never needed (it lives entirely in one `useState` on one phone for the
duration of one sitting).

### Decision

**A new subcollection, `groups/{groupId}/tournaments/{tournamentId}`, one document per
tournament**, following the same shape every other feature already uses (ADR-001): the
bracket document is created and mutated exclusively by Server Actions
(`lib/actions/tournaments.ts`) using `firebase-admin`, and read by every device directly via
the client SDK's `onSnapshot`, gated by a `firestore.rules` membership check identical in
shape to `expenses`/`messages`/`activityLog`.

Within that, three narrower calls:

- **The bracket is one document, not one per match.** A tournament tops out at 32 entrants
  (`MAX_TOURNAMENT_ENTRANTS`), so at most 31 matches — comfortably small (a few KB) to hold
  as one Firestore document (`Tournament.matches: Record<string, TournamentMatch>`) rather
  than a sub-subcollection. One document also means every device subscribes with a single
  listener and every mutation is one transaction, instead of coordinating writes across many
  match documents.
- **The bracket engine is pure, server-validated, and client-agnostic**
  (`lib/games/tournament-bracket.ts`): building the tree, advancing a result, and deciding
  who pays are plain, `Date.now()`-free, randomness-free functions — the same pattern
  `knockout-ladder.ts` already uses — unit-testable with Vitest and safe to import from
  both a Server Action and a client component (the standings/bracket display reuse
  `bracketLoserUids` read-only). The client only ever reports "match X's winner is Y"; the
  server (never the client) decides who advances and when the tournament is finished, inside
  a Firestore transaction, exactly like every other money-adjacent write in this app.
- **Match play itself stays local — only the bracket state is live-synced.** Two players in
  one match still share one phone (the same handoff-card UX the ladder already has); what's
  new is that _different pairs_ can do this on _different phones at the same time_, because
  a bracket's matches within a round are structurally independent (unlike the ladder's single
  "current" match). A device "claims" a ready match (`claim: {byUid, claimId, claimedAt}`)
  before playing it, which is also the one mechanism behind a closed tab or a stuck match:
  another device can "take over" a claim, invalidating the old one. Full move-by-move sync
  (syncing individual Connect-Four drops between two phones in different rooms) was
  explicitly out of scope — it would need a materially bigger realtime layer for a use case
  (remote 1-vs-1 play) nobody asked for; the ask was parallel _pairs_, not remote opponents.

### Rationale against the alternatives

| Criterion                              | Field on `Group`                                | One doc per match                                                               | Chosen: one doc per tournament                                                                 |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Listener count per device              | 1 (already subscribed to the group)             | N (one per live match)                                                          | 1                                                                                              |
| Write contention                       | Every match result rewrites the whole group doc | None across matches, but no single source of truth for "is the tournament done" | Contained to one small doc; a Firestore transaction serializes concurrent claims/results on it |
| Matches this app's existing shape      | No — every other subcollection is its own doc   | Partially                                                                       | Yes — same shape as `expenses`/`messages`                                                      |
| Cost for a tiny bracket (<=31 matches) | N/A                                             | 31+ reads to render one bracket                                                 | 1 read                                                                                         |

A field on `Group` was rejected because a tournament is its own lifecycle (created,
played, finished/cancelled) unrelated to the group's own fields, and would force every
group-doc read (the whole app's most-subscribed listener) to also carry bracket data. One
document per match was rejected because rendering the _bracket_ — the whole point of this
feature — needs every match at once, and there is no single document to hold "is the
tournament finished" without an extra parent doc anyway, which is just this design with
extra steps.

### Consequences

- A sixth Firestore subcollection to keep consistent with the deny-all-write /
  membership-gated-read pattern — `firestore.rules` and its emulator test suite both got a
  new `match /tournaments/{tournamentId}` block (see [[Firestore Rules]]).
- `recursiveDelete` on `deleteGroup` already covers unknown subcollections, so no separate
  tournament cleanup was needed.
- The knockout ladder is untouched and stays the default for a quick, one-phone round; the
  tournament is an opt-in "Turnier" toggle per game (`DuelGameConfig.tournament`). It shipped
  for Vier gewinnt first while the claim/takeover/cancel machinery got real usage, then turned
  on for Tic-Tac-Toe, Memory-Duell and Reaktionsduell too once it held up — each was a one-line
  config change, not new code, since every duel board already speaks the same `DuelBoardProps`
  contract `TournamentMatchRunner` drives (the same one the ladder already used).
- Applying a finished tournament's result to an actual expense still only happens from
  within the `AddExpenseDialog` that created it (Phase 1) — the standalone tournament page
  (`/groups/[groupId]/tournaments/[tournamentId]`) is for watching and playing matches, not
  for entering the expense. A page-side "enter as expense" fallback, for when that original
  dialog is lost (tab closed, app backgrounded), is deliberately deferred rather than
  guessed at.

### What would make us reverse this

- If a tournament ever needed to survive a `Group` being deleted independently (it
  currently doesn't — it's meaningless without the group), the collection placement would
  need to move.
- If real move-by-move remote play becomes an actual request, the "claim, play locally,
  report once" design here would need a materially different, heavier realtime layer per
  match — this ADR's scope assumption (co-located pairs) would need revisiting first.

## ADR-003: Online play — move-by-move sync per match, server-validated

**Status:** Accepted
**Date:** 2026-09-28

### Context

ADR-002 kept match play on one shared phone and named "real move-by-move remote play" as
what would make us revisit it. That request arrived: two people in the same group (the
example was a couple, 1 €, Tic-Tac-Toe) want to play each other from their own phones,
both as a plain 1-vs-1 and inside a tournament, with "on one device" still selectable.

### Decision

- **An online 1-vs-1 is a tournament with one match.** `Tournament.playMode = "online"`;
  no second game model, and the banner, page, share link and bracket engine all apply.
- **One `liveMatches/{matchId}` doc per online match**, not fields on the tournament doc:
  parallel matches in a big online tournament would otherwise all contend on one document
  with every move. The tournament doc still only learns the result, written in the same
  transaction as the deciding move.
- **Every move is a Server Action** (`playOnlineMove`) validated by the pure
  `applyOnlineMove`, consistent with ADR-001 — no client writes, no trusted "I won".
  Hidden information (the memory deck) lives in an unreadable `liveSecrets` doc.
- **The reaction duel is timed on each phone**, not by the server — a server-timed race
  would measure network latency, not reactions.
- **A finished server-backed game books its expense itself** (`autoBook`), in the
  finishing transaction. With players on different phones, "the creator's dialog applies
  the result" (ADR-002's deferred gap) no longer works at all.

### Consequences

- A Server Action round trip per move (~200–500 ms on Vercel). Fine for turn-based play;
  the grid games paint the own move optimistically to hide it.
- No presence/heartbeat: "Warte auf Lea …" can't tell "thinking" from "phone in pocket".
  Forfeit and cancel are the escape hatches.
- Two new rules blocks with emulator tests; `recursiveDelete` still covers them.

### What would make us reverse this

- If per-move latency becomes a measured UX problem, move validation into a warm callable
  function or accept client writes to `liveMatches` guarded by rules for the grid games
  only (their rules are simple enough to express), keeping results server-side.
- If fast real-time games are added, a dedicated realtime channel (RTDB / WebSocket) per
  match would replace per-move Server Actions.
