import { describe, expect, it } from "vitest";
import { computeBalances } from "./balances";
import { splitEqual } from "./split";

describe("computeBalances", () => {
  it("nets to zero across the group for a single equal-split expense", () => {
    const splits = splitEqual(3000, ["a", "b", "c"]);
    const balances = computeBalances([{ paidBy: { a: 3000 }, splits }]);

    const sum = Object.values(balances).reduce((total, v) => total + v, 0);
    expect(sum).toBe(0);
    expect(balances.a).toBe(2000); // paid 3000, owes back 1000
    expect(balances.b).toBe(-1000);
    expect(balances.c).toBe(-1000);
  });

  it("nets to zero for an odd amount whose split has a rounding remainder", () => {
    const splits = splitEqual(100, ["a", "b", "c"]);
    const balances = computeBalances([{ paidBy: { a: 100 }, splits }]);

    const sum = Object.values(balances).reduce((total, v) => total + v, 0);
    expect(sum).toBe(0);
  });

  it("nets to zero across multiple expenses with multiple payers", () => {
    const expense1Splits = splitEqual(3000, ["a", "b", "c"]);
    const expense2Splits = splitEqual(2000, ["a", "b"]);

    const balances = computeBalances([
      { paidBy: { a: 3000 }, splits: expense1Splits },
      { paidBy: { a: 1000, b: 1000 }, splits: expense2Splits },
    ]);

    const sum = Object.values(balances).reduce((total, v) => total + v, 0);
    expect(sum).toBe(0);
  });

  it("settlements move balances toward zero and preserve the zero-sum invariant", () => {
    const splits = splitEqual(2000, ["a", "b"]);
    const balances = computeBalances(
      [{ paidBy: { a: 2000 }, splits }],
      [{ fromUid: "b", toUid: "a", amountMinor: 1000 }],
    );

    expect(balances.a).toBe(0);
    expect(balances.b).toBe(0);
    const sum = Object.values(balances).reduce((total, v) => total + v, 0);
    expect(sum).toBe(0);
  });
});
