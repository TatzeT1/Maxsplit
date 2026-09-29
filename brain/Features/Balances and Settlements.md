---
tags: [feature, balances, settlements, money]
---

# Balances and Settlements

Server Actions: `src/lib/actions/settlements.ts`. UI: `balance-hero.tsx` (your balance, on the
group page's receipt), `balances-tab.tsx` (everyone), `record-settlement-dialog.tsx`,
`activity-feed.tsx` — see [[Group Page]]. Math: [[Money Invariants]]
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

The group page's balance views (`BalanceHero`, the Salden tab) name debts only for
`Object.keys(members)` — this is _why_
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

**One currency per group, no FX.** Every `Expense`, `Settlement` and `RecurringRule` carries
a `currency` field, but the balance math (`computeBalances` and friends) adds `amountMinor`
at face value and ignores it — so the only safe state is "every entry is in the group's
currency". The server enforces that since 2026-09:

- `addExpense`/`editExpense`, `recordSettlement`/`editSettlement` and `createRecurringRule`
  refuse a `currency` other than `group.currency` (`"invalid-currency"`), as the game
  auto-book path (`createTournament`) already did.
- `updateGroup` refuses to change the currency once anything is booked — a live expense, a
  settlement or a recurring rule (`hasLedgerEntries`, `"currency-locked"`); before, it
  silently relabelled 100 € as "100,00 $". The edit dialog disables the picker with a hint.
- Only `SUPPORTED_CURRENCIES` (`src/lib/currencies.ts`) can be chosen at all.

The original roadmap's Phase 3 (per-expense currency with the FX rate frozen at entry) is
**not built**; it needs a data-model change and its own ADR.

## Related

[[Money Invariants]] · [[Groups and Members]] · [[Settlement PDF Export]] · [[Data Model]]
