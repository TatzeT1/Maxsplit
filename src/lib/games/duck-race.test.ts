import { describe, expect, it } from "vitest";
import {
  DUCK_PROGRESS_STEPS,
  MIN_FINISH_GAP_SEC,
  duckRaceDuration,
  duckRaceLosers,
  maxDuckLoserCount,
  planDuckRace,
} from "./duck-race";

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

const names = (count: number) => Array.from({ length: count }, (_, i) => `duck${i}`);

describe("duckRaceDuration", () => {
  it("is never shorter than seven or longer than eleven seconds", () => {
    for (let count = 1; count <= 40; count++) {
      const seconds = duckRaceDuration(count);
      expect(seconds).toBeGreaterThanOrEqual(7);
      expect(seconds).toBeLessThanOrEqual(11);
    }
  });
});

describe("planDuckRace", () => {
  it("finishes the ducks strictly in the order given, for every field size", () => {
    for (let count = 2; count <= 32; count++) {
      for (let seed = 1; seed <= 12; seed++) {
        const order = names(count);
        const race = planDuckRace(order, seeded(seed * 31 + count));
        expect(race.ducks.map((duck) => duck.uid)).toEqual(order);
        for (let i = 1; i < race.ducks.length; i++) {
          expect(race.ducks[i].finishSec).toBeGreaterThan(race.ducks[i - 1].finishSec);
          expect(race.ducks[i].finishSec - race.ducks[i - 1].finishSec).toBeGreaterThanOrEqual(
            MIN_FINISH_GAP_SEC - 1e-9,
          );
        }
      }
    }
  });

  it("gives every duck a progress run that never goes backwards and ends on the line", () => {
    const race = planDuckRace(names(10), seeded(7));
    for (const duck of race.ducks) {
      expect(duck.progress).toHaveLength(DUCK_PROGRESS_STEPS + 1);
      expect(duck.progress[0]).toBe(0);
      expect(duck.progress[duck.progress.length - 1]).toBe(1);
      for (let i = 1; i < duck.progress.length; i++) {
        expect(duck.progress[i]).toBeGreaterThan(duck.progress[i - 1]);
      }
    }
  });

  it("ends when the last duck is home", () => {
    const race = planDuckRace(names(6), seeded(3));
    expect(race.totalSec).toBe(race.ducks[race.ducks.length - 1].finishSec);
    for (const duck of race.ducks) expect(duck.finishSec).toBeLessThanOrEqual(race.totalSec);
  });

  it("numbers the places from zero", () => {
    const race = planDuckRace(names(5), seeded(1));
    expect(race.ducks.map((duck) => duck.rank)).toEqual([0, 1, 2, 3, 4]);
  });

  it("is repeatable for the same random source", () => {
    expect(planDuckRace(names(8), seeded(99))).toEqual(planDuckRace(names(8), seeded(99)));
  });

  it("varies the staging between races so no two look alike", () => {
    const a = planDuckRace(names(8), seeded(1));
    const b = planDuckRace(names(8), seeded(2));
    expect(a.ducks[3].progress).not.toEqual(b.ducks[3].progress);
  });

  it("copes with a single duck", () => {
    const race = planDuckRace(["solo"], seeded(1));
    expect(race.ducks).toHaveLength(1);
    expect(race.totalSec).toBe(race.ducks[0].finishSec);
  });

  it("plans nothing for nobody", () => {
    expect(planDuckRace([], seeded(1))).toEqual({ ducks: [], totalSec: 0 });
  });
});

describe("duckRaceLosers", () => {
  it("makes the last duck across the line pay, last place first", () => {
    expect(duckRaceLosers(["a", "b", "c", "d"], 1)).toEqual(["d"]);
    expect(duckRaceLosers(["a", "b", "c", "d"], 2)).toEqual(["d", "c"]);
  });

  it("always keeps the winner dry", () => {
    expect(maxDuckLoserCount(2)).toBe(1);
    expect(duckRaceLosers(["a", "b", "c"], 99)).toEqual(["c", "b"]);
    expect(duckRaceLosers(["a", "b", "c"], 0)).toEqual(["c"]);
  });
});
