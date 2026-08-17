import "server-only";
import type { Expense, Settlement } from "@/lib/types";
import { computeBalances } from "./balances";

/**
 * Recomputes a group's full balance ledger and writes it to
 * `groups/{id}.balancesMinor` (see the field's doc comment in types.ts).
 * Called after every Server Action that mutates a group's expenses or
 * settlements, so the cache is always as fresh as the ledger it mirrors.
 * Best-effort: a write failure here must never fail the caller's primary
 * mutation, which already succeeded — the cache just stays stale until the
 * next call.
 */
export async function recomputeGroupBalances(
  groupRef: FirebaseFirestore.DocumentReference,
): Promise<void> {
  try {
    const [expensesSnap, settlementsSnap] = await Promise.all([
      groupRef.collection("expenses").get(),
      groupRef.collection("settlements").get(),
    ]);

    const expenses = expensesSnap.docs
      .map((doc) => doc.data() as Expense)
      .filter((expense) => !expense.deletedAt);
    const settlements = settlementsSnap.docs.map((doc) => doc.data() as Settlement);

    const balanceExpenses = expenses.map((expense) => ({
      paidBy: expense.paidBy,
      splits: Object.fromEntries(
        Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
      ),
    }));

    const balancesMinor = computeBalances(balanceExpenses, settlements);
    await groupRef.update({ balancesMinor });
  } catch (error) {
    console.error("recomputeGroupBalances failed", error);
  }
}
