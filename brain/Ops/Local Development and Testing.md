---
tags: [ops, testing, local-dev]
---

# Local Development and Testing

See `README.md` for the copy-pasteable quickstart. This note is the "why" and the test-suite
map.

## Definition of Done (from AGENTS.md — binding, not aspirational)

All four must be green before committing:

```
pnpm typecheck    # next typegen && tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

`pnpm typecheck` runs `next typegen` first: the root layout uses Next's generated
`LayoutProps` type, which only exists once route types have been generated (by `next dev`,
`next build` or `next typegen`), so a bare `tsc --noEmit` fails on a fresh clone.

`pnpm test:rules` (emulator-backed Firestore rules suite) is **not** part of this default
gate — it needs the emulator running. Run it manually whenever `firestore.rules` changes; see
[[Firestore Rules]] for why skipping it defeats the point of having a backstop at all.

`pnpm format:check` currently fails on pre-existing files — **run Prettier only on files you
touch**, don't reformat the whole repo as a drive-by.

## Two terminals for local dev

```
pnpm emulators   # Firebase Auth + Firestore + Storage emulators — UI at :4000
pnpm dev         # Next.js dev server — :3000
```

`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` plus the three `*_EMULATOR_HOST` vars (see
[[Environment and Config]]) route both the client SDK and the Admin SDK at the local
emulators. The emulators don't validate the `NEXT_PUBLIC_FIREBASE_*` / service-account values,
so placeholders are fine for emulator-only work — real values are only needed against the
actual Firebase project. Sign-in against the emulator shows a fake account picker ("Mit
Google anmelden") — no real Google account needed.

## Test layout

- **`pnpm test`** (Vitest, `vitest.config.ts`, jsdom via `vitest.setup.ts`) — the default
  suite. Colocated `*.test.ts` files next to what they test:
  `src/lib/money/{split,balances,category-totals,lottery-totals,expense-impact}.test.ts`,
  `src/lib/format/{money,date}.test.ts`,
  `src/lib/payment/{validate,paypal-me}.test.ts`, `src/lib/groups/invite-code.test.ts`,
  `src/lib/recurring/schedule.test.ts`, `src/lib/i18n/translate.test.ts`,
  `src/lib/firebase/config.test.ts`, `src/lib/use-visible-height.test.ts`,
  `src/lib/games/{knockout-ladder,use-knockout-ladder,tic-tac-toe,connect-four,memory-duel,reaction-duel,rock-paper-scissors,nim,use-turn-fuse,dots-and-boxes,balloon,dice-cup,duck-race,pegboard,pegboard-layout,online-match,game-memory,expense-game,game-stats,rematch,nudge,luck-round}.test.ts`,
  `src/lib/chat/{game-result,rich-text,cards,reactions}.test.ts`, `src/lib/chat/use-chat-sender.test.tsx`,
  `src/components/groups/chat-{composer,message}.test.tsx` (see [[Chat]]),
  `src/lib/sound/game-sounds.test.ts`
  (see [[Split Games]] for what each pure module encodes). This is where [[Money Invariants]]'
  guarantees (rounding remainders, multi-payer attribution, zero-sum) are actually pinned down —
  read these before changing split/balance logic, they encode the invariants as concrete cases,
  not just prose.
- **`pnpm test:rules`** (`vitest.rules.config.ts`) — runs
  `firebase emulators:exec --only firestore,storage "vitest run --config vitest.rules.config.ts"`.
  Exercises `src/lib/firebase/firestore.rules.test.ts` against a real emulator instance, using
  `@firebase/rules-unit-testing` — covers membership checks, deny-by-default, and negative
  cases (non-member denied) per the original Definition-of-Done brief in `plan.md`.
- **`pnpm test:emulator`** (`vitest.emulator.config.ts`, files named `*.emulator.test.ts`) —
  integration tests that run the real Server Actions and the recurring cron against the
  Firestore emulator: the queries, batches and transactions the pure-module tests can't
  reach. `getSession` is swapped for `src/test/session-mock.ts` (`signInAs(...)` picks the
  caller), `server-only` is aliased to a stub, the database is wiped before every test, and
  `src/test/fixtures.ts` seeds production-shaped docs through the Admin SDK. Add a case here
  whenever a bug lives in an action rather than in `src/lib/money/` — every bug found in the
  2026-09 review (payment-detail copy, recurring ghost debts, cron duplicates) did.

Neither emulator suite is in the default `pnpm test` gate (both need Java); CI runs both —
see [[Deployment and Production Debugging]].

Push delivery (`src/lib/push/notify.ts`, built on `after()`, which throws outside a
request) is swapped for `src/test/push-mock.ts` in every emulator test — read what an
action would have sent from `sentPushes`. An action that needs the request's language
(`getServerT`, a cookie) gets a German translator from `vitest.emulator.setup.ts`, mocked
for every emulator test file since 2026-10 (game invites and results write chat text from
several actions).

**A signed-in screen in a real browser, no Firebase project needed** (how the chat was checked
2026-10-07): `firebase emulators:start --only auth,firestore --project demo-split`; build and
start the production server with placeholder `NEXT_PUBLIC_FIREBASE_*` values,
`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, `FIREBASE_AUTH_EMULATOR_HOST` /
`FIRESTORE_EMULATOR_HOST` and a throwaway service-account key (the one
`vitest.emulator.setup.ts` generates works); create accounts with the Auth emulator's REST
`accounts:signUp?key=x`, seed `users/{uid}` (with `onboardingCompletedAt`), the group and its
messages with the Admin SDK, then sign in through the email form ("Mit E-Mail fortfahren") with
Playwright (`playwright-core` + `executablePath: /opt/pw-browsers/chromium`, installed in a
scratch directory, not in the repo). A mobile context (`isMobile`, `hasTouch`, 390×844) and one
context per user covers multi-user flows. This does **not** reproduce iOS keyboard behaviour.

**Service worker, offline and push by hand.** The worker only registers in production
builds (`pnpm build && pnpm start`), never in `pnpm dev`. Offline: Playwright's
`setOffline` doesn't reach `navigator.onLine` on a reused page — use CDP
`Network.emulateNetworkConditions` after each load and stop the Next server so the
worker's own fetches fail. Push: headless shell reports notifications as denied; use
`channel: "chromium"` to see the worker show one (CDP `ServiceWorker.deliverPushMessage`),
and a fake HTTPS push service plus `PUSH_EXTRA_ENDPOINT_HOSTS` to follow a real send. See
[[Offline Mode]] and [[Push Notifications]].

## Prerequisites

Node 20+, pnpm, **Java 11+** (the Firestore/Storage emulators are JVM-based — check with
`java -version` if `pnpm emulators` fails to start).

## Related

[[Environment and Config]] · [[Firestore Rules]] · [[Money Invariants]] · [[Deployment and Production Debugging]]
