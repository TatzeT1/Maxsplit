---
tags: [feature, expenses, money]
---

# Expenses and Splitting

Server Actions: `src/lib/actions/expenses.ts`. UI: `add-expense-dialog.tsx`,
`expense-detail-dialog.tsx`. Math: [[Money Invariants]] (`src/lib/money/split.ts`).

## The `ExpenseInput` shape

`addExpense` and `editExpense` both take an `ExpenseInput`:

```
groupId, description, amountMinor, currency, date, category, emoji,
paidBy: Record<uid, amountMinor>,
splitMode: 'equal' | 'shares' | 'percent' | 'exact',
participantUids: string[],       // used only when splitMode === 'equal'
splitInputs: Record<uid, number>, // raw per-uid input for shares/percent/exact
viaLottery: boolean,
```

`splitParticipantUids(input)` picks the right source depending on mode: `participantUids` for
`equal`, `Object.keys(splitInputs)` otherwise. `buildSplits(input)` then dispatches to the
matching function in `split.ts` (`splitEqual` / `splitByShares` / `splitByPercent` /
`splitExact`) and wraps each resolved amount together with its `rawValue` into an
`ExpenseSplit`.

## Validation order in `resolveExpense`

Both add and edit funnel through `resolveExpense`, in this order:

1. **Membership** — `session.uid` must be in `group.memberUids` (`requireGroupMembership`).
2. **Shape** — `validateExpenseInput`: non-empty description, positive integer amount, at
   least one payer, at least one split participant.
3. **Participant validity** — every uid in `paidBy` *and* every split participant must exist
   in `group.members` (real or placeholder — see [[Groups and Members]]). This is checked
   against `group.members`, deliberately not `memberUids`, so placeholder payers/participants
   are valid.
4. **Money invariants** — `validatePaidBy(amountMinor, paidBy)` then `buildSplits(input)`
   (which itself validates depending on mode — e.g. `splitByPercent` checks the percentages
   sum to 100 before distributing). Any failure here collapses to a single `"invalid-split"`
   error code for the caller.

If all four pass, `resolveExpense` returns the group, its ref, and the computed `splits` —
`addExpense` and `editExpense` then differ only in what they do with that (create a new doc
vs. update + log + re-check ownership).

## Who can edit/delete

`editExpense` and `deleteExpense` require **either** `createdBy === session.uid` **or**
`isGroupManager(group.members[session.uid]?.role)` (owner/admin). A plain member can edit or
delete only their own expenses.

## Soft delete + activity log

`deleteExpense` sets `deletedAt`, never removes the document. Every mutation that isn't a
creation (`editExpense`, `deleteExpense`) writes an `ActivityLogEntry` — but **creation itself
is not logged** (see [[Data Model]] for why: the new row is its own signal). Every mutation
also calls `recomputeGroupBalances(groupRef)` afterward (see [[Money Invariants]]).

## Categories

`src/lib/categories.ts` — `CategoryId` is a fixed union (`groceries`, `restaurant`,
`transport`, `housing`, `utilities`, `entertainment`, `travel`, `shopping`, `health`,
`other`), each with an icon, a text color, a row-tint, and a solid bar color (used by
`spending-analytics.tsx`) — all four derived from the same hue per category so they read as
one consistent system. `category: null` and `category: "other"` both fall back to the same
visuals via `categoryIcon`/`categoryColorClasses`/etc. `emoji?: string | null` on `Expense` is
a separate, optional **user override** shown instead of the category icon — unrelated to
`category` itself.

## Related
[[Money Invariants]] · [[Groups and Members]] · [[Split Games]] (alternate, gamified ways to pick a split) · [[Data Model]]
