/**
 * What a single expense does to one member's balance, in minor units: what
 * they paid toward it minus their share of it. Positive means the group owes
 * them from this expense, negative means they owe, `null` means they neither
 * paid nor share in it.
 *
 * It's the per-expense term `computeBalances` sums over the whole ledger,
 * so the rows in a group's expense list always add up to the balance above
 * them (before settlements). Display-only, per ADR-001 — nothing computed
 * here is ever written back.
 */
export function expenseImpactFor(
  expense: { paidBy: Record<string, number>; splits: Record<string, { amountMinor: number }> },
  uid: string,
): number | null {
  const paid = expense.paidBy[uid];
  const share = expense.splits[uid]?.amountMinor;
  if (paid === undefined && share === undefined) return null;
  return (paid ?? 0) - (share ?? 0);
}
