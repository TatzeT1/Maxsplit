---
tags: [ops, testing, local-dev]
---

# Local Development and Testing

See `README.md` for the copy-pasteable quickstart. This note is the "why" and the test-suite
map.

## Definition of Done (from AGENTS.md — binding, not aspirational)

All four must be green before committing:

```
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

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
  `src/lib/money/{split,balances,category-totals,lottery-totals}.test.ts`,
  `src/lib/payment/{validate,paypal-me}.test.ts`, `src/lib/groups/invite-code.test.ts`,
  `src/lib/recurring/schedule.test.ts`, `src/lib/i18n/translate.test.ts`,
  `src/lib/firebase/config.test.ts`, `src/lib/use-visible-height.test.ts`,
  `src/lib/games/{knockout-ladder,use-knockout-ladder,tic-tac-toe,connect-four,memory-duel,reaction-duel}.test.ts`
  (see [[Split Games]] for what each pure module encodes). This is where [[Money Invariants]]'
  guarantees (rounding remainders, multi-payer attribution, zero-sum) are actually pinned down —
  read these before changing split/balance logic, they encode the invariants as concrete cases,
  not just prose.
- **`pnpm test:rules`** (`vitest.rules.config.ts`) — `firebase emulators:exec --only
  firestore,storage "vitest run --config vitest.rules.config.ts"`. Exercises
  `src/lib/firebase/firestore.rules.test.ts` against a real emulator instance, using
  `@firebase/rules-unit-testing` — covers membership checks, deny-by-default, and negative
  cases (non-member denied) per the original Definition-of-Done brief in `plan.md`.

## Prerequisites

Node 20+, pnpm, **Java 11+** (the Firestore/Storage emulators are JVM-based — check with
`java -version` if `pnpm emulators` fails to start).

## Related
[[Environment and Config]] · [[Firestore Rules]] · [[Money Invariants]] · [[Deployment and Production Debugging]]
