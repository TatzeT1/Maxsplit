import type { CategoryId } from "@/lib/types";

export interface CategoryTotal {
  category: CategoryId;
  amountMinor: number;
}

/**
 * Sums expense amounts per category for the spending-analytics breakdown.
 * Uncategorized expenses (`category: null`) are folded into "other" — the
 * same bucket `categoryIcon`/`categoryColorClasses` already fall back to for
 * a null category, so the chart reads consistently with the rest of the UI.
 * Sorted descending by amount so the biggest spending category leads.
 */
export function computeCategoryTotals(
  expenses: { category: CategoryId | null; amountMinor: number }[],
): CategoryTotal[] {
  const totals: Partial<Record<CategoryId, number>> = {};
  for (const expense of expenses) {
    const key = expense.category ?? "other";
    totals[key] = (totals[key] ?? 0) + expense.amountMinor;
  }

  return (Object.entries(totals) as [CategoryId, number][])
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
