---
tags: [architecture, money, invariants, core-logic]
---

# Money Invariants

Core logic lives in `src/lib/money/` — this is the most heavily tested corner of the
codebase (`split.test.ts`, `balances.test.ts`, `category-totals.test.ts`,
`lottery-totals.test.ts`) and the one place [[Data Access Pattern]] insists must run
server-side, in plain TypeScript, never trusted from a client.

## The three invariants (from the original project brief, still enforced)

1. `sum(paidBy) === amountMinor` exactly — checked by `validatePaidBy` (`split.ts`).
2. `sum(splits[*].amountMinor) === amountMinor` exactly — checked by `validateSplits`
   (`split.ts`). The rounding remainder is distributed deterministically, **never** silently
   dropped or invented.
3. Across a group, `sum(all member balances) === 0` — this is not separately validated; it
   *falls out* of invariants 1 and 2 holding for every expense (see `computeBalances`'s doc
   comment in `balances.ts`).

All amounts are **integer minor units** (cents). `assertIntegerMinorUnits` throws on any
non-integer amount reaching split logic — floats are never allowed past this boundary.

## `distributeByWeights` — the mechanism behind every split mode

`src/lib/money/split.ts`. The **largest-remainder method**: give each participant
`floor(amount * weight / totalWeight)`, then hand out the leftover minor units one-by-one, in
descending order of fractional remainder (ties broken by input order, since `Array#sort` is
stable), to whoever's remainder is largest. This guarantees the sum is exact with no unit
dropped or invented — the property invariant #2 depends on.

All four split modes are thin wrappers around this one function:

| Mode | Weights | Function |
|---|---|---|
| `equal` | all `1` | `splitEqual` |
| `shares` | share counts (positive integers) | `splitByShares` |
| `percent` | percentages, must sum to 100 (`validatePercentsSum100`) | `splitByPercent` |
| `exact` | the amounts themselves, must already sum to the total | `splitExact` |

See [[Expenses and Splitting]] for how a Server Action turns raw UI input into these calls.

## `computeBalances` — net balance per member

`src/lib/money/balances.ts`. For every expense: each payer's balance goes up by what they
paid, each participant's balance goes down by their split. For every settlement: the payer's
balance moves toward zero, the payee's credit shrinks by the same amount. Positive = the
group owes them; negative = they owe the group.

## `simplifyDebts` — "Schulden vereinfachen"

Greedy min-cash-flow heuristic: repeatedly matches the largest creditor with the largest
debtor until everyone nets to zero. **Not** a globally-optimal minimum-transaction-count
solver (that's NP-hard) — same approach other Splitwise-style apps use. Always ≤ `n-1`
transfers for `n` people with a nonzero balance. Purely a *display* suggestion: it doesn't
read or write settlements — a caller still has to call `recordSettlement` once money actually
changes hands. Per the original roadmap this is opt-in per group in the UI.

## `computePairwiseDebts` — "Du schuldest Anna 12,50 €"

Direct per-expense ledger between two specific people (not simplified). `net[a][b]` = how
much `a` owes `b`; `net[a][b] === -net[b][a]` by construction. With **multiple payers** on
one expense, a participant's split is attributed across payers proportionally to what each
payer contributed — using `distributeByWeights` again, this time weighted by `paidBy` — so a
100 € expense paid 60/40 by Anna/Ben correctly credits both, not just whichever key happens
to come first in `paidBy`.

## `computeMemberTotals` — the "why do I owe this" breakdown

Per member: `paidMinor`, `shareMinor`, `settlementsSentMinor`, `settlementsReceivedMinor`.
For every uid, `paidMinor - shareMinor + settlementsSentMinor - settlementsReceivedMinor`
equals that person's `computeBalances` net figure — this function exists purely to make that
arithmetic visible (used by [[Settlement PDF Export]]), not to compute anything new.

## The cache: `recomputeGroupBalances`

`src/lib/money/balance-cache.ts`. Called after **every** Server Action that mutates a
group's expenses or settlements. Recomputes the full ledger and writes it to
`groups/{id}.balancesMinor`. **Best-effort**: wrapped in try/catch, a failure here is logged
but never fails the caller's already-succeeded primary mutation — the cache just goes stale
until the next write. See [[Data Model]] for why this field is display-only, never a source
of truth.

## Related
[[Data Access Pattern]] · [[Expenses and Splitting]] · [[Balances and Settlements]] · [[Split Games]]
