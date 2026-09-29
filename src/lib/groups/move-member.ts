import type { ExpenseSplit } from "@/lib/types";

// Moving one member's stake in a ledger entry onto another uid — what claiming
// a placeholder does to every expense and recurring rule that names it (see
// claimPlaceholder in lib/actions/groups.ts). If `to` already has a stake of
// its own (someone who left the group and rejoins by claiming a placeholder
// that shared an expense with their old self), the two are added together
// rather than one overwriting the other: overwriting would silently drop an
// amount and break `sum(paidBy) === sum(splits) === amountMinor`.

/** `paidBy` with `from`'s amount moved onto `to`; null when `from` has no entry (nothing to rewrite). */
export function moveMemberAmount(
  amounts: Record<string, number>,
  from: string,
  to: string,
): Record<string, number> | null {
  if (!(from in amounts)) return null;
  const { [from]: moved, ...rest } = amounts;
  return { ...rest, [to]: (rest[to] ?? 0) + moved };
}

/** `splits` with `from`'s share moved onto `to`; null when `from` has no share (nothing to rewrite). */
export function moveMemberSplit(
  splits: Record<string, ExpenseSplit>,
  from: string,
  to: string,
): Record<string, ExpenseSplit> | null {
  if (!(from in splits)) return null;
  const { [from]: moved, ...rest } = splits;
  const existing = rest[to];
  return {
    ...rest,
    [to]: existing
      ? {
          rawValue: existing.rawValue + moved.rawValue,
          amountMinor: existing.amountMinor + moved.amountMinor,
        }
      : moved,
  };
}

/**
 * The Firestore update that moves `from`'s stake onto `to` in anything shaped
 * like an expense (expenses and recurring rules both are), or null when it
 * doesn't mention `from` at all.
 */
export function moveMemberInLedgerEntry(
  entry: { paidBy: Record<string, number>; splits: Record<string, ExpenseSplit> },
  from: string,
  to: string,
): { paidBy?: Record<string, number>; splits?: Record<string, ExpenseSplit> } | null {
  const paidBy = moveMemberAmount(entry.paidBy, from, to);
  const splits = moveMemberSplit(entry.splits, from, to);
  if (!paidBy && !splits) return null;
  return { ...(paidBy && { paidBy }), ...(splits && { splits }) };
}
