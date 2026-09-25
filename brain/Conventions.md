---
tags: [reference, conventions, style]
---

# Conventions

Patterns that repeat across the codebase enough to be load-bearing — deviating from them
without a reason is more likely a bug than a style choice.

## Server Actions

Every file in `src/lib/actions/*.ts` starts with `"use server"` and every exported function:

1. `const session = await getSession(); if (!session) return { ok: false, error: "unauthenticated" };`
2. Look up the group/resource via `adminDb`, check the caller against `memberUids` or
   `members` as appropriate (see [[Data Model]] for which one).
3. Validate input shape and business rules, returning a specific string `error` code per
   failure (`"invalid-amount"`, `"forbidden"`, `"not-found"`, `"not-owner"`, ...) — never throw
   for an *expected* rejection.
4. Mutate. If expenses/settlements changed, call `recomputeGroupBalances(groupRef)` after.
5. Return `ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }`.

Error codes are strings, not enums — the UI maps them to German copy via `t()`. When adding a
new failure case, add a new short, kebab-free string code (existing style:
`"invalid-description"`, `"owner-cannot-leave"`, `"cannot-remove-owner"`) rather than reusing
an unrelated one; the string *is* the contract between the action and its caller.

## Absent vs. false/null — a recurring data-model pattern

Optional fields added after a document type already existed (`Group.icon`,
`Group.balancesMinor`, `Group.settlementShareToken`, `GroupMember.isPlaceholder` on very old
docs, `Expense.emoji`, `Expense.viaLottery`) are **absent**, not `false`/`null`, on documents
created before the field existed. The convention throughout is: check with `?.` or
`=== true`, never assume presence, and never treat "absent" as an error state — it's just
"predates this feature." See [[Data Model]] for the specific fields this applies to.

## "Define once, used by both sides that must agree"

When a constraint needs to be enforced in two places (client-side UX limit + server-side
validation), it's defined **once** and imported by both, never duplicated as two numbers that
could drift:
- `MAX_MESSAGE_LENGTH` (`src/lib/chat/constants.ts`) — chat input limit + `sendMessage`
  rejection.
- The German dictionary (`src/lib/i18n/de.ts`) — every UI string, everywhere, once.
- `THEME_INIT_SCRIPT`'s storage key/values must match `theme-provider.tsx`'s — not imported
  (it's a raw inline script, can't `import` before hydration) but explicitly commented as
  needing to stay in sync — see [[Design System and Theming]].

## Soft delete, never hard delete, for ledger entries

`Expense.deletedAt` — expenses are never actually removed; every aggregation
(`computeBalances`, `recomputeGroupBalances`, the PDF export, activity displays) filters
`!expense.deletedAt`. Settlements, by contrast, **are** hard-deleted (`deleteSettlement` calls
`.delete()`) — the asymmetry is real, not an inconsistency to "fix." Groups are also
hard-deleted (`recursiveDelete`) when the owner deletes the whole group.

## Money is always `amountMinor: number` (integer cents) + `currency: string`

Never a float, never a pre-formatted string, anywhere in the data model or in a Server
Action's input type. Formatting to a display string (`1.234,56 €`) happens exclusively in
`src/lib/format/money.ts`, at render time, via `Intl.NumberFormat('de-DE')` — never
hand-rolled string concatenation. See [[Money Invariants]] and [[i18n]].

## `isGroupManager(role)` is the one permission check, reused everywhere

`owner` or `admin` → can manage membership, can edit/delete *anyone's* expense or settlement
in the group. Don't reimplement `role === "owner" || role === "admin"` inline — import and
call `isGroupManager` (`src/lib/groups/permissions.ts`) so the definition of "manager" stays
in exactly one place.

## Commit style

Conventional Commits (`feat:`, `fix:`, `chore:`) per the original working agreement in
`plan.md` — small, reviewable commits, nothing merges red (see [[Local Development and
Testing]]'s Definition of Done).

## Related
[[Data Access Pattern]] · [[Data Model]] · [[Money Invariants]] · [[i18n]]
