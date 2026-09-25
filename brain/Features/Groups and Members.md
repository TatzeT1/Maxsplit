---
tags: [feature, groups, membership]
---

# Groups and Members

Server Actions: `src/lib/actions/groups.ts`. UI: `src/components/groups/*` (create/edit/join
dialogs, `members-panel.tsx`, `row-actions.tsx`). Permission helper:
`src/lib/groups/permissions.ts`.

## Roles

`GroupRole = "owner" | "admin" | "member"` (`src/lib/types.ts`). `isGroupManager(role)` is
`true` for `owner` or `admin` — the single gate used everywhere "can edit/delete anyone's
expense" or "can manage membership" is checked. Rules:

- Exactly one **owner** per group (the creator). An owner **cannot leave**
  (`leaveGroup` → `"owner-cannot-leave"`) and **cannot be removed**
  (`removeMember` → `"cannot-remove-owner"`).
- Only the owner can promote/demote **admin ↔ member** (`setMemberRole`), and only to those
  two roles — the input type is compile-time-only, so the action explicitly rejects anything
  else server-side (a hand-crafted request could otherwise carry an arbitrary string and mint
  a second "owner" or a bogus role that slips past `isGroupManager`).
- An **admin cannot remove another admin** (`removeMember`: `actor.role === "admin" &&
  target.role === "admin"` → forbidden) — only the owner can.
- Nobody can remove themselves via `removeMember` (`"cannot-remove-self"` — that's what
  `leaveGroup` is for).

## Leaving / removal is blocked while unsettled

Both `leaveGroup` and `removeMember` call `computeMemberBalance(groupRef, uid)` — a fresh
`computeBalances` over the **whole** ledger (not just current members) — and refuse
(`"unsettled-balance"`) if it's nonzero. This exists because [[Balances and Settlements]]'s
BalanceView only ever renders debts for `Object.keys(members)` — silently removing a member
with a nonzero balance would make their debt vanish from the UI even though the
expenses/settlements that created it are still sitting in the ledger, breaking the zero-sum
invariant's *visibility* (the math still sums to zero underneath, but nobody could see who
owes what anymore).

## Invite codes

`src/lib/groups/invite-code.ts` (`generateInviteCode`, `normalizeInviteCode`). `createGroup`
retries up to `MAX_INVITE_CODE_ATTEMPTS = 5` times to find a code with no existing collision
(`where("inviteCode", "==", code).limit(1)`). Joining is a two-step UX:
`previewGroupByInviteCode` (shows the group name + any placeholder members before committing)
→ `joinGroupByInviteCode` (actually joins, optionally claiming a placeholder — see below).

## Placeholder members

`GroupMember.isPlaceholder: true` — a member added by display name only, with **no Firebase
Auth account behind them yet**. The point: a group's expenses and balances can be correct
(e.g. "Anna owes Tom 12€ from the trip") before Anna has actually signed up and joined the
app. Created two ways: at group creation (`createGroup({ memberNames })`) or later
(`addPlaceholderMember`, `renamePlaceholderMember` — both require `isGroupManager`).

Placeholders are:
- **Valid participants** in expenses and settlements — `resolveExpense` in
  `lib/actions/expenses.ts` checks candidate uids against `group.members` (real +
  placeholder), not `memberUids` (real only).
- **Never in `memberUids`** — so `firestore.rules`' membership check never sees them; they
  have no session, so this is correct (see [[Data Model]] on why the two fields aren't
  redundant).

### Claiming a placeholder

When a real person's invite-code join matches an existing placeholder
(`joinGroupByInviteCode({ claimPlaceholderId })`), `claimPlaceholder` in `groups.ts`:

1. Rewrites every expense's `paidBy`/`splits` and every settlement's `fromUid`/`toUid` from
   `placeholderId` → the new real `uid`, in one Firestore batch (500-write limit — this is
   explicitly **not** built to handle a placeholder referenced by hundreds of expenses; fine
   at this app's actual scale).
2. Replaces the placeholder's `members` entry with a real one, adds the uid to `memberUids`.
3. Calls `recomputeGroupBalances` afterward.

The whole point is that the real person "becomes" the placeholder rather than starting a
second, disconnected identity in the ledger.

## Deleting a group

`deleteGroup` requires `role === "owner"` and uses `adminDb.recursiveDelete(groupRef)` —
wipes all subcollections (expenses, settlements, recurring, activityLog, messages,
chatReads) in one call. No soft-delete at the group level (unlike expenses — see
[[Data Model]]).

## Related
[[Data Model]] · [[Data Access Pattern]] · [[Balances and Settlements]] · [[Admin Panel]]
