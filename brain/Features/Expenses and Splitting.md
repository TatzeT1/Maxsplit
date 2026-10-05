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
2. **Shape** — `validateExpenseInput`: description (non-blank, ≤ `MAX_DESCRIPTION_LENGTH`),
   positive integer amount, real `yyyy-mm-dd` date, known category or null, a single emoji
   or null, a known split mode, at least one payer, at least one split participant — then
   `currency === group.currency` (see [[Balances and Settlements]]). See [[Conventions]] on
   why every field is checked, not only the money.
3. **Participant validity** — every uid in `paidBy` _and_ every split participant must exist
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

## Undo: the "Rückgängig" toast

Deleting an expense or a payment from the ledger offers a way back for eight seconds
(`components/groups/undo-toasts.tsx`; the state lives in `ActivityFeed`, not in a row, because the
row is gone from the list the moment the server confirms — and deleting the _last_ entry swaps
the whole list for the empty state). The toast pauses while hovered or focused, stacks up to
three, and its button is disabled offline like every saving control.

- `restoreExpense` clears `deletedAt`, logs `expense_restored`, recomputes balances. Same
  ownership rule as deleting; restoring a live expense is a no-op success (a double tap is not
  an error). It refuses when the group changed in the seconds between delete and tap, because a
  restored row has to satisfy what `addExpense` enforces: `invalid-currency` (the currency is
  only locked while something is booked, and deleting the last expense unlocks it) and
  `member-gone` (leaving needs a zero balance, which deleting someone's only expense can
  produce, and balances only name debts for people still in `members`).
- `restoreSettlement` (`lib/actions/settlements.ts`) books the payment the client still has on
  screen again, **under its old id** via `create()`, so a double tap books it once. It is
  `recordSettlement` without the push (the receiver already heard about it) and with the same
  checks; the restoring member becomes `createdBy`, never a value from the request. The id must
  look like a Firestore auto id, so a request can't pick a path.

The delete confirmation used to say "Das kann nicht rückgängig gemacht werden" — it now says
the opposite; keep the two in step if either changes.

## Categories

`src/lib/categories.ts` — `CategoryId` is a fixed union (`groceries`, `restaurant`,
`transport`, `housing`, `utilities`, `entertainment`, `travel`, `shopping`, `health`,
`other`), each with an icon and a tinted icon-circle color (`categoryColorClasses`) derived
from one hue per category. (A row tint and a solid bar color used to exist for the old
per-row wash and the spending-analytics card; both went when the group page moved to
grouped month cards and category chips — see [[Group Page]].) `category: null` and
`category: "other"` both fall back to the same visuals via `categoryIcon`/
`categoryColorClasses`, and `computeCategoryTotals` folds null into "other" for the chips. `emoji?: string | null` on `Expense` is
a separate, optional **user override** shown instead of the category icon — unrelated to
`category` itself.

## Related

[[Money Invariants]] · [[Groups and Members]] · [[Split Games]] (alternate, gamified ways to pick a split) · [[Data Model]]
