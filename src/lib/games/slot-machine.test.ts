import { describe, expect, it } from "vitest";
import {
  SLOT_DURATION_ROUNDS,
  SLOT_FREE_SPINS_AWARDED,
  SLOT_PAYTABLE,
  SLOT_SPINS_PER_TURN,
  SLOT_TOTAL_WEIGHT,
  SLOT_BOOST_SPINS,
  SLOT_DUEL_RANK,
  SLOT_FREE_SPIN_MAX_MULTIPLIER,
  SLOT_GAMBLE_MAX_STEPS,
  SLOT_PITY_AFTER,
  SLOT_PRIZE_FREE_SPINS,
  SLOT_WHEEL_SEGMENTS,
  applySlotChoice,
  applySlotGamble,
  applySlotGiftPick,
  applySlotHold,
  drawSlotDuel,
  drawSlotHold,
  applySlotOutcome,
  drawSlotGamble,
  drawSlotOutcome,
  drawSlotSpin,
  expectedStakesPerSpin,
  isSlotGameOver,
  nextSlotPlayer,
  niceStakeMinor,
  slotActiveSeats,
  slotAllocated,
  slotChoiceCandidates,
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

  it("charges about one and a half stakes per pull at a table of four, wilds and prizes included", () => {
    expect(expectedStakesPerSpin(4)).toBeCloseTo(1.399, 5);
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
  it("a miss costs the spinner the stake", () => {
    const after = play(game(["a", "b", "c"], 1000, 100), "miss");
    expect(after.tallies).toEqual({ a: 100 });
  });

  it("a pair costs nothing", () => {
    const after = play(game(["a", "b"], 1000, 100), "pair");
    expect(after.tallies).toEqual({});
  });

  it("lemons cost three stakes, bombs five", () => {
    expect(play(game(["a", "b"], 1000, 100), "lemons").tallies).toEqual({ a: 300 });
    expect(play(game(["a", "b"], 1000, 100), "bombs").tallies).toEqual({ a: 500 });
  });

  it("bells hand two stakes to the next player in line", () => {
    const after = play(game(["a", "b", "c"], 1000, 100), "bells");
    expect(after.tallies).toEqual({ b: 200 });
    expect(slotSpinner(after)).toBe("a");
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
      { uid: "b", amountMinor: 100 },
      { uid: "c", amountMinor: 100 },
    ]);
    expect(isSlotGameOver(result.state)).toBe(true);
  });

  it("the last pull takes exactly what's left", () => {
    const after = play(game(["a", "b"], 450, 100), "miss", "miss", "miss", "bombs");
    expect(after.tallies).toEqual({ a: 300, b: 150 });
    expect(isSlotGameOver(after)).toBe(true);
    expect(() => applySlotOutcome(after, "miss", FACES)).toThrow();
  });
});

describe("series of three", () => {
  it("keeps the machine with one person for three pulls, then passes it on", () => {
    let state = game(["a", "b", "c"], 10_000, 100);
    expect(state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN);
    for (let pull = 1; pull < SLOT_SPINS_PER_TURN; pull++) {
      state = play(state, "pair");
      expect(slotSpinner(state)).toBe("a");
      expect(state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN - pull);
    }
    state = play(state, "miss");
    expect(slotSpinner(state)).toBe("b");
    expect(state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN);
  });

  it("goes all the way round the table", () => {
    const order: string[] = [];
    let state = game(["a", "b", "c"], 100_000, 100);
    for (let pull = 0; pull < 9; pull++) {
      order.push(slotSpinner(state));
      state = play(state, "pair");
    }
    expect(order).toEqual(["a", "a", "a", "b", "b", "b", "c", "c", "c"]);
    expect(slotSpinner(state)).toBe("a");
  });
});

describe("free spins", () => {
  it("cherries award three free spins, played before the rest of the series", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "cherries", FACES);
    expect(result.freeSpinsAwarded).toBe(SLOT_FREE_SPINS_AWARDED);
    expect(result.state.freeSpinsLeft).toBe(SLOT_FREE_SPINS_AWARDED);
    expect(result.state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN - 1);
    expect(result.state.tallies).toEqual({});
  });

  it("a free spin's no-win costs nothing and doesn't use up the series", () => {
    let state = play(game(["a", "b"], 10_000, 100), "cherries");
    const free = applySlotOutcome(state, "miss", FACES);
    expect(free.freeSpin).toBe(true);
    expect(free.charges).toEqual([]);
    state = play(free.state, "miss", "miss");
    expect(state.tallies).toEqual({});
    expect(state.freeSpinsLeft).toBe(0);
    expect(state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN - 1);
    expect(slotSpinner(state)).toBe("a");
    state = play(state, "miss", "miss");
    expect(state.tallies).toEqual({ a: 200 });
    expect(slotSpinner(state)).toBe("b");
  });

  it("lemons and bombs still cost on a free spin", () => {
    const state = play(game(["a", "b"], 10_000, 100), "cherries", "lemons", "bombs");
    expect(state.tallies).toEqual({ a: 800 });
  });

  it("cherries on a free spin win three more", () => {
    const state = play(game(["a", "b"], 10_000, 100), "cherries", "cherries");
    expect(state.freeSpinsLeft).toBe(2 * SLOT_FREE_SPINS_AWARDED - 1);
  });

  it("a free spin on the last pull of the series still gets played", () => {
    const state = play(game(["a", "b"], 10_000, 100), "pair", "pair", "cherries");
    expect(state.turnSpinsLeft).toBe(0);
    expect(slotSpinner(state)).toBe("a");
    const after = play(state, "pair", "pair", "pair");
    expect(slotSpinner(after)).toBe("b");
    expect(after.freeSpinsLeft).toBe(0);
  });
});

describe("jackpot", () => {
  it("refunds everything the spinner paid and takes them out of the game", () => {
    const state = play(game(["a", "b", "c"], 2000, 100), "lemons", "miss");
    expect(slotSpinner(state)).toBe("a");
    const result = applySlotOutcome(state, "jackpot", FACES);
    // The miss grew the progressive jackpot by half a stake; b and c pay it.
    expect(result.charges).toEqual([
      { uid: "a", amountMinor: -400 },
      { uid: "b", amountMinor: 25 },
      { uid: "c", amountMinor: 25 },
    ]);
    expect(result.state.tallies).toEqual({ b: 25, c: 25 });
    expect(slotActiveSeats(result.state)).toEqual(["b", "c"]);
    expect(slotSpinner(result.state)).toBe("b");
    expect(result.state.turnSpinsLeft).toBe(SLOT_SPINS_PER_TURN);
    expect(result.lastPayer).toBeNull();
  });

  it("ends the winner's series at once, banked free spins included", () => {
    const state = play(game(["a", "b", "c"], 2000, 100), "cherries", "jackpot");
    expect(slotSpinner(state)).toBe("b");
    expect(state.freeSpinsLeft).toBe(0);
  });

  it("skips the winner from then on, for bells and stars too", () => {
    const state = play(game(["a", "b", "c"], 2000, 100), "jackpot");
    expect(nextSlotPlayer(state, "c")).toBe("b");
    expect(play(state, "pair", "bells").tallies).toEqual({ c: 200 });
    expect(play(state, "stars").tallies).toEqual({ c: 100 });
  });

  it("leaves the last one at the machine paying the rest", () => {
    const state = play(game(["a", "b"], 1000, 100), "miss", "miss");
    const result = applySlotOutcome(state, "jackpot", FACES);
    expect(result.lastPayer).toBe("b");
    expect(result.state.tallies).toEqual({ b: 1000 });
    expect(result.charges).toEqual([
      { uid: "a", amountMinor: -200 },
      { uid: "b", amountMinor: 1000 },
    ]);
    expect(isSlotGameOver(result.state)).toBe(true);
  });
});

describe("wild", () => {
  it("shows up on one reel of a three-of-a-kind and still reads as that combination", () => {
    const random = seededRandom(21);
    for (let i = 0; i < 100; i++) {
      const faces = slotReelFaces("bells", random, true);
      expect(faces.filter((face) => face === "wild")).toHaveLength(1);
      expect(slotOutcomeForFaces(faces)).toBe("bells");
    }
  });

  it("doubles what the combination does, good or bad", () => {
    const fresh = () => game(["a", "b", "c"], 10_000, 100);
    expect(applySlotOutcome(fresh(), "lemons", FACES, { wild: true }).state.tallies).toEqual({
      a: 600,
    });
    expect(applySlotOutcome(fresh(), "bells", FACES, { wild: true }).state.tallies).toEqual({
      b: 400,
    });
    expect(applySlotOutcome(fresh(), "cherries", FACES, { wild: true }).freeSpinsAwarded).toBe(
      2 * SLOT_FREE_SPINS_AWARDED,
    );
  });

  it("never comes with a ghost or the jackpot", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "jackpot", FACES, {
      wild: true,
    });
    expect(result.wild).toBe(false);
  });

  it("turns up in about one in five of the three-of-a-kinds it can", () => {
    const random = seededRandom(8);
    const state = game(["a", "b", "c"], 10_000, 100);
    let triples = 0;
    let wilds = 0;
    for (let i = 0; i < 40_000; i++) {
      const draw = drawSlotSpin(state, random);
      if (draw.kind === "lemons" || draw.kind === "stars") {
        triples++;
        if (draw.wild) wilds++;
      }
    }
    expect(wilds / triples).toBeCloseTo(0.2, 1);
  });
});

describe("die Rechnung", () => {
  it("charges everyone a stake, the spinner first", () => {
    const result = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "receipt", FACES);
    expect(result.charges.map((charge) => charge.uid)).toEqual(["a", "b", "c"]);
    expect(result.state.tallies).toEqual({ a: 100, b: 100, c: 100 });
  });
});

describe("Glücksklee", () => {
  it("waits for the spinner to point at someone, who then pays two stakes", () => {
    const after = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "clover", FACES).state;
    expect(after.pending).toEqual({ type: "clover", uid: "a", amountMinor: 200 });
    expect(slotChoiceCandidates(after, "a")).toEqual(["b", "c"]);
    expect(() => spinSlot(after, seededRandom(1))).toThrow();
    expect(() => applySlotChoice(after, "a")).toThrow();
    const chosen = applySlotChoice(after, "c");
    expect(chosen.charge).toEqual({ uid: "c", amountMinor: 200 });
    expect(chosen.state.tallies).toEqual({ c: 200 });
    expect(chosen.state.pending).toBeNull();
  });

  it("charges the only other player straight away", () => {
    const after = applySlotOutcome(game(["a", "b"], 10_000, 100), "clover", FACES).state;
    expect(after.pending).toBeNull();
    expect(after.tallies).toEqual({ b: 200 });
  });
});

describe("Geistertausch", () => {
  it("swaps the spinner's tally with someone else's, leaving the total alone", () => {
    const state = play(game(["a", "b", "c"], 10_000, 100), "pair", "pair", "pair", "bombs");
    expect(state.tallies).toEqual({ b: 500 });
    const result = applySlotOutcome(state, "ghost", FACES, { swapTarget: "a" });
    expect(result.swap).toEqual({ uid: "a", spinnerBefore: 500, otherBefore: 0 });
    expect(result.state.tallies).toEqual({ a: 500 });
    expect(result.charges).toEqual([
      { uid: "b", amountMinor: -500 },
      { uid: "a", amountMinor: 500 },
    ]);
    expect(slotAllocated(result.state)).toBe(500);
  });

  it("only ever picks someone still in the game, never the spinner", () => {
    const random = seededRandom(4);
    // b hits the jackpot and is out; c is at the machine.
    const state = play(game(["a", "b", "c", "d"], 10_000, 100), "pair", "pair", "pair", "jackpot");
    for (let i = 0; i < 2000; i++) {
      const draw = drawSlotSpin(state, random);
      if (draw.kind !== "ghost") continue;
      expect(["a", "d"]).toContain(draw.swapTarget);
    }
  });
});

describe("coins in free spins", () => {
  const coin = (reel: number, multiplier: number) => ({ reel, row: 0 as const, multiplier });

  it("go into a pot that the others pay, split evenly, when the free spins run out", () => {
    let state = play(game(["a", "b", "c"], 10_000, 100), "cherries");
    let result = applySlotOutcome(state, "pair", FACES, { coins: [coin(0, 2), coin(2, 5)] });
    expect(result.coinsCollectedMinor).toBe(700);
    expect(result.state.coinPotMinor).toBe(700);
    expect(result.potPayout).toBeNull();
    state = play(result.state, "pair");
    // The third free spin counts its coins three times over.
    result = applySlotOutcome(state, "pair", FACES, { coins: [coin(1, 1)] });
    expect(result.potPayout).toEqual({
      totalMinor: 1000,
      charges: [
        { uid: "b", amountMinor: 500 },
        { uid: "c", amountMinor: 500 },
      ],
    });
    expect(result.state.tallies).toEqual({ b: 500, c: 500 });
    expect(result.state.coinPotMinor).toBe(0);
  });

  it("give the odd cent to whoever is first in line", () => {
    let state = play(game(["a", "b", "c"], 10_000, 1), "cherries");
    state = applySlotOutcome(state, "pair", FACES, { coins: [coin(0, 5)] }).state;
    state = play(state, "pair", "pair");
    expect(state.tallies).toEqual({ b: 3, c: 2 });
  });

  it("are worth nothing outside free spins", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", FACES, {
      coins: [coin(0, 5)],
    });
    expect(result.coins).toEqual([]);
    expect(result.state.coinPotMinor).toBe(0);
  });

  it("only land on free spins, above or below the payline", () => {
    const random = seededRandom(17);
    const regular = game(["a", "b"], 10_000, 100);
    const free = play(regular, "cherries");
    let landed = 0;
    for (let i = 0; i < 500; i++) {
      expect(drawSlotSpin(regular, random).coins).toEqual([]);
      for (const c of drawSlotSpin(free, random).coins) {
        landed++;
        expect([0, 2]).toContain(c.row);
        expect([1, 2, 5]).toContain(c.multiplier);
      }
    }
    expect(landed).toBeGreaterThan(200);
  });
});

describe("Risiko", () => {
  it("is offered after a paid loss, on the spinner's charge", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "lemons", FACES);
    expect(result.state.gamble).toEqual({ uid: "a", amountMinor: 300, step: 0 });
  });

  it("strikes the loss off when the flip comes up", () => {
    const state = play(game(["a", "b"], 10_000, 100), "pair", "lemons");
    const result = applySlotGamble(state, true);
    expect(result.charge).toEqual({ uid: "a", amountMinor: -300 });
    expect(result.state.tallies).toEqual({});
    expect(result.state.gamble).toBeNull();
  });

  it("doubles it when it doesn't, and can be risked again up to the limit", () => {
    let state = play(game(["a", "b"], 10_000, 100), "miss");
    for (let step = 1; step <= SLOT_GAMBLE_MAX_STEPS; step++) {
      state = applySlotGamble(state, false).state;
      expect(state.tallies).toEqual({ a: 100 * 2 ** step });
    }
    expect(state.gamble).toBeNull();
  });

  it("isn't offered on a free spin, for a win, or once the bill is done", () => {
    const free = play(game(["a", "b"], 10_000, 100), "cherries", "lemons");
    expect(free.gamble).toBeNull();
    expect(play(game(["a", "b"], 10_000, 100), "stars").gamble).toBeNull();
    expect(play(game(["a", "b"], 300, 100), "lemons").gamble).toBeNull();
  });

  it("goes away with the next pull", () => {
    const state = play(game(["a", "b"], 10_000, 100), "miss", "pair");
    expect(state.gamble).toBeNull();
  });

  it("is fair: risking every loss doesn't change what anyone pays on average", () => {
    const random = seededRandom(31);
    let flips = 0;
    let delta = 0;
    for (let i = 0; i < 20_000; i++) {
      let state = play(game(["a", "b"], 1_000_000, 100), "miss");
      while (state.gamble) {
        const result = applySlotGamble(state, drawSlotGamble(random));
        delta += result.charge?.amountMinor ?? 0;
        state = result.state;
        flips++;
      }
    }
    expect(Math.abs(delta / flips)).toBeLessThan(5);
  });
});

describe("progressive jackpot", () => {
  it("grows by half a stake with every paid no-win, and not on a free or shielded one", () => {
    let state = play(game(["a", "b", "c"], 100_000, 100), "miss", "miss", "lemons");
    expect(state.jackpotPotMinor).toBe(100);
    state = play(state, "cherries", "miss");
    expect(state.jackpotPotMinor).toBe(100);
  });

  it("is paid by everyone else, split evenly, when someone hits 777", () => {
    const state = play(game(["a", "b", "c", "d"], 100_000, 100), "miss", "miss", "miss");
    expect(state.jackpotPotMinor).toBe(150);
    const result = applySlotOutcome(state, "jackpot", FACES);
    expect(result.jackpotPayout).toEqual({
      totalMinor: 150,
      charges: [
        { uid: "c", amountMinor: 50 },
        { uid: "d", amountMinor: 50 },
        { uid: "a", amountMinor: 50 },
      ],
    });
    expect(result.state.jackpotPotMinor).toBe(0);
  });
});

describe("Halten", () => {
  const pairFaces: SlotFaces = ["bell", "bell", "star"];

  it("is offered after a pair on a regular pull, mid-series", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", pairFaces);
    expect(result.state.hold).toEqual({ uid: "a", symbol: "bell", reel: 2 });
  });

  it("completes the three-of-a-kind on a lucky respin, without using up a pull", () => {
    const state = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "pair", pairFaces).state;
    const result = applySlotHold(state, true, seededRandom(2));
    expect(result.kind).toBe("bells");
    expect(result.respin).toEqual({ reel: 2, completed: true });
    expect(result.state.tallies).toEqual({ b: expect.any(Number) });
    expect(result.state.turnSpinsLeft).toBe(state.turnSpinsLeft);
    expect(result.state.holdUsed).toBe(true);
    expect(result.state.hold).toBeNull();
  });

  it("can complete a bad pair too", () => {
    const state = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", [
      "bomb",
      "star",
      "bomb",
    ]).state;
    const result = applySlotHold(state, true, { int: (min) => min + 50, shuffle: (x) => [...x] });
    expect(result.kind).toBe("bombs");
    expect(result.state.tallies).toEqual({ a: 500 });
  });

  it("lands on something else on an unlucky one, and nothing changes", () => {
    const state = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", pairFaces).state;
    const result = applySlotHold(state, false, seededRandom(3));
    expect(result.kind).toBe("pair");
    expect(result.faces[2]).not.toBe("bell");
    expect(result.state.tallies).toEqual({});
  });

  it("is only there once per series, not on the last pull, and not on a free spin", () => {
    let state = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", pairFaces).state;
    state = applySlotHold(state, false, seededRandom(4)).state;
    expect(applySlotOutcome(state, "pair", pairFaces).state.hold).toBeNull();
    const last = play(game(["a", "b"], 10_000, 100), "miss", "miss");
    expect(applySlotOutcome(last, "pair", pairFaces).state.hold).toBeNull();
    const free = play(game(["a", "b"], 10_000, 100), "cherries");
    expect(applySlotOutcome(free, "pair", pairFaces).state.hold).toBeNull();
  });

  it("goes away with the next pull", () => {
    const state = applySlotOutcome(game(["a", "b"], 10_000, 100), "pair", pairFaces).state;
    expect(play(state, "miss").hold).toBeNull();
  });
});

describe("free-spin multiplier", () => {
  const coin = (reel: number, multiplier: number) => ({ reel, row: 0 as const, multiplier });

  it("makes every free spin's coins worth one more time than the last", () => {
    let state = play(game(["a", "b", "c"], 100_000, 100), "cherries");
    const values: number[] = [];
    for (let i = 0; i < 3; i++) {
      const result = applySlotOutcome(state, "pair", FACES, { coins: [coin(0, 1)] });
      values.push(result.coinsCollectedMinor);
      state = result.state;
    }
    expect(values).toEqual([100, 200, 300]);
  });

  it("tops out, and starts over with the next free spins", () => {
    let state = play(game(["a", "b"], 1_000_000, 100), "cherries", "cherries", "cherries");
    for (let i = 0; i < 6; i++) state = play(state, "pair");
    expect(state.freeSpinMultiplier).toBeLessThanOrEqual(SLOT_FREE_SPIN_MAX_MULTIPLIER);
    while (state.freeSpinsLeft > 0) state = play(state, "pair");
    expect(state.freeSpinMultiplier).toBe(1);
  });
});

describe("bonus wheel", () => {
  const atSegment = (prize: (typeof SLOT_WHEEL_SEGMENTS)[number]) =>
    SLOT_WHEEL_SEGMENTS.indexOf(prize);

  it("makes everyone else pay two stakes", () => {
    const result = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "wheel", FACES, {
      wheelIndex: atSegment("othersPay2"),
    });
    expect(result.wheel?.outcome.prize).toBe("othersPay2");
    expect(result.state.tallies).toEqual({ b: 200, c: 200 });
  });

  it("costs the spinner three stakes", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "wheel", FACES, {
      wheelIndex: atSegment("pay3"),
    });
    expect(result.state.tallies).toEqual({ a: 300 });
  });

  it("awards free spins", () => {
    const result = applySlotOutcome(game(["a", "b"], 10_000, 100), "wheel", FACES, {
      wheelIndex: atSegment("freeSpins"),
    });
    expect(result.freeSpinsAwarded).toBe(SLOT_PRIZE_FREE_SPINS);
    expect(result.state.freeSpinsLeft).toBe(SLOT_PRIZE_FREE_SPINS);
  });

  it("hands out a shield that strikes off the holder's next loss", () => {
    let state = applySlotOutcome(game(["a", "b"], 10_000, 100), "wheel", FACES, {
      wheelIndex: atSegment("shield"),
    }).state;
    expect(state.shields).toEqual(["a"]);
    const shielded = applySlotOutcome(state, "bombs", FACES);
    expect(shielded.shieldUsed).toBe(true);
    expect(shielded.state.tallies).toEqual({});
    expect(shielded.state.shields).toEqual([]);
    state = play(shielded.state, "miss");
    expect(state.tallies).toEqual({ a: 100 });
  });

  it("boosts the holder's next pulls to double", () => {
    let state = applySlotOutcome(game(["a", "b"], 100_000, 100), "wheel", FACES, {
      wheelIndex: atSegment("boost"),
    }).state;
    expect(state.boost).toEqual({ uid: "a", spinsLeft: SLOT_BOOST_SPINS });
    const boosted = applySlotOutcome(state, "lemons", FACES);
    expect(boosted.boosted).toBe(true);
    expect(boosted.state.tallies).toEqual({ a: 600 });
    state = play(boosted.state, "miss");
    expect(state.tallies).toEqual({ a: 800 });
    // That was a's last pull of the series; b's pulls aren't boosted.
    state = play(state, "miss");
    expect(state.tallies).toEqual({ a: 800, b: 100 });
  });

  it("lands on every segment equally often", () => {
    const random = seededRandom(12);
    const state = game(["a", "b"], 10_000, 100);
    const counts = new Array(SLOT_WHEEL_SEGMENTS.length).fill(0);
    let wheels = 0;
    for (let i = 0; i < 60_000; i++) {
      const draw = drawSlotSpin(state, random);
      if (draw.kind !== "wheel") continue;
      wheels++;
      counts[draw.wheelIndex ?? 0]++;
    }
    for (const count of counts) expect(count / wheels).toBeCloseTo(1 / 8, 1);
  });
});

describe("gift boxes", () => {
  it("wait for the spinner to open one, and give what's inside", () => {
    const after = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "gift", FACES, {
      giftBoxes: ["pay3", "othersPay2", "shield"],
    }).state;
    expect(after.pending).toEqual({
      type: "gift",
      uid: "a",
      boxes: ["pay3", "othersPay2", "shield"],
    });
    expect(() => spinSlot(after, seededRandom(1))).toThrow();
    const opened = applySlotGiftPick(after, 1);
    expect(opened.outcome.prize).toBe("othersPay2");
    expect(opened.state.tallies).toEqual({ b: 200, c: 200 });
    expect(opened.state.pending).toBeNull();
  });

  it("keep the machine with the spinner until the box is open, so free spins still go to them", () => {
    const state = play(game(["a", "b"], 10_000, 100), "miss", "miss");
    const after = applySlotOutcome(state, "gift", FACES, {
      giftBoxes: ["freeSpins", "freeSpins", "freeSpins"],
    }).state;
    expect(slotSpinner(after)).toBe("a");
    const opened = applySlotGiftPick(after, 0).state;
    expect(slotSpinner(opened)).toBe("a");
    expect(opened.freeSpinsLeft).toBe(SLOT_PRIZE_FREE_SPINS);
  });

  it("pass the machine on once opened, if the series is over", () => {
    const state = play(game(["a", "b"], 10_000, 100), "miss", "miss");
    const after = applySlotOutcome(state, "gift", FACES, {
      giftBoxes: ["pay3", "pay3", "pay3"],
    }).state;
    expect(slotSpinner(applySlotGiftPick(after, 2).state)).toBe("b");
  });
});

describe("duel", () => {
  it("waits for the spinner to pick an opponent; the weaker reel pays three stakes", () => {
    const after = applySlotOutcome(game(["a", "b", "c"], 10_000, 100), "duel", FACES).state;
    expect(after.pending).toEqual({ type: "duel", uid: "a", amountMinor: 300 });
    expect(() => applySlotChoice(after, "b")).toThrow();
    const won = applySlotChoice(after, "b", ["seven", "lemon"]);
    expect(won.duel?.loser).toBe("b");
    expect(won.state.tallies).toEqual({ b: 300 });
    const lost = applySlotChoice(after, "c", ["bomb", "star"]);
    expect(lost.duel?.loser).toBe("a");
    expect(lost.state.tallies).toEqual({ a: 300 });
  });

  it("always draws two different ranks, each side winning half the time", () => {
    const random = seededRandom(9);
    let challengerWins = 0;
    for (let i = 0; i < 20_000; i++) {
      const [mine, theirs] = drawSlotDuel(random);
      expect(mine).not.toBe(theirs);
      if (SLOT_DUEL_RANK.indexOf(mine) > SLOT_DUEL_RANK.indexOf(theirs)) challengerWins++;
    }
    expect(challengerWins / 20_000).toBeCloseTo(0.5, 1);
  });
});

describe("streaks", () => {
  it("count wins up and no-wins down", () => {
    let state = play(game(["a", "b"], 100_000, 100), "pair", "stars");
    expect(state.streaks.a).toBe(2);
    state = play(state, "miss");
    expect(state.streaks.a).toBe(-1);
  });

  it("guarantee at least a pair after enough no-wins in a row", () => {
    const random = seededRandom(13);
    let state = game(["a", "b"], 1_000_000, 1);
    state = { ...state, streaks: { a: -SLOT_PITY_AFTER } };
    for (let i = 0; i < 500; i++) {
      expect(drawSlotSpin(state, random).kind).not.toBe("miss");
    }
    expect(spinSlot(state, random).pity).toBe(true);
  });
});

/**
 * Plays one move the way people at the table might: a Glücksklee pick at
 * random, the Risiko button about half the time, otherwise a pull.
 */
function step(state: SlotGameState, random: SlotRandom): SlotGameState {
  const pending = state.pending;
  if (pending?.type === "gift") {
    return applySlotGiftPick(state, random.int(0, 2)).state;
  }
  if (pending) {
    const candidates = slotChoiceCandidates(state, pending.uid);
    const target = candidates[random.int(0, candidates.length - 1)];
    return applySlotChoice(state, target, drawSlotDuel(random)).state;
  }
  if (state.hold && random.int(0, 1) === 1) {
    return applySlotHold(state, drawSlotHold(random), random).state;
  }
  if (state.gamble && random.int(0, 1) === 1) {
    return applySlotGamble(state, drawSlotGamble(random)).state;
  }
  return spinSlot(state, random).state;
}

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
        state = step(state, random);
        spins++;
        expect(spins).toBeLessThan(5_000);
      }
      expect(slotAllocated(state)).toBe(amountMinor);
      for (const amount of Object.values(state.tallies)) expect(amount).toBeGreaterThan(0);
      for (const uid of state.out) expect(state.tallies[uid]).toBeUndefined();
    }
  });

  it("lasts about as many series as the chosen length", () => {
    const random = seededRandom(99);
    const pool = ["a", "b", "c", "d"];
    const amountMinor = 10_000;
    const stake = slotStakeForDuration(amountMinor, pool.length, "normal");
    let totalSpins = 0;
    const games = 400;
    for (let i = 0; i < games; i++) {
      let state = startSlotGame(pool, amountMinor, stake, random);
      while (!isSlotGameOver(state)) state = step(state, random);
      totalSpins += state.spins;
    }
    // Free spins come on top of the series, so count pulls per person, not series.
    const pullsPerPerson = totalSpins / games / pool.length;
    const target = SLOT_DURATION_ROUNDS.normal * SLOT_SPINS_PER_TURN;
    expect(pullsPerPerson).toBeGreaterThan(target * 0.6);
    expect(pullsPerPerson).toBeLessThan(target * 1.6);
  });

  it("is fair in the long run: every seat pays about the same share", () => {
    const random = seededRandom(5);
    const pool = ["a", "b", "c"];
    const totals: Record<string, number> = { a: 0, b: 0, c: 0 };
    const games = 3000;
    for (let i = 0; i < games; i++) {
      let state = startSlotGame(pool, 3000, 100, random);
      while (!isSlotGameOver(state)) state = step(state, random);
      for (const [uid, amount] of Object.entries(state.tallies)) totals[uid] += amount;
    }
    for (const uid of pool) {
      expect(totals[uid] / (games * 3000)).toBeCloseTo(1 / 3, 1);
    }
  });
});
