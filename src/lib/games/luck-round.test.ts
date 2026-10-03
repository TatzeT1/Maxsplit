import { describe, expect, it } from "vitest";
import {
  canScratchFor,
  drawScratchCard,
  payerCardsLeft,
  scratchLosers,
  unrevealedUids,
} from "@/lib/games/luck-round";
import { randomInt } from "@/lib/games/random";

const order = ["a", "b", "c", "d"];

describe("scratch cards drawn as they're scratched", () => {
  it("knows which cards are left and how many of them pay", () => {
    const round = { order, revealed: { b: true, d: false }, targetLoserCount: 2 };
    expect(unrevealedUids(round)).toEqual(["a", "c"]);
    expect(payerCardsLeft(round)).toBe(1);
    expect(scratchLosers(round)).toBeNull();
    expect(scratchLosers({ order, revealed: { a: false, b: true, c: true, d: false } })).toEqual([
      "b",
      "c",
    ]);
  });

  it("is forced once the payers are all found, or every card left must pay", () => {
    const always = () => 0;
    const never = (_min: number, max: number) => max;
    // Both payers found: whatever the dice say, the rest are safe.
    expect(
      drawScratchCard({ order, revealed: { a: true, b: true }, targetLoserCount: 2 }, always),
    ).toBe(false);
    // Two cards left, two payers to go: both must pay.
    expect(
      drawScratchCard({ order, revealed: { a: false, b: false }, targetLoserCount: 2 }, never),
    ).toBe(true);
  });

  it("refuses to draw when every card is scratched", () => {
    const revealed = { a: false, b: true, c: false, d: false };
    expect(() => drawScratchCard({ order, revealed, targetLoserCount: 1 }, randomInt)).toThrow();
  });

  it("gives every card the same chance, whatever the order they're scratched in", () => {
    // Monte Carlo: 4 cards, 1 payer, scratched in a fixed order (d, c, b, a).
    // Each card must end up paying about a quarter of the time — the first
    // scratcher has no edge over the last.
    const runs = 20_000;
    const paid: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (let run = 0; run < runs; run++) {
      const revealed: Record<string, boolean> = {};
      for (const uid of ["d", "c", "b", "a"]) {
        revealed[uid] = drawScratchCard({ order, revealed, targetLoserCount: 1 }, randomInt);
      }
      const losers = scratchLosers({ order, revealed })!;
      expect(losers).toHaveLength(1);
      paid[losers[0]] += 1;
    }
    for (const uid of order) {
      expect(paid[uid] / runs).toBeGreaterThan(0.23);
      expect(paid[uid] / runs).toBeLessThan(0.27);
    }
  });
});

describe("canScratchFor", () => {
  const round = {
    createdBy: "a",
    entrants: {
      a: { displayName: "A", isPlaceholder: false },
      b: { displayName: "B", isPlaceholder: false },
      tom: { displayName: "Tom", isPlaceholder: true },
    },
  };

  it("lets you scratch your own card, and the creator a placeholder's", () => {
    expect(canScratchFor(round, "b", "b")).toBe(true);
    expect(canScratchFor(round, "a", "tom")).toBe(true);
  });

  it("keeps everyone off someone else's card", () => {
    expect(canScratchFor(round, "a", "b")).toBe(false);
    expect(canScratchFor(round, "b", "tom")).toBe(false);
    expect(canScratchFor(round, "a", "stranger")).toBe(false);
  });
});
