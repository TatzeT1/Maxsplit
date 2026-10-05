---
tags: [architecture, firestore, data-model]
---

# Data Model

Source of truth for types: `src/lib/types.ts`. This note explains the _shape and gotchas_;
read the actual file for exact field lists — it's short and heavily commented inline, so
duplicating every field here would just rot.

## Collections

```
users/{uid}                                (.notificationPrefs — see Push Notifications)
pushSubscriptions/{sha256(endpoint)}       (server-only: one device's push subscription)
groups/{groupId}
  groups/{groupId}/expenses/{expenseId}
  groups/{groupId}/settlements/{settlementId}
  groups/{groupId}/recurring/{ruleId}
  groups/{groupId}/activityLog/{logId}
  groups/{groupId}/messages/{messageId}
  groups/{groupId}/chatReads/{uid}        (doc id == uid)
  groups/{groupId}/tournaments/{tournamentId}
  groups/{groupId}/tournaments/{tournamentId}/liveMatches/{matchId}   (online play, doc id == bracket match id)
  groups/{groupId}/tournaments/{tournamentId}/liveSecrets/{matchId}   (hidden memory deck — no client reads)
  groups/{groupId}/tournaments/{tournamentId}/presence/{uid}          (server-only "watching" heartbeat)
  groups/{groupId}/tournaments/{tournamentId}/nudges/{matchId}        (server-only "Anstupsen" rate limit)
  groups/{groupId}/luckRounds/{roundId}                               (online luck round — ADR-005)
```

All money is **integer minor units** (cents) plus an ISO-4217 `currency` string. Never a
float, never a formatted string. See [[Money Invariants]].

## `Group` — the central document

Everything hangs off `groups/{groupId}`. Key fields and why they're shaped the way they are:

- **`memberUids: string[]`** vs **`members: Record<string, GroupMember>`** — these are _not_
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
  exists purely so the groups _list_ page can show "you owe X" without subscribing to every
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
`memberUids`. Payment fields (`MEMBER_PAYMENT_FIELDS`: `paypalEmail`, `iban`,
`paypalMeHandle`, `accountHolderName`) are a **denormalized copy** of the owning user's profile data — written when
a real member entry is minted (`realMemberFromSession`) and kept in sync by
`updatePaymentDetails` — not the source of truth, which is `users/{uid}`. An unset field is
absent; entries written before 2026-09 may hold `""` instead, which reads the same.

## `Expense`

- `paidBy: Record<uid, amountMinor>` — supports multiple payers on one expense.
- `splitMode: 'equal' | 'shares' | 'percent' | 'exact'` and `splits: Record<uid,
ExpenseSplit>` where `ExpenseSplit = { rawValue, amountMinor }` — `rawValue` is what the
  user actually typed (a share count, a percent, an exact amount), `amountMinor` is always
  the resolved integer result. See [[Expenses and Splitting]].
- `deletedAt: string | null` — **soft delete**. Every read that aggregates expenses
  (balances, PDF export, activity) filters `!expense.deletedAt`. Deleted expenses are never
  hard-removed, so the activity log and history stay coherent.
- `viaLottery?: boolean` — set when the split came from any of the fifteen 🎲🎡🎰🎫🎈🦆🥃🎱⭕🔴🧠⚡✊🥢✏️ split
  mini-games (see [[Split Games]]) rather than manual entry. The name predates every game but
  the original lottery and is kept as-is rather than migrated. Forward-only marker; rounds
  played before a given game shipped aren't retroactively flagged.
- `game?: { gameId, playerUids, attempt } | null` — since 2026-10, next to `viaLottery`: which
  game decided it, who was in the pool, and in which attempt (rounds the form started, "Neu
  mischen" included). Validated server-side (`normalizeExpenseGame`); absent on older
  expenses, `null` after an edit replaced the game's split by hand. Feeds the Spiele tab and
  the chat's result card — see [[Split Games]].

## `Settlement`

A recorded payment between two members (`fromUid` → `toUid`), independent of any expense.
Feeds into [[Balances and Settlements]] the same way expenses do.

## `RecurringRule`

Carries a full expense "template" (`paidBy`, `splitMode`, `splits`, `category`) plus
scheduling fields (`frequency`, `startDate`, `nextRunDate`, `active`). See
[[Recurring Expenses]] for how `nextRunDate` advances.

## `ActivityLogEntry`

`expense_edited | expense_deleted | expense_restored | settlement_edited | settlement_deleted |
settlement_restored` are logged — **"added" is deliberately not logged**, because the new row
itself already signals that; duplicating it in the log would be noise right next to the thing
it describes. "Restored" _is_ logged: it's the undo toast (see [[Expenses and Splitting]]), and
without it the earlier "deleted" line would stand alone and claim a row that's back is gone.

## `Tournament`

One document per live bracket (ADR-002, `docs/DECISIONS.md`), holding every match in
`matches: Record<string, TournamentMatch>` — small enough (≤31 matches at the 32-entrant
cap) to stay one document rather than a sub-subcollection. Written exclusively by
`lib/actions/tournaments.ts`; every device (creator, players, spectators) reads the same
document live via `onSnapshot`. See [[Split Games]] for the full mechanics (bracket shape,
who-pays modes, claim/takeover). `entrants` is a name snapshot taken at creation, so the
bracket still renders correctly if a member later leaves the group or a placeholder gets
claimed — the same "denormalized, not source of truth" pattern `GroupMember`'s payment
fields already use.

Added with online play (ADR-003), all **absent on older docs**: `playMode`
(`"local" | "online"`, read absent as `"local"`), `autoBook` (a `GameExpenseDraft` — the
expense minus its split — booked server-side when the bracket finishes), `expenseId` (set
once booked), `autoBookError` (why it couldn't be, e.g. `"member-left"`).

## `LiveMatch` / `liveSecrets`

One online match's move-by-move board, `tournaments/{id}/liveMatches/{matchId}`. Written
only by `playOnlineMove`/`openOnlineMatch`; both players and spectators `onSnapshot` it.
`state` is per-game and **flat** — Firestore rejects nested arrays, so Tic-Tac-Toe and Vier
gewinnt store a move list (`moves` / `columns`) that is replayed through the pure rule
modules instead of a board (a matchstick-duel action is one small integer: a take, the same
take flagged "played by the fuse", or a joker — see `nim.ts`). `players` swap on every draw replay (`attempt` +1), so colors
are keyed to the _person_ (the bracket match's player order), not the seat. The memory
deck lives in `liveSecrets/{matchId}`, which rules make unreadable — faces only reach the
public `state` once flipped.

`ChatMessage.gameInvite` (`{ tournamentId, gameId }`, absent on normal messages) marks the
automatic challenge an online game posts; the chat renders it as a join card. Since 2026-10
also `luckInvite` (`{ roundId, gameId }`, an online luck round) and `gameResult`
(`ChatGameResult`: game, losers, a sole winner, the amount, the attempt, and the
tournament's or round's id) — see [[Chat]].

`Tournament.rematchId` (absent until someone asks for a "Revanche") points at the rematch,
so a second player's tap joins it instead of starting another.

## `LuckRound`

One online luck round (`groups/{groupId}/luckRounds/{roundId}`, ADR-005), for now the scratch
cards: `entrants` (name snapshot), `order` (card order, server-shuffled), `targetLoserCount`,
`revealed: Record<uid, boolean>` (filled card by card — a face is drawn only when scratched,
so there is no secret anywhere), `revealedBy`, `loserUids` once done, and the bill
(`stake`, `autoBook`, `expenseId`, `autoBookError`). `Group.activeLuckRound`
(`{ id, gameId } | null`, absent on groups that never had one) points at the running round
so the group page's banner needs no extra listener.

## `ChatMessage` / `ChatRead`

Text-only chat, no attachments/edits/reactions in v1. `ChatRead` doc id equals the member's
uid (one receipt per member, enforced by Firestore doc-id semantics rather than a query).
See [[Chat]].

## Related

[[Data Access Pattern]] · [[Firestore Rules]] · [[Money Invariants]] · [[Groups and Members]]
