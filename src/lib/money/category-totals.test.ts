import { describe, expect, it } from "vitest";
import { computeCategoryTotals } from "./category-totals";

describe("computeCategoryTotals", () => {
  it("sums amounts per category", () => {
    const totals = computeCategoryTotals([
      { category: "groceries", amountMinor: 1000 },
      { category: "groceries", amountMinor: 500 },
      { category: "transport", amountMinor: 300 },
    ]);

    expect(totals).toEqual([
      { category: "groceries", amountMinor: 1500 },
      { category: "transport", amountMinor: 300 },
    ]);
  });

  it("folds a null category into other", () => {
    const totals = computeCategoryTotals([
      { category: null, amountMinor: 400 },
      { category: "other", amountMinor: 100 },
    ]);

    expect(totals).toEqual([{ category: "other", amountMinor: 500 }]);
  });

  it("sorts descending by amount", () => {
    const totals = computeCategoryTotals([
      { category: "health", amountMinor: 100 },
      { category: "travel", amountMinor: 900 },
      { category: "shopping", amountMinor: 500 },
    ]);

    expect(totals.map((t) => t.category)).toEqual(["travel", "shopping", "health"]);
  });

  it("returns an empty array for no expenses", () => {
    expect(computeCategoryTotals([])).toEqual([]);
  });
});
