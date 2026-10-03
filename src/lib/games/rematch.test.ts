import { describe, expect, it } from "vitest";
import { canRematch, rematchSeedOrder } from "@/lib/games/rematch";
import type { GameExpenseDraft } from "@/lib/types";

const bill: GameExpenseDraft = {
  description: "Pizza",
  amountMinor: 3000,
  currency: "EUR",
  date: "2026-10-03",
  category: null,
  emoji: null,
  paidBy: { max: 3000 },
};

describe("canRematch", () => {
  const finished = { status: "finished" as const, playMode: "online" as const };

  it("allows a game played for fun or for a bare stake", () => {
    expect(canRematch({ ...finished, autoBook: null })).toBe(true);
    expect(canRematch({ ...finished, autoBook: undefined })).toBe(true);
    expect(
      canRematch({ ...finished, autoBook: { ...bill, paidBy: {}, payerIsWinner: true } }),
    ).toBe(true);
  });

  it("refuses a game that booked a real bill, would book it twice", () => {
    expect(canRematch({ ...finished, autoBook: bill })).toBe(false);
  });

  it("refuses a running game and a game played on one phone", () => {
    expect(canRematch({ ...finished, status: "running", autoBook: null })).toBe(false);
    expect(canRematch({ ...finished, playMode: "local", autoBook: null })).toBe(false);
    expect(canRematch({ status: "finished", autoBook: null })).toBe(false);
  });
});

describe("rematchSeedOrder", () => {
  it("lets the loser of a duel move first", () => {
    expect(rematchSeedOrder(["max", "lea"], ["lea"])).toEqual(["lea", "max"]);
    expect(rematchSeedOrder(["lea", "max"], ["lea"])).toEqual(["lea", "max"]);
  });

  it("leaves a bigger bracket to a fresh draw", () => {
    expect(rematchSeedOrder(["max", "lea", "ben"], ["lea", "ben"])).toBeNull();
  });
});
