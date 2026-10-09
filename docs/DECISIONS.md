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

## ADR-004: Offline is view-only; push is plain Web Push, without FCM

**Status:** Accepted
**Date:** 2026-09-29

### Context

Two owner requests: the installed app should open and show its data without a
connection, and people should hear about four things on their phones — "Du bist dran",
a challenge, a new expense involving them, a payment received. For offline, the owner
chose "only view" over offline writes.

### Decision

- **Offline reads only.** Firestore's persistent IndexedDB cache supplies the data; a
  hand-written service worker (`public/sw.js`) keeps build files and the last copy of each
  page. No Serwist/next-pwa dependency, no `experimental.useOffline`.
- **No offline writes.** Writes stay Server Actions (ADR-001) with nothing to queue them;
  offline, every saving control is disabled, and `callAction` turns a failed call into a
  visible "nichts gespeichert" instead of a hang.
- **Stale must not pass for live.** Per-screen sync marks show "Stand …"; a screen with
  no copy on the device says it needs a connection.
- **Sign-out wipes the device**: the offline copy, saved pages, sync marks, and the push
  subscription.
- **Push via the browsers' own push services** (VAPID + `web-push`), not Firebase Cloud
  Messaging: no extra vendor or SDK, end-to-end encrypted payloads, works for iOS
  home-screen apps. Subscriptions live in a server-only top-level collection keyed by
  endpoint (one account per device); keys are runtime env vars, not `NEXT_PUBLIC_*`.
- **Pushes go out after the response** (`after()`), so they can't slow or fail an action.
- **"Du bist dran" respects presence**: a server-only heartbeat doc per watching player.
  (ADR-003's "no presence" still holds for the players themselves — this is push-only.)

### Consequences

- Offline shows only what this device loaded before. iOS evicts a non-installed site's
  storage after a week without use.
- iPhones get pushes only as a home-screen app (iOS 16.4+).
- The worker needs a `VERSION` bump when its caching or `offline.html` changes.
- A presence write every 20 s per player while a game is on screen.
- Push is off until `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set in Vercel.

### What would make us reverse this

- A real need to enter expenses offline: idempotent action ids plus an outbox (or
  Next's offline retries), in a new ADR.
- Native apps: then APNs/FCM through their SDKs instead of Web Push.

## ADR-005: Online luck rounds — drawn when scratched, in their own collection

**Status:** Accepted
**Date:** 2026-10-03

### Context

The eight luck games only ran inside the expense form, on one phone passed around the
table; whoever wasn't there couldn't take part. The owner asked for luck games "online,
everyone on their own phone", starting with the scratch cards, where each player
scratching their own card is the whole game anyway.

Two questions had to be answered: where an online round's state lives, and how a card's
face stays unknown until its owner scratches it, given that every member reads game state
straight from Firestore (ADR-001).

### Decision

- **A new subcollection, `groups/{groupId}/luckRounds/{roundId}`**, one document per round,
  written only by `lib/actions/luck-rounds.ts` and read live by members — the shape of
  `tournaments` (ADR-002), with a rule of the same shape. It is not folded into
  `tournaments`: a luck round has no bracket, and every reader and action of a tournament
  would have had to learn to skip it.
- **No face is dealt in advance.** A card is drawn by the server in the transaction that
  scratches it: "zahlt" with probability (payer cards left) / (cards left)
  (`lib/games/luck-round.ts`). That is exactly the distribution of a deck shuffled up
  front — every card pays with the same chance whoever scratches first, pinned by a
  Monte-Carlo test — but there is no secret anywhere (not even a server-only document) that
  a modified client or anyone with database access could read in the meantime.
- **Always for a bill.** A round is started from a new expense and books it when the last
  card is scratched (the duels' `autoBook`), so a round can't be replayed: it books once.
  It can be called off only before the first card; after that, "Restliche Lose aufdecken"
  (the creator or a manager) ends a stuck round with the same draws.
- **The group page learns about a running round from the group document**
  (`activeLuckRound`, set and cleared with the round). A group without one costs no extra
  listener; one luck round per group at a time.

### Consequences

- `firestore.rules` gained a `luckRounds` block; it has to be deployed
  (`pnpm exec firebase deploy --only firestore:rules`) before the feature can be used —
  without it the round page shows a permission error. The group page itself only reads the
  pointer on the group document, so it keeps working either way.
- Placeholders have no phone: the round's creator scratches their cards.
- A second luck game online (dice, ducks) adds a `gameId` and its own drawing rule to the
  same collection and actions.

### What would make us reverse this

- A luck game whose outcome must be fixed before anyone acts (a race everyone watches start
  together, say) would need a dealt secret after all — then a server-only secrets document
  next to the round, like `liveSecrets`.

## ADR-006: The Schätzfragen bank — hand-verified, plaintext in a public repository, two sources per row

**Status:** Accepted
**Date:** 2026-10-09

### Context

"Schätzfragen" (🎯, ADR-007) asks one numeric question and decides who pays by who is furthest
off. The quality of the whole game is the quality of the numbers: one wrong "truth" turns a
friendly game into an argument about money. Three ways to get questions were weighed: (a)
generate them at runtime from an open dataset (Wikidata), (b) have an LLM write and answer
them, (c) a static bank written and verified by hand, shipped with the server code.

### Decision

- **What "server-only" means here, stated first.** The repository `github.com/TatzeT1/Maxsplit`
  is **public**, and the bank's rows are plaintext TypeScript in it: anyone can read every answer
  on GitHub, fork it, and find it in git history, and no later deletion changes that.
  `import "server-only"` and the guards below keep the rows out of **client bundles** and out of
  **client-readable Firestore documents**: no bundle and no document a client can read contains a
  truth before its stage is revealed, so a modified client cannot read one _from the app_.
  Nothing more is claimed. Every question is a well-sourced public fact, which is a ten-second
  web search, so **online rounds are open-book by nature** and the game is played among friends.
  Rows stay plaintext on purpose: a human has to read every row in a pull request, and a sealed
  file cannot be reviewed. If the owner ever wants them sealed, only
  `src/lib/games/estimate-bank/index.ts` changes (it would decrypt and export the same frozen
  array).
- **(c), hand-verified.** Every row is typed by a person who checked it against **at least two
  independent sources** (distinct hostnames, at least one primary: an agency, a standards body,
  an official statistic). They write the question in **their own words**, German and English, and
  record `definition` (what exactly is measured), `asOf` (the year the value is valid for), an
  optional `tolerance` (how much the sources disagree) and `verified: { by, on }` (who opened both
  sources, and when). CI checks the _format_ of that field, not the claim; the PR that adds rows
  pastes both URLs per row in its description. No LLM runs in the app; an LLM may suggest
  candidates offline, but nothing enters the bank without the human check. The Wikidata generator
  is deferred.
- **Server-only for clients, enforced in layers.** Rows live in `estimate-bank/rows/*.ts`, one
  file per category, each starting with `import "server-only"`; `estimate-bank/index.ts` freezes
  them into `ESTIMATE_BANK`. The only non-test importer is `src/lib/actions/estimate-rounds.ts`:
  ESLint (`eslint.config.mjs`, `no-restricted-imports`, pinned by `no-bank-in-client.test.ts`)
  rejects the import, also by relative path, anywhere else. The data-free modules (`types`,
  `public`, `draw`, `validate`) stay importable. The same lint block keeps the classifier
  (`estimate-rules`, `estimate-audit`) out of components, so the group page's first chunk carries
  neither the bank nor the ranking code. `pnpm check:bank-leak` runs after `pnpm build`: it looks
  for per-row needles (id, start of the definition) in `.next/static` and demands them in
  `.next/server`, so the scan cannot pass vacuously. The true answer reaches a client **only
  inside a revealed stage** of a round document (ADR-007). A row also lives, as a snapshot, in the
  round's server-only `secrets` document, so correcting a row later never rewrites a past game.
- **Content rules, enforced by `validateEstimateBank`** (run over every row by `bank.test.ts`):
  metric units only (a closed symbol list); no rows about persons (stricter than "living
  persons", because a regex cannot tell), no death or disaster counts, by a word-boundary
  blocklist in both languages; non-negative answers, zero only for interval rows; the answer
  must not appear in the question or the definition; **the public guess range is a closed table
  per unit class** (`ESTIMATE_BOUNDS`), identical for every row of a class and checked against
  the value, so the visible range carries no information about it (a per-row range would be a
  fingerprint of the answer); `tone: "fun"` rows only in animals, body, everyday and food, and
  drawn only when the table switches "Auch freche Fun Facts" on; stable immutable ids
  (`est-geo-0042`), retired ids (`RETIRED_IDS`) are never reused; tolerances are small (ratio at
  most 5 %, interval at most 2 % of the value and 1 % of the class range, years at most 2).
- **Floors are the merge gate, not the unit-test gate.** `pnpm check:bank-floors` runs the same
  validator with the minimums on: at least 100 verified standard and 30 fun rows, at least
  8 standard rows in each of the twelve categories, at least a quarter each of ratio and interval
  rows, at most 15 % with a tolerance. The default `pnpm test` runs with the floors off, so the
  guards could land before the content, and the bank is **empty until the first batch arrives**;
  `createEstimateRound` answers `bank-empty` rather than starting a round without a question. The
  game must not be merged to `main` until `pnpm check:bank-floors` is green. (Wiring that and
  `check:bank-leak` into CI is a follow-up; today both are run by hand.)
- **Licence rules.** We copy _facts_, not expression: question text, definition and labels are
  our own wording; we take single, hand-checked values and never extract a substantial part of
  a database or paste a table (EU database right, § 87a UrhG, concerns systematic extraction); no
  Wikipedia text (CC BY-SA share-alike would attach), so Wikipedia or Wikidata may be the
  _secondary_ source, never the only one; official statistics are used under their stated
  licence, with attribution given by the source label shown at the reveal and the URL in the
  audit; no scraping at scale; no images. This is an engineering policy, not legal advice; the
  owner is to confirm it before launch.
- **Review checklist in every bank PR:** two sources and one primary, both URLs pasted in the PR;
  `verified` filled by the person who opened them; own wording; metric; no person, no death, no
  disaster; `asOf` and `definition` filled; a tolerance justified in `note`; tone `fun` only for
  harmless animal, body, everyday or food facts; the question does not contain the answer;
  `pnpm test` green; `pnpm check:bank-floors` green before merging to `main`.
- **Questions do not repeat.** `groups/{g}/estimateState/seen` records the ids a group has been
  shown, updated in the transaction that draws, so two concurrent rounds cannot get the same
  question. When the eligible pool is used up it restarts, keeping the most recent few "seen".
  This is about variety, not secrecy.

### Consequences

- Adding a question is a code change and a PR; there is no admin UI and no runtime editing
  (intended friction). The PR _is_ the review, in public.
- **The answers are readable in the public repository.** Secrecy only stops a modified client
  from reading a truth out of the app; a player can look the answer up, and a member can read
  the whole bank by creating rounds and reading the reveals. There is therefore no mining
  defence, only an anti-spam cap on round creation (ADR-007).
- The bank must be re-reviewed periodically: rows with a moving truth (populations, records)
  carry `asOf`; a yearly bank review issue is part of the release routine.
- The bank cannot be shown on a client at all, including offline: starting a one-phone round
  needs a connection (ADR-007).
- Every finished round keeps `questionId`, the truth and its source label; the expense audit
  also keeps the definition and the source URL, so a wrong row can be found and fixed, and a
  future "report question" button needs no schema change.

### What would make us reverse this

- A need for more rows than people can verify: then a generator that _proposes_ with sources,
  still reviewed by a person.
- A requirement to play without a connection: then a deliberately public "offline pack" of
  low-stakes questions, which is a different decision with a different trust model.
- A wish to keep answers from people who look them up: seal the bank (decrypt in
  `estimate-bank/index.ts`) or move to a private repository, and accept that rows can then no
  longer be reviewed in a public PR.

## ADR-007: Estimate rounds — one server-held round model for one phone and online

**Status:** Accepted
**Date:** 2026-10-09

### Context

The owner asked for a 17th split game, "Schätzfragen": one numeric question, everyone guesses
in secret, the _k_ furthest off pay. It is to be played on one phone _or_ online with everyone
on their own phone, with a question bank whose answers must not ship to a client (ADR-006). The
truth therefore has to be held by the server until the reveal, even when the whole table shares
one device. It is the first game that rewards knowledge instead of luck or reflexes.

### Decision

- **One model, two modes.** `groups/{groupId}/estimateRounds/{roundId}` is the public document:
  members read it live, only Server Actions write it (ADR-001, the ADR-005 shape). Next to it,
  a server-only `secrets/{stageIndex}` subdocument holds the full bank row and the still-hidden
  guesses (client read _and_ write denied, like `liveSecrets`, ADR-003; rules do not cascade, so
  it has its own block), and a server-only `estimateState/seen` per group holds the seen
  question ids and the anti-spam creation log. A one-phone round differs only in _who submits_:
  the device owner submits every contender's guess in one action; an online round takes one
  guess per player. Neither mode stores a hidden guess anywhere a client can read, and the truth
  leaves `secrets` only inside the transaction that reveals its stage. (The rows themselves are
  public in the repository, ADR-006: this is about what the _app_ hands a client, not secrecy
  from the world.) Every action reads round, secrets, group and seen first and writes last,
  because a stage that finishes may draw a Stechfrage.
- **One phone: all-or-nothing, replay-safe.** `createLocalEstimateRound` returns the _public_
  first stage; the guesses stay in the device's memory until `submitLocalEstimateGuesses` sends
  every contender's guess at once (a subset would let a client peek by submitting one guess and
  reading the reveal). Only the round's creator may submit. An identical replay of a stage that
  is already revealed answers the same round, so a lost response cannot strand the table or
  score a stage twice. Placeholders may play, since everyone is at the table. Nothing is booked,
  posted or pushed by the round itself.
- **Online rounds are for people with phones, always for a bill, and book it exactly once.**
  Only members **with an account** can be in an online pool; a placeholder plays one phone only
  (whoever guessed for it could steer who pays). `createEstimateRound` draws the question,
  posts one invite card in the chat that states the deadline and what it costs not to answer,
  sets `Group.activeEstimateRound`, and pushes the pool. One online round runs per group at a
  time; a stale pointer (missing or finished round) is recovered, not wedged. The transaction
  that reveals the deciding stage books the bill with `buildGameExpense`, posts the chat result
  card, and clears the pointer; pushes go out after the response. If a payer left meanwhile
  the round still finishes, with `autoBookError` set and a push to the creator and the managers
  to enter the bill by hand. One-phone rounds hand the payers back through the expense form's
  `onResolve(losers, order, { estimateRoundId })`, like every game. The form's `addExpense` may
  then **claim** the finished round: the round is the booker's own, one-phone, finished, not
  claimed yet and at most two hours old, the split is `exact` and **equals `splitEqual` of the
  booked amount among exactly the round's payers**, and the players are the ones who sat at the
  table. If any of that fails, the expense is booked as a plain game record without an audit;
  if two claims race, the optimistic `lastUpdateTime` on the round fails the batch and nothing
  is written (`invalid-game`).
- **Exact scoring, two scales.** All numbers are integer milli-units. Quantities (heights,
  populations, masses) are `ratio` rows: the error is the factor `hi / lo` between guess and
  truth, compared by BigInt cross-multiplication, so a logarithm is never evaluated and
  "Faktor 2 zu niedrig" is as far off as "Faktor 2 zu hoch". Years, temperatures and
  percentages are `interval` rows and compare `|guess − truth|`. Zero is allowed only as an
  interval guess. The mixed scoring is on purpose: a ratio rewards a rough sense of magnitude
  over trivia, and is meaningless for a year. The guess range is a function of the unit class,
  not of the row (ADR-006).
- **Ties exist only where they decide who pays, and strict facts are never reversed.** Two
  guesses are tied if they are the same, or if the truth's uncertainty band could flip their
  order: for intervals when the midpoint of the guesses lies within the tolerance of the truth,
  for ratios when their geometric mean does. A missing guess is infinitely far, tied only with
  another missing one. By possible rank, a player **pays for certain** iff at most _k − 1_
  others can be at least as far off, is **safe for certain** iff at least _k_ others are
  certainly further, and is otherwise _contested_. Contested players play a **Stechfrage**: a
  fresh, unseen question (one without a tolerance when the bank has one), the same answer
  window, and the strict facts settled so far travel with them (`precedes`), so nobody who is
  certainly further off goes free while a certainly closer player pays. There are at most three
  Stechfragen; then `secureShuffle` decides, again respecting `precedes` (`lotPicks`). The lot
  also decides at once if every contested player is absent, and if the bank has no further
  question (the check runs before resolving, so a transaction never fails for want of one).
- **Absence costs money — the owner's rule, with safeguards.** A player with no guess ranks
  furthest. ADR-005 deliberately avoids punishing absence (a scratch card is pure luck, so a
  stand-in is possible there); a guess has no stand-in, and the owner decided. The rule keeps
  what ADR-005 protects. Nobody can _cause_ someone else's absence: the guessing only ends early
  when every contender has locked a guess, nobody guesses for another player, and no round
  starts without a stated deadline. Absence is never _silent_: the invite, the challenge push
  and the page state the window and "wer nicht tippt, zahlt zuerst". "Jetzt auswerten" (an
  entrant, the creator or a manager, only once the window plus 5 s grace is over) does not score
  a stage that has absent players on its first call: it starts a **last call** (two more
  minutes, a push to the absent), and the next call after that scores. The confirmation names
  who counts as absent and what it costs. Absent players never get a Stechfrage and never change
  anyone else's odds. Nothing runs on a timer: a round nobody closes just sits.
- **Time.** An online round has an answer window of **5 / 15 / 60 minutes (default 5)**, picked
  by the creator, plus 5 s grace; each Stechfrage gets the same window. The default is short
  because an online round is "everyone is on their phone right now" and a bill should not hang.
  It does **not** prevent looking an answer up.
- **Open-book, and a knowledge game.** Every question is a searchable fact, so online play is
  on the honour system; the deterrents are visible (`answeredAfterMs` in the ranking, "Ohne
  Googeln!" in the invite, push and hand-over copy). **Knowledge, not luck, decides who pays, so
  one weak or unlucky-in-topic player can pay most rounds** — this is the risk of the whole
  game and it is accepted, not solved. Mitigations: ratio scoring rewards magnitude over
  trivia; the game is never counted in the Glücks-Index and never labelled "Pech"; the setup
  copy says knowledge counts; the table can pick another game. Category balancing, per-row
  difficulty and handicaps are deferred.
- **Audit.** The finished round keeps question id, truth, unit, scale, tolerance, every guess
  and distance, and who typed each guess. The expense carries `game.estimate` (the inputs of the
  ranking function, the rules version, the booked money, the definition and the primary
  source), the chat card the deciding numbers. `replayEstimateAudit` re-derives the payers from
  the audit alone and rejects an audit that no round could have produced, dispatching on
  `rulesVersion` so a later rules fix never flips an old verdict; `compareEstimateAuditToExpense`
  checks the live expense (payers **and** the equal split of the money, tolerant of a
  placeholder claimed after booking). This makes the **arithmetic reproducible**; it does not
  prove that a one-phone table guessed honestly: the device owner types every guess, and the
  audit says so (`createdBy`, `enteredBy`). `editExpense` keeps a server-written audit only
  while the split is still the equal split among the game's payers.
- **Separate route** `/groups/[groupId]/estimate/[roundId]` (share link
  `/play/[groupId]/estimate/[roundId]`) next to `/rounds/`: one id, one collection, so a page
  never has to guess which collection a bare id belongs to.
- **Pushes never spoil.** Challenge, Stechfrage, last call and "not booked" pushes are built from
  names, the stake and a time, never from the round document, so a lock screen cannot reveal a
  question.
- **Anti-spam, not anti-mining.** At most 12 round creations per member per group per hour, for
  both modes (every online round posts a chat card and pushes the group). The bank is public, so
  nothing else is limited.

### Consequences

- `firestore.rules` gained blocks for `estimateRounds` (with `secrets`) and `estimateState`,
  with rules tests. They have to be deployed (`pnpm exec firebase deploy --only
firestore:rules`) before the first use, as with ADR-005; without them the round page shows a
  permission error and the banner an error state, never an empty one. The group page keeps
  working, since it only reads the pointer on the group document.
- One-phone play needs a connection, because the question comes from the server. Offline, the
  picker and the preview say so and the start is disabled; the online page behaves like the
  scratch page (`NeedsConnection` whenever offline); results stay readable from the cached
  expense and chat card.
- A server round trip per guess online, one per stage on one phone.
- `Expense.game` gains `estimate`; the claim id travels beside the record and is never stored.
  `ChatMessage` gains `estimateInvite` and `ChatGameResult` gains `estimate`; `QuizGameId` is
  a new id group (knowledge games), so `isLuckGameId` leaves the game out of the Glücks-Index by
  construction.
- A player who does not answer in time pays first; a group with one consistently weaker player
  will see them pay often.
- The game cannot reach `main` before the bank passes `pnpm check:bank-floors`.

### What would make us reverse this

- If offline one-phone play matters more than the rows staying out of the app, a public
  offline pack with its own trust model (a new ADR, see ADR-006).
- If presence or rematches are added, they extend this collection (`rematchId`, a heartbeat
  document) rather than a new one.
- If absence turns out to anger groups, replace "ranks furthest" with an excluded-and-restart
  rule (an owner decision); if one player keeps paying, add handicaps or category balancing.
