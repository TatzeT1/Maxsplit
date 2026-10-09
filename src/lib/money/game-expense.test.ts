import { describe, expect, it } from "vitest";
import { ESTIMATE_CLAIM_WINDOW_MS } from "@/lib/games/estimate-input";
import {
  buildGameExpense,
  isClaimableEstimateRound,
  isEqualSplitAmong,
  sameUidSet,
  splitPayerUids,
  validateGameExpenseDraft,
} from "./game-expense";
import type { CategoryId, ExpenseSplit, GameExpenseDraft, GroupMember } from "@/lib/types";

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

  // `uid in members` follows the prototype chain: a hand-crafted payer such as
  // "constructor" would pass as a member and book an expense paid by a phantom.
  it.each(["constructor", "toString", "hasOwnProperty", "valueOf"])(
    "rejects the inherited property name %s as a payer",
    (uid) => {
      expect(validateGameExpenseDraft({ ...draft, paidBy: { [uid]: 1000 } }, members)).toBe(
        "forbidden",
      );
    },
  );

  it("rejects an own key called __proto__ as a payer", () => {
    // Only JSON.parse creates a real own "__proto__" key; an object literal would set the prototype.
    const paidBy = JSON.parse('{"__proto__":1000}') as Record<string, number>;
    expect(Object.keys(paidBy)).toEqual(["__proto__"]);
    expect(validateGameExpenseDraft({ ...draft, paidBy }, members)).toBe("forbidden");
  });

  it("still accepts a real member whose uid merely looks like trouble", () => {
    const odd = { ...members, constructor: member("Odd") };
    expect(validateGameExpenseDraft({ ...draft, paidBy: { constructor: 1000 } }, odd)).toBeNull();
  });

  it("accepts a payer that is a placeholder member", () => {
    const withPlaceholder = {
      ...members,
      p1: { ...member("Platzhalter"), isPlaceholder: true },
    };
    expect(
      validateGameExpenseDraft({ ...draft, paidBy: { p1: 1000 } }, withPlaceholder),
    ).toBeNull();
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

/** A split as the form sends it: positive amounts for the payers, an explicit 0 for anyone else. */
const split = (amounts: Record<string, number>): Record<string, ExpenseSplit> =>
  Object.fromEntries(
    Object.entries(amounts).map(([uid, amountMinor]) => [
      uid,
      { rawValue: amountMinor, amountMinor },
    ]),
  );

describe("splitPayerUids and sameUidSet", () => {
  it("names the people with a positive share, and compares uid lists without order", () => {
    expect(splitPayerUids(split({ a: 500, b: 0, c: 250 }))).toEqual(["a", "c"]);
    expect(sameUidSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameUidSet(["a", "b"], ["a"])).toBe(false);
    expect(sameUidSet(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameUidSet([], [])).toBe(true);
  });
});

describe("isEqualSplitAmong", () => {
  const payers = ["a", "b", "c"];

  it("accepts the equal split of the amount among exactly these payers", () => {
    expect(isEqualSplitAmong(3600, split({ a: 1200, b: 1200, c: 1200 }), payers)).toBe(true);
  });

  it("does not care who gets the odd cents: a stored map has no order to compare", () => {
    // 1001 across three: the extra cent goes to whoever comes first — any of them.
    expect(isEqualSplitAmong(1001, split({ a: 334, b: 334, c: 333 }), payers)).toBe(true);
    expect(isEqualSplitAmong(1001, split({ a: 333, b: 334, c: 334 }), payers)).toBe(true);
    expect(isEqualSplitAmong(1001, split({ a: 334, b: 333, c: 334 }), payers)).toBe(true);
  });

  it("rejects a hand-edited split", () => {
    expect(isEqualSplitAmong(3600, split({ a: 3400, b: 100, c: 100 }), payers)).toBe(false);
    // Right sum, but a cent moved to the wrong side of what an equal split can be.
    expect(isEqualSplitAmong(1001, split({ a: 335, b: 333, c: 333 }), payers)).toBe(false);
  });

  it("rejects a different payer set, a stale amount and an empty payer list", () => {
    expect(isEqualSplitAmong(3600, split({ a: 1800, b: 1800 }), payers)).toBe(false);
    expect(isEqualSplitAmong(3600, split({ a: 900, b: 900, c: 900, d: 900 }), payers)).toBe(false);
    // The amount was corrected, the inputs were not: 3 x 12,00 is no longer the equal split of 45,00.
    expect(isEqualSplitAmong(4500, split({ a: 1200, b: 1200, c: 1200 }), payers)).toBe(false);
    expect(isEqualSplitAmong(3600, split({}), [])).toBe(false);
  });

  it("ignores a zero share for a non-payer", () => {
    expect(isEqualSplitAmong(2000, split({ a: 1000, b: 1000, c: 0 }), ["a", "b"])).toBe(true);
  });
});

describe("isClaimableEstimateRound", () => {
  const NOW = "2026-10-08T12:00:00.000Z";
  const minutesBefore = (minutes: number) =>
    new Date(Date.parse(NOW) - minutes * 60_000).toISOString();

  type ClaimRound = Parameters<typeof isClaimableEstimateRound>[0]["round"];
  const round: ClaimRound = {
    mode: "local",
    status: "finished",
    createdBy: "a",
    expenseId: null,
    // Furthest first, like the booking order.
    loserUids: ["c", "a"],
    finishedAt: minutesBefore(10),
    order: ["a", "b", "c"],
  };
  const claim = (
    overrides: {
      round?: Partial<ClaimRound>;
      uid?: string;
      now?: string;
      amountMinor?: number;
      splitMode?: "equal" | "exact";
      splits?: Record<string, ExpenseSplit>;
      playerUids?: string[];
    } = {},
  ) =>
    isClaimableEstimateRound({
      round: { ...round, ...overrides.round },
      uid: overrides.uid ?? "a",
      now: overrides.now ?? NOW,
      amountMinor: overrides.amountMinor ?? 3601,
      splitMode: overrides.splitMode ?? "exact",
      // 3601 across the payers in loser order: the first one (c) carries the odd cent.
      splits: overrides.splits ?? split({ c: 1801, a: 1800 }),
      playerUids: overrides.playerUids ?? ["a", "b", "c"],
    });

  it("accepts the bill the form builds for a finished, unclaimed round of the booker's own", () => {
    expect(claim()).toBe(true);
  });

  it.each<[string, Partial<ClaimRound>]>([
    ["an online round", { mode: "online" }],
    ["a running round", { status: "running" }],
    ["a cancelled round", { status: "cancelled" }],
    ["somebody else's round", { createdBy: "b" }],
    ["a round another expense already claimed", { expenseId: "e1" }],
    ["a round without payers", { loserUids: null }],
    ["a round with an empty payer list", { loserUids: [] }],
    ["a round without a finish time", { finishedAt: null }],
    ["a round with an unreadable finish time", { finishedAt: "yesterday" }],
  ])("rejects %s", (_label, patch) => {
    expect(claim({ round: patch })).toBe(false);
  });

  it("rejects a claim by someone who did not create the round, even with the right money", () => {
    expect(claim({ uid: "b" })).toBe(false);
  });

  it("accepts a round for exactly the claim window, not a moment longer", () => {
    const edge = new Date(Date.parse(NOW) - ESTIMATE_CLAIM_WINDOW_MS).toISOString();
    expect(claim({ round: { finishedAt: edge } })).toBe(true);
    const late = new Date(Date.parse(NOW) - ESTIMATE_CLAIM_WINDOW_MS - 1).toISOString();
    expect(claim({ round: { finishedAt: late } })).toBe(false);
    // A round from last week cannot be attached to this week's dinner.
    expect(claim({ round: { finishedAt: "2026-10-01T12:00:00.000Z" } })).toBe(false);
  });

  it("requires the exact split mode the form uses", () => {
    expect(claim({ splitMode: "equal" })).toBe(false);
  });

  it("rejects a different payer set than the round decided", () => {
    expect(claim({ splits: split({ c: 1801, a: 1800, b: 1 }), amountMinor: 3602 })).toBe(false);
    expect(claim({ splits: split({ c: 3601 }), amountMinor: 3601 })).toBe(false);
  });

  it("checks the money, not only who pays", () => {
    // A hand-edited split between the right two payers.
    expect(claim({ splits: split({ c: 3000, a: 601 }) })).toBe(false);
    // A stale input after the amount was changed: 2 x 18,00 no longer adds up to the booked bill.
    expect(claim({ amountMinor: 4000 })).toBe(false);
    // The odd cent must sit with the furthest-off payer, as the slips on screen showed it.
    expect(claim({ splits: split({ c: 1800, a: 1801 }) })).toBe(false);
  });

  it("requires the game record to name the players who sat at the table", () => {
    expect(claim({ playerUids: ["a", "c"] })).toBe(false);
    expect(claim({ playerUids: ["c", "b", "a"] })).toBe(true);
  });
});
