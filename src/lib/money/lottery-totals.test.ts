import { describe, expect, it } from "vitest";
import { computeLotteryTotals } from "./lottery-totals";

describe("computeLotteryTotals", () => {
  it("sums amount and rounds lost per member across lottery expenses", () => {
    const totals = computeLotteryTotals([
      { viaLottery: true, splits: { anna: { amountMinor: 1000 } } },
      { viaLottery: true, splits: { anna: { amountMinor: 500 }, ben: { amountMinor: 500 } } },
    ]);

    expect(totals).toEqual({
      anna: { amountMinor: 1500, roundsLost: 2 },
      ben: { amountMinor: 500, roundsLost: 1 },
    });
  });

  it("ignores expenses not flagged viaLottery", () => {
    const totals = computeLotteryTotals([
      { viaLottery: false, splits: { anna: { amountMinor: 1000 } } },
      { splits: { anna: { amountMinor: 1000 } } },
    ]);

    expect(totals).toEqual({});
  });

  it("ignores zero-amount splits within a lottery expense", () => {
    const totals = computeLotteryTotals([
      { viaLottery: true, splits: { anna: { amountMinor: 1000 }, ben: { amountMinor: 0 } } },
    ]);

    expect(totals).toEqual({ anna: { amountMinor: 1000, roundsLost: 1 } });
  });

  it("returns an empty object for no expenses", () => {
    expect(computeLotteryTotals([])).toEqual({});
  });
});
