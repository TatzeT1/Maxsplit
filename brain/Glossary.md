---
tags: [reference, glossary]
---

# Glossary

German UI terms and domain vocabulary as used in code and comments — code/comments stay
English, but several concepts are easiest to recognize by their German UI name since that's
how they appear in `de.ts`, dialog titles, and design discussions.

## German UI terms

| German | English meaning | Where |
|---|---|---|
| Schulden vereinfachen | "Simplify debts" | `simplifyDebts`, opt-in per-group debt-simplification toggle — [[Money Invariants]], [[Balances and Settlements]] |
| Du schuldest Anna 12,50 € | "You owe Anna 12.50 €" | pairwise debt display — `computePairwiseDebts` |
| Schuldenausgleich | "Debt settlement" | filename `schuldenausgleich.pdf` from the [[Settlement PDF Export]] route |
| vergambelt | roughly "gambled away" | informal term for the [[Split Games]] leaderboard of who's lost the most across the split mini-games |
| Überspringen | "Skip" | the onboarding skip action — see [[Onboarding and Payment Details]] |
| Mit Google anmelden | "Sign in with Google" | the sign-in button label, incl. in the emulator's fake account picker |
| Ausgaben teilen, ohne Kopfrechnen | "Split expenses without mental math" | the app's tagline (`app.tagline` in `de.ts`) |
| Glücksspiele | "Games of chance" | the picker's luck-based category (🎲🎡🎰🎫) — [[Split Games]] |
| Minispiele | "Minigames" | the picker's skill-based, 1-vs-1 duel category (⭕🔴🧠⚡) — [[Split Games]] |
| K.-o.-Modus | "Knockout mode" | the picker's name for the knockout-ladder mechanic that scales a duel game to a pool bigger than 2 — [[Split Games]] |

## Domain vocabulary

- **minor units** — integer currency subunits (cents for EUR). All `amountMinor` fields.
  Never a float. See [[Money Invariants]].
- **largest-remainder method** — the rounding algorithm (`distributeByWeights`) that makes
  split sums exact. See [[Money Invariants]].
- **placeholder member** — a `GroupMember` with `isPlaceholder: true`: added by name only, no
  Firebase Auth account yet. See [[Groups and Members]].
- **claiming** a placeholder — a real user's join rewrites all their placeholder's
  expense/settlement references to the real uid. See [[Groups and Members]].
- **session cookie** vs. **client Firebase Auth** — the two independent auth states. See
  [[Two Auth States]]. Don't use "logged in" loosely in this codebase without specifying
  which one you mean.
- **balancesMinor** — the cached, display-only `computeBalances` snapshot on `Group`. See
  [[Data Model]].
- **ADR** — Architecture Decision Record, the format used in `docs/DECISIONS.md`
  (Context → Decision → Consequences → what would reverse it).
- **manager** (as in `isGroupManager`) — a group `owner` or `admin`, as opposed to a plain
  `member`. See [[Conventions]].
- **backstop** — used specifically for `firestore.rules`' deny-all write rules: not the
  primary enforcement mechanism (that's Server Actions), just a safety net that should never
  actually be exercised. See [[Firestore Rules]].

## Related
[[Home]] · [[Conventions]] · [[Data Model]]
