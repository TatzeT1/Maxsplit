import { describe, expect, it } from "vitest";
import { computeBalances, computePairwiseDebts } from "./balances";
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

describe("computePairwiseDebts", () => {
  it("shows a direct debt from participant to payer for a two-person expense", () => {
    const splits = splitEqual(2000, ["a", "b"]);
    const net = computePairwiseDebts([{ payerUid: "a", splits }]);

    expect(net.b.a).toBe(1000); // b owes a 10.00
    expect(net.a.b).toBe(-1000); // mirror is always the negation
  });

  it("keeps net[a][b] === -net[b][a] for a three-person expense", () => {
    const splits = splitEqual(3000, ["a", "b", "c"]);
    const net = computePairwiseDebts([{ payerUid: "a", splits }]);

    expect(net.b.a).toBe(1000);
    expect(net.c.a).toBe(1000);
    expect(net.a.b).toBe(-net.b.a);
    expect(net.a.c).toBe(-net.c.a);
  });

  it("nets multiple expenses between the same pair", () => {
    const expense1 = { payerUid: "a", splits: splitEqual(2000, ["a", "b"]) };
    const expense2 = { payerUid: "b", splits: splitEqual(1000, ["a", "b"]) };
    const net = computePairwiseDebts([expense1, expense2]);

    // b owed a 1000 from expense1, a owed b 500 from expense2 -> net b owes a 500.
    expect(net.b.a).toBe(500);
    expect(net.a.b).toBe(-500);
  });

  it("settlements reduce the debt they're paying down", () => {
    const splits = splitEqual(2000, ["a", "b"]);
    const net = computePairwiseDebts(
      [{ payerUid: "a", splits }],
      [{ fromUid: "b", toUid: "a", amountMinor: 1000 }],
    );

    expect(net.b.a).toBe(0);
    expect(net.a.b).toBe(0);
  });

  it("ignores a participant who is also the payer", () => {
    const splits = splitEqual(1000, ["a"]);
    const net = computePairwiseDebts([{ payerUid: "a", splits }]);

    expect(net.a).toBeUndefined();
  });
});
