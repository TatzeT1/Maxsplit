import { describe, expect, it } from "vitest";
import { buildGameExpense, validateGameExpenseDraft } from "./game-expense";
import type { CategoryId, GameExpenseDraft, GroupMember } from "@/lib/types";

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
    [{ date: "2026-02-30" }, "invalid-date"],
    [{ description: "x".repeat(201) }, "invalid-description"],
    // A hand-crafted request can carry any string; the type is compile-time only.
    [{ category: "bogus" as unknown as CategoryId }, "invalid-category"],
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

  it("records which game decided it, like a hand-applied result", () => {
    const game = { gameId: "memory" as const, playerUids: ["a", "b", "c"], attempt: 1 };
    const expense = buildGameExpense({ draft, loserUids: ["b"], game, createdBy: "a", now: "x" });
    expect(expense.game).toEqual(game);
    expect(
      buildGameExpense({ draft, loserUids: ["b"], createdBy: "a", now: "x" }),
    ).not.toHaveProperty("game");
  });
});

describe("stake games (payerIsWinner)", () => {
  const stake: GameExpenseDraft = { ...draft, paidBy: {}, payerIsWinner: true };

  it("accepts a draft with no payer yet", () => {
    expect(validateGameExpenseDraft(stake, members)).toBeNull();
  });

  it("rejects a preset payer", () => {
    expect(validateGameExpenseDraft({ ...stake, paidBy: { a: 1000 } }, members)).toBe(
      "invalid-payer",
    );
  });

  it("books the winner as the payer and splits across the losers", () => {
    const expense = buildGameExpense({
      draft: stake,
      loserUids: ["b", "c"],
      winnerUid: "a",
      createdBy: "a",
      now: "2026-09-28T12:00:00.000Z",
    });
    expect(expense.paidBy).toEqual({ a: 1000 });
    expect(expense.splits.b.amountMinor + expense.splits.c.amountMinor).toBe(1000);
  });

  it("refuses to build without a winner", () => {
    expect(() =>
      buildGameExpense({ draft: stake, loserUids: ["b"], createdBy: "a", now: "x" }),
    ).toThrow();
  });
});
