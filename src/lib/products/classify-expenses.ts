import "server-only";

// Fills in the ProductClass of stored expenses: the description of one
// without a receipt, the lines of a receipt that have none (typed by hand,
// or a scan whose answer for the line was unusable). Used right after an
// expense is saved (classify-after.ts) and by "Jetzt einordnen" in the
// Auswertung tab (actions/products.ts).

import type { AskOptions } from "@/lib/receipt/scan";
import type { Expense, ProductClass } from "@/lib/types";
import { classifyEntries, type ClassifyEntry } from "./classify";
import { missingProductClasses, productKindKey } from "./products";

type ExpenseSnapshot = FirebaseFirestore.DocumentSnapshot;

/**
 * Classifies whatever `snapshots` still miss, in as few requests as the
 * batch size allows (one text asked once, however many expenses carry it),
 * and writes the answers back. Each write is conditional on the expense not
 * having changed since it was read: an edit in between wins, and whatever
 * it left unclassified is picked up next time. Returns how many expenses
 * got at least one answer.
 */
export async function classifyExpenseSnapshots(
  snapshots: readonly ExpenseSnapshot[],
  options: AskOptions = {},
): Promise<number> {
  const entries: ClassifyEntry[] = [];
  const indexByKey = new Map<string, number>();
  const entryIndex = (text: string, hint: string | null): number => {
    const key = `${productKindKey(text.trim())}\u0000${hint ?? ""}`;
    let index = indexByKey.get(key);
    if (index === undefined) {
      index = entries.push({ text: text.trim(), hint }) - 1;
      indexByKey.set(key, index);
    }
    return index;
  };

  const plans = snapshots.flatMap((snapshot) => {
    if (!snapshot.exists || !snapshot.updateTime) return [];
    const expense = snapshot.data() as Omit<Expense, "id">;
    const missing = missingProductClasses(expense);
    if (!missing.expense && missing.lines.length === 0) return [];
    return [
      {
        snapshot,
        expense,
        expenseEntry: missing.expense ? entryIndex(expense.description, expense.category) : null,
        lineEntries: missing.lines.map((line) => ({
          line,
          entry: entryIndex(expense.receipt!.items[line].name, expense.category),
        })),
      },
    ];
  });
  if (entries.length === 0) return 0;

  const answers: (ProductClass | null)[] = await classifyEntries(entries, options);

  const writes = plans.map(async ({ snapshot, expense, expenseEntry, lineEntries }) => {
    const update: Record<string, unknown> = {};
    const product = expenseEntry !== null ? answers[expenseEntry] : null;
    if (product) update.product = product;
    const filled = lineEntries.filter(({ entry }) => answers[entry] !== null);
    if (filled.length > 0 && expense.receipt) {
      const items = expense.receipt.items.map((item) => ({ ...item }));
      for (const { line, entry } of filled) items[line].product = answers[entry]!;
      update.receipt = { ...expense.receipt, items };
    }
    if (Object.keys(update).length === 0) return false;
    await snapshot.ref.update(update, { lastUpdateTime: snapshot.updateTime! });
    return true;
  });
  const results = await Promise.allSettled(writes);
  for (const result of results) {
    // A failed precondition is an edit that came first — expected, not worth a log line.
    if (result.status === "rejected" && (result.reason as { code?: unknown })?.code !== 9) {
      console.warn("[product-classify] write failed:", result.reason);
    }
  }
  return results.filter((result) => result.status === "fulfilled" && result.value).length;
}
