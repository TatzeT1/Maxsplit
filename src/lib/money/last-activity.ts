import type { Expense, GroupLastActivity, Settlement } from "@/lib/types";

type ExpenseLike = Pick<
  Expense,
  "description" | "emoji" | "amountMinor" | "createdAt" | "paidBy" | "createdBy" | "deletedAt"
>;
type SettlementLike = Pick<Settlement, "fromUid" | "toUid" | "amountMinor" | "createdAt">;

/** The payer who put in the most — for a multi-payer expense, its "main" payer. */
function mainPayer(expense: ExpenseLike): string {
  let best = expense.createdBy;
  let bestMinor = -Infinity;
  for (const [uid, minor] of Object.entries(expense.paidBy)) {
    if (minor > bestMinor) {
      best = uid;
      bestMinor = minor;
    }
  }
  return best;
}

/**
 * The newest live entry of a ledger, by creation time — what the groups list
 * shows as "Letzte Aktivität". Deleted expenses are skipped, so undoing the
 * newest one falls back to the entry before it. Null for an empty ledger.
 */
export function latestActivity(
  expenses: readonly ExpenseLike[],
  settlements: readonly SettlementLike[],
): GroupLastActivity | null {
  let latest: GroupLastActivity | null = null;
  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    if (latest && expense.createdAt <= latest.at) continue;
    latest = {
      kind: "expense",
      description: expense.description,
      emoji: expense.emoji ?? null,
      amountMinor: expense.amountMinor,
      at: expense.createdAt,
      byUid: mainPayer(expense),
    };
  }
  for (const settlement of settlements) {
    if (latest && settlement.createdAt <= latest.at) continue;
    latest = {
      kind: "settlement",
      description: "",
      amountMinor: settlement.amountMinor,
      at: settlement.createdAt,
      byUid: settlement.fromUid,
      toUid: settlement.toUid,
    };
  }
  return latest;
}
