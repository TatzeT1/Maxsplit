---
tags: [feature, balances, settlements, money]
---

# Balances and Settlements

Server Actions: `src/lib/actions/settlements.ts`. UI: `balance-view.tsx`,
`record-settlement-dialog.tsx`, `activity-feed.tsx`. Math: [[Money Invariants]]
(`src/lib/money/balances.ts`).

## Three views of the same underlying ledger

`computeBalances`, `computePairwiseDebts`, and `simplifyDebts` (all in
`src/lib/money/balances.ts`, detailed in [[Money Invariants]]) are three different
projections of the same expenses + settlements:

- **Net balance per member** (`computeBalances`) — "you're owed 12,50 €" overall.
- **Pairwise debts** (`computePairwiseDebts`) — "Du schuldest Anna 12,50 €" specifically.
- **Simplified transfers** (`simplifyDebts`) — the opt-in "Schulden vereinfachen" suggestion,
  a minimal set of transfers, greedy-matched, not globally optimal (see [[Money Invariants]]
  for why that's an accepted tradeoff).

`BalanceView` renders debts only for `Object.keys(members)` — this is *why*
[[Groups and Members]] blocks leaving/removal while a member has a nonzero balance: removing
them from `members` would make their debt invisible here even though it's still in the ledger.

## Recording a settlement

`recordSettlement` — validates `fromUid !== toUid`, both parties exist in `group.members`
(placeholders included — settling up with someone who hasn't joined yet, e.g. cash handed
over in person, is valid), and the amount is a positive integer. Same ownership rule as
expenses applies to edit/delete: `createdBy === session.uid` OR `isGroupManager(role)`.

Settlements, like expenses, get an `ActivityLogEntry` on edit/delete (not on creation) via
`describeSettlement`, which renders as `"Anna → Ben (12,50 €)"` using `formatMoney` — and
every mutation triggers `recomputeGroupBalances`.

## Currency

Every `Expense` and `Settlement` carries its own `currency` field independently of
`group.currency` (the group's default/display currency). The original roadmap's Phase 3
scoped per-expense FX conversion with the rate frozen at entry time — check
`src/lib/format/money.ts` and the `Expense`/`Settlement` types before assuming multi-currency
math is fully wired end-to-end; this vault doesn't assert more than the code confirms here,
verify current state if you're touching FX logic.

## Related
[[Money Invariants]] · [[Groups and Members]] · [[Settlement PDF Export]] · [[Data Model]]
