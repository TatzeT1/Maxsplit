---
tags: [architecture, firestore, data-model]
---

# Data Model

Source of truth for types: `src/lib/types.ts`. This note explains the *shape and gotchas*;
read the actual file for exact field lists — it's short and heavily commented inline, so
duplicating every field here would just rot.

## Collections

```
users/{uid}
groups/{groupId}
  groups/{groupId}/expenses/{expenseId}
  groups/{groupId}/settlements/{settlementId}
  groups/{groupId}/recurring/{ruleId}
  groups/{groupId}/activityLog/{logId}
  groups/{groupId}/messages/{messageId}
  groups/{groupId}/chatReads/{uid}        (doc id == uid)
```

All money is **integer minor units** (cents) plus an ISO-4217 `currency` string. Never a
float, never a formatted string. See [[Money Invariants]].

## `Group` — the central document

Everything hangs off `groups/{groupId}`. Key fields and why they're shaped the way they are:

- **`memberUids: string[]`** vs **`members: Record<string, GroupMember>`** — these are *not*
  redundant. `memberUids` is real, authenticated members only, and exists specifically
  because `firestore.rules` needs an array it can do `request.auth.uid in ...` against
  (rules can't easily check membership in a map's keys the same way). `members` includes
  placeholder members too (see [[Groups and Members]]) and carries the display data. When
  writing group-mutation code: **check `memberUids` for "can this Firebase Auth user see/act
  on this group", check `members` for "is this uid (real or placeholder) a valid participant
  in an expense/settlement."**
- **`balancesMinor?: Record<string, number>`** — a cached, display-only copy of
  `computeBalances(...)`, written by `recomputeGroupBalances` after every mutation. It is
  **never a source of truth** — the group detail page recomputes from the live ledger. It
  exists purely so the groups *list* page can show "you owe X" without subscribing to every
  group's full expense/settlement collections. Absent on groups predating this field.
- **`settlementShareToken?: string`** — gates the public PDF link (see
  [[Settlement PDF Export]]). Generated lazily, never rotated automatically.
- Optional fields throughout (`icon`, `balancesMinor`, `settlementShareToken`,
  `emoji` on Expense, `viaLottery` on Expense) are absent-not-false/null on documents
  created before the field existed. **Always check with `?.` / `=== true`, never assume
  presence.** This is a recurring pattern across the whole model — Firestore has no schema
  migrations, so old documents simply lack newer fields forever.

## `GroupMember` — real vs. placeholder

`isPlaceholder: boolean` marks a member added by name only, with no Firebase Auth account —
lets a group's ledger be correct before everyone has actually joined the app. See
[[Groups and Members]] for the full lifecycle (creation → claiming). Never present in
`memberUids`. Payment fields (`paypalEmail`, `iban`, `paypalMeHandle`) are a **denormalized
copy** of the owning user's profile data, kept in sync by `updatePaymentDetails`
(`src/lib/actions/profile.ts`) — not the source of truth, which is `users/{uid}`.

## `Expense`

- `paidBy: Record<uid, amountMinor>` — supports multiple payers on one expense.
- `splitMode: 'equal' | 'shares' | 'percent' | 'exact'` and `splits: Record<uid,
  ExpenseSplit>` where `ExpenseSplit = { rawValue, amountMinor }` — `rawValue` is what the
  user actually typed (a share count, a percent, an exact amount), `amountMinor` is always
  the resolved integer result. See [[Expenses and Splitting]].
- `deletedAt: string | null` — **soft delete**. Every read that aggregates expenses
  (balances, PDF export, activity) filters `!expense.deletedAt`. Deleted expenses are never
  hard-removed, so the activity log and history stay coherent.
- `viaLottery?: boolean` — set when the split came from the 🎲 Split Lottery game (see
  [[Split Lottery]]) rather than manual entry. Forward-only marker; older lottery rounds
  aren't retroactively flagged.

## `Settlement`

A recorded payment between two members (`fromUid` → `toUid`), independent of any expense.
Feeds into [[Balances and Settlements]] the same way expenses do.

## `RecurringRule`

Carries a full expense "template" (`paidBy`, `splitMode`, `splits`, `category`) plus
scheduling fields (`frequency`, `startDate`, `nextRunDate`, `active`). See
[[Recurring Expenses]] for how `nextRunDate` advances.

## `ActivityLogEntry`

Only `expense_edited | expense_deleted | settlement_edited | settlement_deleted` are logged
— **"added" is deliberately not logged**, because the new row itself already signals that;
duplicating it in the log would be noise right next to the thing it describes.

## `ChatMessage` / `ChatRead`

Text-only chat, no attachments/edits/reactions in v1. `ChatRead` doc id equals the member's
uid (one receipt per member, enforced by Firestore doc-id semantics rather than a query).
See [[Chat]].

## Related
[[Data Access Pattern]] · [[Firestore Rules]] · [[Money Invariants]] · [[Groups and Members]]
