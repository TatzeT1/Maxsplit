import { describe, expect, it } from "vitest";
import {
  SLOT_PAYTABLE,
  SLOT_TOTAL_WEIGHT,
  applySlotOutcome,
  drawSlotOutcome,
  expectedStakesPerSpin,
  isSlotGameOver,
  nextSlotPlayer,
  niceStakeMinor,
  slotActiveSeats,
  slotAllocated,
  slotOutcomeForFaces,
  slotReelFaces,
  slotRemaining,
  slotSpinner,
  slotStakeForDuration,
  spinSlot,
  startSlotGame,
  type SlotFaces,
  type SlotGameState,
  type SlotOutcomeKind,
  type SlotRandom,
} from "./slot-machine";

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

function seededRandom(seed: number): SlotRandom {
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

/** Keeps the seating as given. */
const inOrder: SlotRandom = { int: (min) => min, shuffle: (items) => [...items] };

const FACES: SlotFaces = ["lemon", "bell", "star"];

function game(pool: string[], amountMinor: number, stakeMinor: number): SlotGameState {
  return startSlotGame(pool, amountMinor, stakeMinor, inOrder);
}

function play(state: SlotGameState, ...kinds: SlotOutcomeKind[]): SlotGameState {
  return kinds.reduce((current, kind) => applySlotOutcome(current, kind, FACES).state, state);
}

describe("paytable", () => {
  it("adds up to 100", () => {
    expect(SLOT_TOTAL_WEIGHT).toBe(100);
  });

  it("draws every combination at about its listed rate", () => {
    const random = seededRandom(7);
    const counts: Record<string, number> = {};
    const draws = 200_000;
    for (let i = 0; i < draws; i++) {
      const kind = drawSlotOutcome(random);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    for (const entry of SLOT_PAYTABLE) {
      expect((counts[entry.kind] ?? 0) / draws).toBeCloseTo(entry.weight / SLOT_TOTAL_WEIGHT, 2);
    }
  });

  it("builds reel faces that read back as the same combination", () => {
    const random = seededRandom(3);
    for (const entry of SLOT_PAYTABLE) {
      for (let i = 0; i < 200; i++) {
        expect(slotOutcomeForFaces(slotReelFaces(entry.kind, random))).toBe(entry.kind);
      }
    }
  });

  it("puts a pair's odd symbol on every reel, so some pairs tease the third reel", () => {
    const random = seededRandom(11);
    const oddReels = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const [a, b, c] = slotReelFaces("pair", random);
      oddReels.add(a === b ? 2 : a === c ? 1 : 0);
    }
    expect([...oddReels].sort()).toEqual([0, 1, 2]);
  });
});

describe("stake for a game length", () => {
  it("rounds to coin-like amounts", () => {
    expect(niceStakeMinor(97)).toBe(100);
    expect(niceStakeMinor(140)).toBe(150);
    expect(niceStakeMinor(620)).toBe(600);
    expect(niceStakeMinor(0.3)).toBe(1);
  });

  it("charges about one stake per pull at a table of four", () => {
    expect(expectedStakesPerSpin(4)).toBeCloseTo(1, 5);
  });

  it("asks for a smaller stake the longer the game should run", () => {
    const short = slotStakeForDuration(10_000, 4, "short");
    const normal = slotStakeForDuration(10_000, 4, "normal");
    const long = slotStakeForDuration(10_000, 4, "long");
    expect(short).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(long);
  });

  it("never asks for more than the bill", () => {
    expect(slotStakeForDuration(3, 2, "short")).toBeLessThanOrEqual(3);
    expect(slotStakeForDuration(1, 2, "long")).toBe(1);
  });
});

describe("one pull", () => {
  it("a miss costs the spinner the stake and passes the machine on", () => {
    const after = play(game(["a", "b", "c"], 1000, 100), "miss");
    expect(after.tallies).toEqual({ a: 100 });
    expect(slotSpinner(after)).toBe("b");
  });

  it("a pair costs nothing", () => {
    const after = play(game(["a", "b"], 1000, 100), "pair");
    expect(after.tallies).toEqual({});
    expect(slotSpinner(after)).toBe("b");
  });

  it("lemons cost three stakes, bombs five", () => {
    expect(play(game(["a", "b"], 1000, 100), "lemons").tallies).toEqual({ a: 300 });
    expect(play(game(["a", "b"], 1000, 100), "bombs").tallies).toEqual({ a: 500 });
  });

  it("cherries keep the same person at the machine for a free spin", () => {
    const after = play(game(["a", "b", "c"], 1000, 100), "cherries");
    expect(after.tallies).toEqual({});
    expect(after.freeSpin).toBe(true);
    expect(slotSpinner(after)).toBe("a");
    const next = play(after, "miss");
    expect(next.freeSpin).toBe(false);
    expect(next.tallies).toEqual({ a: 100 });
    expect(slotSpinner(next)).toBe("b");
  });

  it("bells hand two stakes to the next player in line", () => {
    const after = play(game(["a", "b", "c"], 1000, 100), "bells");
    expect(after.tallies).toEqual({ b: 200 });
    expect(slotSpinner(after)).toBe("b");
  });

  it("stars charge everyone else one stake", () => {
    const after = play(game(["a", "b", "c", "d"], 1000, 100), "stars");
    expect(after.tallies).toEqual({ b: 100, c: 100, d: 100 });
  });

  it("caps every charge at what's left, in seat order", () => {
    const state = play(game(["a", "b", "c", "d"], 1000, 100), "bombs", "lemons");
    expect(slotRemaining(state)).toBe(200);
    const result = applySlotOutcome(state, "stars", FACES);
    expect(result.charges).toEqual([
      { uid: "d", amountMinor: 100 },
      { uid: "a", amountMinor: 100 },
    ]);
    expect(isSlotGameOver(result.state)).toBe(true);
  });

  it("the last pull takes exactly what's left", () => {
    const after = play(game(["a", "b"], 250, 100), "miss", "miss", "bombs");
    expect(after.tallies).toEqual({ a: 150, b: 100 });
    expect(isSlotGameOver(after)).toBe(true);
    expect(() => applySlotOutcome(after, "miss", FACES)).toThrow();
  });
});

describe("jackpot", () => {
  it("refunds everything the spinner paid and takes them out of the game", () => {
    const state = play(game(["a", "b", "c"], 2000, 100), "lemons", "miss", "miss");
    expect(slotSpinner(state)).toBe("a");
    const result = applySlotOutcome(state, "jackpot", FACES);
    expect(result.charges).toEqual([{ uid: "a", amountMinor: -300 }]);
    expect(result.state.tallies).toEqual({ b: 100, c: 100 });
    expect(slotActiveSeats(result.state)).toEqual(["b", "c"]);
    expect(slotSpinner(result.state)).toBe("b");
    expect(result.lastPayer).toBeNull();
  });

  it("skips the winner from then on, for bells and stars too", () => {
    const state = play(game(["a", "b", "c"], 2000, 100), "jackpot");
    expect(nextSlotPlayer(state, "c")).toBe("b");
    expect(play(state, "pair", "bells").tallies).toEqual({ b: 200 });
    expect(play(state, "stars").tallies).toEqual({ c: 100 });
  });

  it("leaves the last one at the machine paying the rest", () => {
    const state = play(game(["a", "b"], 1000, 100), "miss", "miss");
    const result = applySlotOutcome(state, "jackpot", FACES);
    expect(result.lastPayer).toBe("b");
    expect(result.state.tallies).toEqual({ b: 1000 });
    expect(result.charges).toEqual([
      { uid: "a", amountMinor: -100 },
      { uid: "b", amountMinor: 900 },
    ]);
    expect(isSlotGameOver(result.state)).toBe(true);
  });
});

describe("whole games", () => {
  it("always end on exactly the bill, with nobody owing a negative amount", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const random = seededRandom(seed);
      const players = 2 + (seed % 7);
      const pool = Array.from({ length: players }, (_, i) => `p${i}`);
      const amountMinor = 1 + random.int(0, 50_000);
      const stake = Math.max(1, slotStakeForDuration(amountMinor, players, "normal"));
      let state = startSlotGame(pool, amountMinor, stake, random);
      let spins = 0;
      while (!isSlotGameOver(state)) {
        state = spinSlot(state, random).state;
        spins++;
        expect(spins).toBeLessThan(5_000);
      }
      expect(slotAllocated(state)).toBe(amountMinor);
      for (const amount of Object.values(state.tallies)) expect(amount).toBeGreaterThan(0);
      for (const uid of state.out) expect(state.tallies[uid]).toBeUndefined();
    }
  });

  it("lasts about as many rounds as the chosen length", () => {
    const random = seededRandom(99);
    const pool = ["a", "b", "c", "d"];
    const amountMinor = 10_000;
    const stake = slotStakeForDuration(amountMinor, pool.length, "normal");
    let totalSpins = 0;
    const games = 400;
    for (let i = 0; i < games; i++) {
      let state = startSlotGame(pool, amountMinor, stake, random);
      while (!isSlotGameOver(state)) state = spinSlot(state, random).state;
      totalSpins += state.spins;
    }
    const rounds = totalSpins / games / pool.length;
    expect(rounds).toBeGreaterThan(2.5);
    expect(rounds).toBeLessThan(6.5);
  });

  it("is fair in the long run: every seat pays about the same share", () => {
    const random = seededRandom(5);
    const pool = ["a", "b", "c"];
    const totals: Record<string, number> = { a: 0, b: 0, c: 0 };
    const games = 3000;
    for (let i = 0; i < games; i++) {
      let state = startSlotGame(pool, 3000, 100, random);
      while (!isSlotGameOver(state)) state = spinSlot(state, random).state;
      for (const [uid, amount] of Object.entries(state.tallies)) totals[uid] += amount;
    }
    for (const uid of pool) {
      expect(totals[uid] / (games * 3000)).toBeCloseTo(1 / 3, 1);
    }
  });
});
