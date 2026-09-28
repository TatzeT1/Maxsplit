import { describe, expect, it } from "vitest";
import { computeBalances } from "./balances";
import { expenseImpactFor } from "./expense-impact";

type LedgerExpense = {
  paidBy: Record<string, number>;
  splits: Record<string, { amountMinor: number }>;
};

const split = (amounts: Record<string, number>) =>
  Object.fromEntries(Object.entries(amounts).map(([uid, amountMinor]) => [uid, { amountMinor }]));

describe("expenseImpactFor", () => {
  it("credits the payer with everything but their own share", () => {
    const expense = { paidBy: { max: 8640 }, splits: split({ max: 1728, anna: 1728, ben: 5184 }) };
    expect(expenseImpactFor(expense, "max")).toBe(6912);
  });

  it("charges a participant who didn't pay their full share", () => {
    const expense = { paidBy: { anna: 5400 }, splits: split({ max: 1350, anna: 1350, ben: 2700 }) };
    expect(expenseImpactFor(expense, "max")).toBe(-1350);
  });

  it("is null for someone who neither paid nor shares in it", () => {
    const expense = { paidBy: { anna: 2999 }, splits: split({ ben: 2999 }) };
    expect(expenseImpactFor(expense, "max")).toBeNull();
  });

  it("is zero for a payer who covered exactly their own share", () => {
    const expense = { paidBy: { max: 1000, anna: 1000 }, splits: split({ max: 1000, anna: 1000 }) };
    expect(expenseImpactFor(expense, "max")).toBe(0);
  });

  it("counts a payer who isn't part of the split as owed the whole amount", () => {
    const expense = { paidBy: { max: 3150 }, splits: split({ anna: 3150 }) };
    expect(expenseImpactFor(expense, "max")).toBe(3150);
  });

  it("sums, across a ledger, to the same net balance computeBalances reports", () => {
    const expenses: LedgerExpense[] = [
      { paidBy: { max: 8640 }, splits: split({ max: 1728, anna: 1728, ben: 5184 }) },
      { paidBy: { anna: 5400 }, splits: split({ max: 1350, anna: 1350, ben: 2700 }) },
      { paidBy: { max: 600, ben: 400 }, splits: split({ max: 334, anna: 333, ben: 333 }) },
      { paidBy: { anna: 2999 }, splits: split({ ben: 2999 }) },
    ];
    const balances = computeBalances(
      expenses.map((expense) => ({
        paidBy: expense.paidBy,
        splits: Object.fromEntries(
          Object.entries(expense.splits).map(([uid, entry]) => [uid, entry.amountMinor]),
        ),
      })),
    );
    for (const uid of ["max", "anna", "ben"]) {
      const total = expenses.reduce(
        (sum, expense) => sum + (expenseImpactFor(expense, uid) ?? 0),
        0,
      );
      expect(total).toBe(balances[uid]);
    }
  });
});
