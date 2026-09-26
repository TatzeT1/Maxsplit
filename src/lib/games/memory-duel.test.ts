import { describe, expect, it } from "vitest";
import {
  MEMORY_CARD_COUNT,
  MEMORY_PAIR_COUNT,
  buildMemoryDeck,
  memoryOutcome,
} from "./memory-duel";

describe("buildMemoryDeck", () => {
  it("builds 18 cards as 9 exact pairs", () => {
    const deck = buildMemoryDeck();
    expect(deck).toHaveLength(MEMORY_CARD_COUNT);
    const counts = new Map<string, number>();
    for (const card of deck) counts.set(card.face, (counts.get(card.face) ?? 0) + 1);
    expect(counts.size).toBe(MEMORY_PAIR_COUNT);
    for (const count of counts.values()) expect(count).toBe(2);
  });

  it("starts every card unclaimed", () => {
    expect(buildMemoryDeck().every((card) => card.claimedBy === null)).toBe(true);
  });
});

describe("memoryOutcome", () => {
  it("is undecided before a majority of pairs is claimed", () => {
    expect(memoryOutcome([3, 3], 9)).toBeNull();
    expect(memoryOutcome([4, 3], 9)).toBeNull();
  });

  it("decides the instant one player reaches a majority (5 of 9)", () => {
    expect(memoryOutcome([5, 2], 9)).toBe(0);
    expect(memoryOutcome([2, 5], 9)).toBe(1);
  });

  it("can never end in a tie, since the pair count is odd", () => {
    for (let a = 0; a <= 9; a++) {
      const b = 9 - a;
      const outcome = memoryOutcome([a, b], 9);
      if (a + b === 9) expect(outcome).not.toBeNull();
    }
  });
});
