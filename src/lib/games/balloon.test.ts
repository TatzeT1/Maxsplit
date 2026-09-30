import { describe, expect, it } from "vitest";
import {
  BALLOON_MAX_PUMPS_PER_TURN,
  balloonBurstRange,
  balloonHolder,
  canPassBalloon,
  canPumpBalloon,
  isBalloonGameOver,
  maxBalloonLoserCount,
  passBalloon,
  pumpBalloon,
  startBalloonGame,
  type BalloonRandom,
  type BalloonState,
} from "./balloon";

/** Keeps the seating as given and hands out the scripted burst points in order. */
function scripted(bursts: number[]): BalloonRandom {
  let next = 0;
  return {
    int: (min, max) => {
      const value = bursts[next++] ?? min;
      return Math.min(Math.max(value, min), max);
    },
    shuffle: (items) => [...items],
  };
}

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

function seededRandom(seed: number): BalloonRandom {
  const next = seeded(seed);
  return {
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

function pumpTimes(state: BalloonState, times: number, random: BalloonRandom): BalloonState {
  let current = state;
  for (let i = 0; i < times; i++) {
    const result = pumpBalloon(current, random);
    if (!result) throw new Error("pump refused");
    current = result.state;
  }
  return current;
}

describe("balloonBurstRange", () => {
  it("never bursts before a lap of pumps and grows with the table", () => {
    let previousMax = 0;
    for (let seats = 2; seats <= 32; seats++) {
      const { min, max } = balloonBurstRange(seats);
      expect(min).toBeGreaterThanOrEqual(seats + 3);
      expect(max).toBeGreaterThan(min);
      expect(max).toBeGreaterThan(previousMax);
      previousMax = max;
    }
  });
});

describe("startBalloonGame", () => {
  it("seats everyone, draws a burst point inside the range and starts empty", () => {
    const state = startBalloonGame(["a", "b", "c"], 1, scripted([9]));
    expect([...state.seats]).toEqual(["a", "b", "c"]);
    expect(state.pumps).toBe(0);
    expect(state.turn).toBe(0);
    expect(state.burstAt).toBe(9);
    expect(state.maxPumps).toBe(balloonBurstRange(3).max);
    expect(state.losers).toEqual([]);
  });

  it("needs two players and keeps one person dry", () => {
    expect(() => startBalloonGame(["a"], 1, scripted([]))).toThrow();
    expect(maxBalloonLoserCount(2)).toBe(1);
    expect(maxBalloonLoserCount(5)).toBe(4);
    expect(startBalloonGame(["a", "b", "c"], 99, scripted([])).targetLoserCount).toBe(2);
    expect(startBalloonGame(["a", "b", "c"], 0, scripted([])).targetLoserCount).toBe(1);
  });
});

describe("pumping and passing", () => {
  it("lets the holder pump up to three times, then stops them", () => {
    let state = startBalloonGame(["a", "b"], 1, scripted([18]));
    for (let i = 0; i < BALLOON_MAX_PUMPS_PER_TURN; i++) {
      expect(canPumpBalloon(state)).toBe(true);
      state = pumpTimes(state, 1, scripted([]));
    }
    expect(canPumpBalloon(state)).toBe(false);
    expect(pumpBalloon(state, scripted([]))).toBeNull();
    expect(state.pumps).toBe(3);
  });

  it("makes the holder pump at least once before handing on", () => {
    let state = startBalloonGame(["a", "b"], 1, scripted([18]));
    expect(canPassBalloon(state)).toBe(false);
    expect(passBalloon(state)).toBeNull();
    state = pumpTimes(state, 1, scripted([]));
    expect(canPassBalloon(state)).toBe(true);
    const passed = passBalloon(state)!;
    expect(balloonHolder(passed)).toBe("b");
    expect(passed.turnPumps).toBe(0);
    expect(passed.pumps).toBe(1);
  });

  it("goes round the circle", () => {
    let state = startBalloonGame(["a", "b", "c"], 1, scripted([30]));
    const holders: string[] = [];
    for (let i = 0; i < 4; i++) {
      holders.push(balloonHolder(state));
      state = passBalloon(pumpTimes(state, 1, scripted([])))!;
    }
    expect(holders).toEqual(["a", "b", "c", "a"]);
  });
});

describe("a burst", () => {
  it("charges whoever's pump reaches the burst point and ends a one-payer game", () => {
    // Burst at 6: a pumps 2, b pumps 2, c's second pump is the sixth.
    let state = startBalloonGame(["a", "b", "c"], 1, scripted([6]));
    state = passBalloon(pumpTimes(state, 2, scripted([])))!;
    state = passBalloon(pumpTimes(state, 2, scripted([])))!;
    expect(balloonHolder(state)).toBe("c");
    expect(state.burstAt).toBe(6);
    const result = pumpBalloon(pumpTimes(state, 0, scripted([])), scripted([]))!;
    expect(result.popped).toBeNull();
    const second = pumpBalloon(result.state, scripted([]))!;
    expect(second.popped).toBe("c");
    expect(second.state.losers).toEqual(["c"]);
    expect(isBalloonGameOver(second.state)).toBe(true);
    expect(canPumpBalloon(second.state)).toBe(false);
    expect(canPassBalloon(second.state)).toBe(false);
  });

  it("drops the popper, hands a fresh balloon to the next seat and plays on", () => {
    // Two payers out of four. The first balloon (burst 7) goes off on b's pump.
    let state = startBalloonGame(["a", "b", "c", "d"], 2, scripted([7, 12]));
    state = passBalloon(pumpTimes(state, 3, scripted([])))!; // a: 3 pumps
    state = pumpTimes(state, 3, scripted([])); // b: pumps 4, 5, 6
    const result = pumpBalloon(state, scripted([12]))!; // b's... turn is used up
    expect(result).toBeNull();
    state = passBalloon(state)!;
    expect(balloonHolder(state)).toBe("c");
    const popped = pumpBalloon(pumpTimes(state, 0, scripted([])), scripted([12]))!;
    // c's first pump is the 7th: c pays.
    expect(popped.popped).toBe("c");
    expect([...popped.state.seats]).toEqual(["a", "b", "d"]);
    expect(popped.state.losers).toEqual(["c"]);
    // The next balloon goes to the seat behind c: d.
    expect(balloonHolder(popped.state)).toBe("d");
    expect(popped.state.pumps).toBe(0);
    expect(popped.state.turnPumps).toBe(0);
    expect(popped.state.burstAt).toBe(12);
    expect(popped.state.maxPumps).toBe(balloonBurstRange(3).max);
    expect(isBalloonGameOver(popped.state)).toBe(false);
  });

  it("wraps to the first seat when the last one pops", () => {
    // Three seats burst no earlier than the 6th pump (see balloonBurstRange).
    let state = startBalloonGame(["a", "b", "c"], 2, scripted([6, 9]));
    state = passBalloon(pumpTimes(state, 2, scripted([])))!;
    state = passBalloon(pumpTimes(state, 2, scripted([])))!;
    expect(balloonHolder(state)).toBe("c");
    state = pumpTimes(state, 1, scripted([])); // the 5th pump
    const popped = pumpBalloon(state, scripted([9]))!; // the 6th: c pays
    expect(popped.popped).toBe("c");
    expect([...popped.state.seats]).toEqual(["a", "b"]);
    expect(balloonHolder(popped.state)).toBe("a");
    expect(popped.state.burstAt).toBe(9);
  });
});

describe("whole games", () => {
  it("always end with exactly the target number of distinct payers from the pool", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const strategy = seeded(seed * 7919);
      const random = seededRandom(seed);
      const size = 2 + Math.floor(strategy() * 7);
      const pool = Array.from({ length: size }, (_, i) => `p${i}`);
      const target = 1 + Math.floor(strategy() * (size - 1));
      let state = startBalloonGame(pool, target, random);
      let balloonsSeen = 0;
      let guard = 0;
      while (!isBalloonGameOver(state)) {
        if (++guard > 5000) throw new Error("balloon game did not finish");
        const pumpsWanted = 1 + Math.floor(strategy() * BALLOON_MAX_PUMPS_PER_TURN);
        for (let i = 0; i < pumpsWanted && canPumpBalloon(state); i++) {
          const before = state;
          const result = pumpBalloon(state, random)!;
          state = result.state;
          if (result.popped) {
            balloonsSeen++;
            // A balloon only ever goes off on the pump that reaches its burst point.
            expect(before.pumps + 1).toBe(before.burstAt);
            break;
          }
          expect(state.pumps).toBeLessThan(state.burstAt);
          expect(state.pumps).toBeLessThanOrEqual(state.maxPumps);
        }
        if (canPassBalloon(state)) state = passBalloon(state)!;
      }
      expect(state.losers).toHaveLength(target);
      expect(new Set(state.losers).size).toBe(target);
      for (const loser of state.losers) expect(pool).toContain(loser);
      expect(state.seats).toHaveLength(size - target);
      expect(balloonsSeen).toBe(target);
    }
  });
});
