import { describe, expect, it } from "vitest";
import { buildGameExpense, validateGameExpenseDraft } from "./game-expense";
import type { GameExpenseDraft, GroupMember } from "@/lib/types";

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});
const members = { a: member("A"), b: member("B"), c: member("C") };

const draft: GameExpenseDraft = {
  description: " Pizza ",
  amountMinor: 1000,
  currency: "EUR",
  date: "2026-09-28",
  category: "restaurant",
  emoji: null,
  paidBy: { a: 1000 },
};

describe("validateGameExpenseDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateGameExpenseDraft(draft, members)).toBeNull();
  });

  it.each([
    [{ description: "  " }, "invalid-description"],
    [{ amountMinor: 0 }, "invalid-amount"],
    [{ amountMinor: 10.5 }, "invalid-amount"],
    [{ date: "28.09.2026" }, "invalid-date"],
    [{ paidBy: {} }, "invalid-payer"],
    [{ paidBy: { a: 999 } }, "invalid-payer"],
    [{ paidBy: { stranger: 1000 } }, "forbidden"],
  ] as const)("rejects %o with %s", (patch, error) => {
    expect(validateGameExpenseDraft({ ...draft, ...patch }, members)).toBe(error);
  });
});

describe("buildGameExpense", () => {
  it("splits the bill equally across the losers, cent-exact", () => {
    const expense = buildGameExpense({
      draft,
      loserUids: ["b", "c", "a"],
      createdBy: "a",
      now: "2026-09-28T12:00:00.000Z",
    });
    const amounts = Object.values(expense.splits).map((s) => s.amountMinor);
    expect(amounts.reduce((sum, n) => sum + n, 0)).toBe(1000);
    // Rounding cent goes to the first loser, like splitEqual everywhere else.
    expect(expense.splits.b.amountMinor).toBe(334);
    expect(expense.splitMode).toBe("exact");
    expect(expense.viaLottery).toBe(true);
    expect(expense.description).toBe("Pizza");
    expect(expense.paidBy).toEqual({ a: 1000 });
  });

  it("a single loser owes the whole amount", () => {
    const expense = buildGameExpense({ draft, loserUids: ["b"], createdBy: "a", now: "x" });
    expect(expense.splits).toEqual({ b: { rawValue: 1000, amountMinor: 1000 } });
  });
});
