// The Auswertung's numbers: what a group spent on what, in a month, a year
// or overall — for the whole group or for one person's share. Computed on
// the client from the expenses the group page already listens to.

import { receiptLineShares } from "@/lib/receipt/receipt";
import type { Expense, ProductClass, ProductFamilyId } from "@/lib/types";
import { productKindKey } from "./products";

export type Period =
  { kind: "month"; year: number; month: number } | { kind: "year"; year: number } | { kind: "all" };

/** Whether a `yyyy-mm-dd` date lies in `period`. */
export function inPeriod(date: string, period: Period): boolean {
  switch (period.kind) {
    case "all":
      return true;
    case "year":
      return date.startsWith(`${period.year}-`);
    case "month":
      return date.startsWith(`${period.year}-${String(period.month).padStart(2, "0")}-`);
  }
}

/** The period `delta` steps before or after; "all" has no neighbours. */
export function shiftPeriod(period: Period, delta: number): Period {
  switch (period.kind) {
    case "all":
      return period;
    case "year":
      return { kind: "year", year: period.year + delta };
    case "month": {
      const index = period.year * 12 + (period.month - 1) + delta;
      return { kind: "month", year: Math.floor(index / 12), month: (index % 12) + 1 };
    }
  }
}

/** One row of the table: an amount, who it was for, how many lines or expenses make it up. */
export interface Total {
  amountMinor: number;
  /** Per person — only the group view shows it; in a person's view it is just them. */
  byUid: Record<string, number>;
  count: number;
}

export interface KindTotal extends Total {
  kind: string;
}

export interface FamilyTotal extends Total {
  family: ProductFamilyId;
  kinds: KindTotal[];
}

export interface ProductTotals extends Total {
  families: FamilyTotal[];
  /** What no member and no model has classified yet. */
  unclassified: Total;
}

interface Contribution {
  product: ProductClass | null;
  byUid: Record<string, number>;
}

/**
 * What one expense adds to the table: each receipt line with its part of the
 * booked amount (tip and discount spread, see receiptLineShares), or the
 * whole expense under its own class. Per person it is always what they were
 * booked — a receipt's people by their lines, everyone else by their split.
 */
function contributions(expense: Expense): Contribution[] {
  const items = expense.receipt?.items;
  if (items && items.length > 0) {
    try {
      const shares = receiptLineShares(expense.amountMinor, items);
      return items.map((item, index) => ({ product: item.product ?? null, byUid: shares[index] }));
    } catch {
      // A receipt that no longer allocates (it can't be booked so, but old
      // data is old data): the whole expense, by its split.
    }
  }
  const byUid = Object.fromEntries(
    Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
  );
  return [{ product: expense.product ?? null, byUid }];
}

function emptyTotal(): Total {
  return { amountMinor: 0, byUid: {}, count: 0 };
}

function add(total: Total, amountMinor: number, byUid: Record<string, number>): void {
  total.amountMinor += amountMinor;
  total.count += 1;
  for (const [uid, amount] of Object.entries(byUid)) {
    total.byUid[uid] = (total.byUid[uid] ?? 0) + amount;
  }
}

const byAmount = (a: Total, b: Total) => b.amountMinor - a.amountMinor;

/**
 * Sums `expenses` in `period` by family and kind, biggest first. With `uid`,
 * only that person's share counts (rows they had nothing of are left out);
 * without, the whole group's. Every amount is integer minor units, and the
 * rows add up to the total exactly.
 */
export function computeProductTotals(
  expenses: readonly Expense[],
  period: Period,
  uid: string | null = null,
): ProductTotals {
  const total = emptyTotal();
  const unclassified = emptyTotal();
  const families = new Map<ProductFamilyId, Total & { kinds: Map<string, KindTotal> }>();

  for (const expense of expenses) {
    if (expense.deletedAt || !inPeriod(expense.date, period)) continue;
    for (const { product, byUid: all } of contributions(expense)) {
      const byUid = uid === null ? all : all[uid] ? { [uid]: all[uid] } : {};
      const amountMinor = Object.values(byUid).reduce((sum, amount) => sum + amount, 0);
      if (amountMinor === 0) continue;
      add(total, amountMinor, byUid);
      if (!product) {
        add(unclassified, amountMinor, byUid);
        continue;
      }
      let family = families.get(product.family);
      if (!family) {
        family = { ...emptyTotal(), kinds: new Map() };
        families.set(product.family, family);
      }
      add(family, amountMinor, byUid);
      const key = productKindKey(product.kind);
      let kind = family.kinds.get(key);
      if (!kind) {
        kind = { ...emptyTotal(), kind: product.kind };
        family.kinds.set(key, kind);
      }
      add(kind, amountMinor, byUid);
    }
  }

  return {
    ...total,
    unclassified,
    families: [...families.entries()]
      .map(([family, { kinds, ...rest }]) => ({
        ...rest,
        family,
        kinds: [...kinds.values()].sort(byAmount),
      }))
      .sort(byAmount),
  };
}
