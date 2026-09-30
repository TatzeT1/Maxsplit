import { describe, expect, it } from "vitest";
import {
  PEGBOARD_MAX_SLOTS,
  PEGBOARD_MIN_SLOTS,
  pegboardRows,
  pegboardStart,
  planBallPath,
  slotCentre,
} from "./pegboard";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("board geometry", () => {
  it("uses an even number of rows of at least eight", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      const rows = pegboardRows(slots);
      expect(rows % 2).toBe(0);
      expect(rows).toBeGreaterThanOrEqual(8);
    }
  });

  it("starts the ball on a slot centre near the middle", () => {
    expect(pegboardStart(2)).toBe(1);
    expect(pegboardStart(3)).toBe(3);
    expect(pegboardStart(4)).toBe(3);
    expect(pegboardStart(5)).toBe(5);
    for (let slots = 2; slots <= 12; slots++) {
      const start = pegboardStart(slots);
      expect(start % 2).toBe(1);
      expect(start).toBeGreaterThanOrEqual(1);
      expect(start).toBeLessThanOrEqual(2 * slots - 1);
    }
  });

  it("puts slot centres on odd half slots", () => {
    expect(slotCentre(0)).toBe(1);
    expect(slotCentre(4)).toBe(9);
  });
});

describe("planBallPath", () => {
  it("lands in the slot it was told to, from every start, on every board size", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      for (let target = 0; target < slots; target++) {
        for (let seed = 1; seed <= 25; seed++) {
          const path = planBallPath({ slots, target, random: seeded(seed * 97 + target) });
          expect(path).toHaveLength(pegboardRows(slots) + 1);
          expect(path[0]).toBe(pegboardStart(slots));
          expect(path[path.length - 1]).toBe(slotCentre(target));
        }
      }
    }
  });

  it("moves exactly half a slot per peg row and never leaves the board", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      for (let target = 0; target < slots; target++) {
        const path = planBallPath({ slots, target, random: seeded(slots * 131 + target) });
        for (let i = 0; i < path.length; i++) {
          expect(path[i]).toBeGreaterThanOrEqual(1);
          expect(path[i]).toBeLessThanOrEqual(2 * slots - 1);
          if (i > 0) expect(Math.abs(path[i] - path[i - 1])).toBe(1);
        }
      }
    }
  });

  it("takes different ways down to the same slot", () => {
    const paths = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      paths.add(planBallPath({ slots: 6, target: 2, random: seeded(seed) }).join(","));
    }
    expect(paths.size).toBeGreaterThan(5);
  });

  it("is repeatable for the same random source", () => {
    const a = planBallPath({ slots: 8, target: 5, random: seeded(42) });
    const b = planBallPath({ slots: 8, target: 5, random: seeded(42) });
    expect(a).toEqual(b);
  });

  it("refuses a board or slot that does not exist", () => {
    expect(() => planBallPath({ slots: 1, target: 0, random: Math.random })).toThrow();
    expect(() => planBallPath({ slots: 5, target: 5, random: Math.random })).toThrow();
    expect(() => planBallPath({ slots: 5, target: -1, random: Math.random })).toThrow();
    expect(() => planBallPath({ slots: 5, target: 1.5, random: Math.random })).toThrow();
  });
});
