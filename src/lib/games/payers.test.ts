import { describe, expect, it } from "vitest";
import { splitEqual } from "@/lib/money/split";
import { hasStakeAmount, maxPayerCount, stakeShareAt, stakeShares } from "./payers";

const pizza = { description: "Pizza", amountMinor: 4781, currency: "EUR" };

describe("maxPayerCount", () => {
  it("always keeps one person dry", () => {
    expect(maxPayerCount(2)).toBe(1);
    expect(maxPayerCount(3)).toBe(2);
    expect(maxPayerCount(12)).toBe(11);
  });

  it("never drops below one payer, even for a pool that can't start yet", () => {
    expect(maxPayerCount(1)).toBe(1);
    expect(maxPayerCount(0)).toBe(1);
  });
});

describe("hasStakeAmount", () => {
  it("is false before an amount is typed", () => {
    expect(hasStakeAmount(undefined)).toBe(false);
    expect(hasStakeAmount(null)).toBe(false);
    expect(hasStakeAmount({ ...pizza, amountMinor: 0 })).toBe(false);
    expect(hasStakeAmount({ ...pizza, amountMinor: 12.5 })).toBe(false);
    expect(hasStakeAmount(pizza)).toBe(true);
  });
});

describe("stakeShares", () => {
  it("shows exactly what the form books for the same loser order", () => {
    // handleSplitGameResolve: splitEqual(amountMinor, loserUids) — the rounding
    // cent lands on the first payer in the list, and so must the slip's.
    const losers = ["lea", "max", "ben"];
    const shares = stakeShares(pizza, losers);
    expect(shares).toEqual(splitEqual(pizza.amountMinor, losers));
    expect(shares).toEqual({ lea: 1594, max: 1594, ben: 1593 });
  });

  it("follows the order, not the names", () => {
    expect(stakeShares(pizza, ["ben", "max", "lea"])).toEqual({ ben: 1594, max: 1594, lea: 1593 });
  });

  it("shows nothing without an amount or a payer", () => {
    expect(stakeShares({ ...pizza, amountMinor: 0 }, ["lea"])).toBeNull();
    expect(stakeShares(undefined, ["lea"])).toBeNull();
    expect(stakeShares(pizza, [])).toBeNull();
  });
});

describe("stakeShareAt", () => {
  it("knows a payer's share the moment they are caught, in catch order", () => {
    const popOrder = ["ben", "lea", "max"];
    const final = stakeShares(pizza, popOrder)!;
    popOrder.forEach((uid, index) => {
      expect(stakeShareAt(pizza, popOrder.length, index)).toBe(final[uid]);
    });
  });

  it("shows nothing without an amount", () => {
    expect(stakeShareAt({ ...pizza, amountMinor: 0 }, 2, 0)).toBeNull();
    expect(stakeShareAt(null, 2, 0)).toBeNull();
  });
});
