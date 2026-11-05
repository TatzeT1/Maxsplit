import type { Expense } from "@/lib/types";

type ExpenseLike = Pick<Expense, "date" | "amountMinor" | "splits" | "deletedAt">;

export interface MonthSummary {
  /** "YYYY-MM" */
  monthKey: string;
  /** What the group spent — credits (negative amounts) net out. */
  totalMinor: number;
  /** Your share of it: the sum of your splits. */
  shareMinor: number;
  count: number;
}

/**
 * Spending per month, newest first: the group's total and your part of it.
 * Feeds the month headers of the ledger and the "Diesen Monat" line above it.
 * Pure display arithmetic over already-validated expenses — it decides
 * nothing about balances.
 */
export function summarizeMonths(
  expenses: readonly ExpenseLike[],
  uid: string,
): Map<string, MonthSummary> {
  const months = new Map<string, MonthSummary>();
  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    const monthKey = expense.date.slice(0, 7);
    let month = months.get(monthKey);
    if (!month) {
      month = { monthKey, totalMinor: 0, shareMinor: 0, count: 0 };
      months.set(monthKey, month);
    }
    month.totalMinor += expense.amountMinor;
    month.shareMinor += expense.splits[uid]?.amountMinor ?? 0;
    month.count += 1;
  }
  return new Map([...months.entries()].sort(([a], [b]) => b.localeCompare(a)));
}

/** "YYYY-MM" of a date in the device's time zone. */
export function monthKeyOfDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** The month before a "YYYY-MM" key. */
export function previousMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}
