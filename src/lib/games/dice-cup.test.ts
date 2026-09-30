import { describe, expect, it } from "vitest";
import {
  diceKind,
  diceNumber,
  diceRank,
  isDiceGameOver,
  isDie,
  maxDiceLoserCount,
  nextRoller,
  recordDiceRoll,
  resolveDiceRound,
  startDiceGame,
  type DiceGame,
  type DicePair,
} from "./dice-cup";

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

describe("ranking", () => {
  // Best to worst, the way the pub classic reads them.
  const BEST_TO_WORST: DicePair[] = [
    [2, 1],
    [6, 6],
    [5, 5],
    [4, 4],
    [3, 3],
    [2, 2],
    [1, 1],
    [6, 5],
    [6, 4],
    [6, 3],
    [6, 2],
    [6, 1],
    [5, 4],
    [5, 3],
    [5, 2],
    [5, 1],
    [4, 3],
    [4, 2],
    [4, 1],
    [3, 2],
    [3, 1],
  ];

  it("lists all 21 distinct rolls", () => {
    expect(BEST_TO_WORST).toHaveLength(21);
  });

  it("ranks every roll strictly below the one before it", () => {
    for (let i = 1; i < BEST_TO_WORST.length; i++) {
      expect(diceRank(BEST_TO_WORST[i])).toBeLessThan(diceRank(BEST_TO_WORST[i - 1]));
    }
  });

  it("does not care which die is which", () => {
    for (let a = 1; a <= 6; a++) {
      for (let b = 1; b <= 6; b++) {
        expect(diceRank([a, b])).toBe(diceRank([b, a]));
        expect(diceKind([a, b])).toBe(diceKind([b, a]));
        expect(diceNumber([a, b])).toBe(diceNumber([b, a]));
      }
    }
  });

  it("reads the bigger die first", () => {
    expect(diceNumber([3, 5])).toBe(53);
    expect(diceNumber([1, 2])).toBe(21);
    expect(diceNumber([6, 6])).toBe(66);
  });

  it("recognises the Mäxchen and the Päsche", () => {
    expect(diceKind([1, 2])).toBe("maexchen");
    expect(diceKind([2, 1])).toBe("maexchen");
    expect(diceKind([4, 4])).toBe("pasch");
    expect(diceKind([6, 5])).toBe("plain");
  });

  it("accepts only whole numbers from one to six as dice", () => {
    expect(isDie(1)).toBe(true);
    expect(isDie(6)).toBe(true);
    expect(isDie(0)).toBe(false);
    expect(isDie(7)).toBe(false);
    expect(isDie(2.5)).toBe(false);
    expect(isDie("3")).toBe(false);
  });
});

describe("resolveDiceRound", () => {
  it("lets the lowest roll pay", () => {
    const verdict = resolveDiceRound({ a: [6, 5], b: [3, 1], c: [4, 4] }, 1);
    expect(verdict).toEqual({ losers: ["b"], safe: ["a", "c"], tied: [], tiedSlots: 0 });
  });

  it("lets the lowest several pay", () => {
    const verdict = resolveDiceRound({ a: [6, 5], b: [3, 1], c: [4, 4], d: [5, 2] }, 2);
    expect(verdict.losers).toEqual(["b", "d"]);
    expect(verdict.safe).toEqual(["a", "c"]);
    expect(verdict.tied).toEqual([]);
  });

  it("makes two people level on the line roll off", () => {
    const verdict = resolveDiceRound({ a: [6, 5], b: [3, 1], c: [1, 3] }, 1);
    expect(verdict.losers).toEqual([]);
    expect(verdict.safe).toEqual(["a"]);
    expect(verdict.tied.sort()).toEqual(["b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
  });

  it("needs no roll-off when everyone level on the line pays anyway", () => {
    const verdict = resolveDiceRound({ a: [6, 5], b: [3, 1], c: [1, 3] }, 2);
    expect(verdict.losers.sort()).toEqual(["b", "c"]);
    expect(verdict.tied).toEqual([]);
  });

  it("only rolls off the people level on the line, not everyone below", () => {
    // Three pay; two are at 31 (the lowest), two at 42 straddle the line.
    const verdict = resolveDiceRound({ a: [3, 1], b: [1, 3], c: [4, 2], d: [2, 4], e: [6, 6] }, 3);
    expect(verdict.losers.sort()).toEqual(["a", "b"]);
    expect(verdict.tied.sort()).toEqual(["c", "d"]);
    expect(verdict.tiedSlots).toBe(1);
    expect(verdict.safe).toEqual(["e"]);
  });

  it("rolls everyone off when they all rolled the same", () => {
    const verdict = resolveDiceRound({ a: [5, 5], b: [5, 5], c: [5, 5] }, 1);
    expect(verdict.tied.sort()).toEqual(["a", "b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
  });
});

describe("a whole game", () => {
  function rollAll(game: DiceGame, rolls: Record<string, DicePair>): DiceGame {
    let next = game;
    for (;;) {
      const uid = nextRoller(next);
      if (!uid) return next;
      next = recordDiceRoll(next, uid, rolls[uid]);
      if (Object.keys(next.rolls).length === 0) return next;
    }
  }

  it("settles in one round when nobody is level on the line", () => {
    let game = startDiceGame(["a", "b", "c"], 1);
    game = rollAll(game, { a: [6, 5], b: [2, 1], c: [3, 1] });
    expect(isDiceGameOver(game)).toBe(true);
    expect(game.losers).toEqual(["c"]);
    expect(game.safe.sort()).toEqual(["a", "b"]);
    expect(game.rounds).toHaveLength(1);
  });

  it("asks the next person to roll until everyone has", () => {
    let game = startDiceGame(["a", "b", "c"], 1);
    expect(nextRoller(game)).toBe("a");
    game = recordDiceRoll(game, "a", [6, 5]);
    expect(nextRoller(game)).toBe("b");
    game = recordDiceRoll(game, "b", [6, 4]);
    expect(nextRoller(game)).toBe("c");
    expect(isDiceGameOver(game)).toBe(false);
  });

  it("ignores a roll from someone who is not up or has already rolled", () => {
    const game = recordDiceRoll(startDiceGame(["a", "b"], 1), "a", [6, 5]);
    expect(recordDiceRoll(game, "a", [1, 3])).toBe(game);
    expect(recordDiceRoll(game, "zed", [1, 3])).toBe(game);
  });

  it("rolls off a tie on the line — with only the tied people — and pays whoever loses it", () => {
    let game = startDiceGame(["a", "b", "c"], 1);
    game = rollAll(game, { a: [6, 5], b: [3, 1], c: [1, 3] });
    expect(isDiceGameOver(game)).toBe(false);
    expect(game.contenders.sort()).toEqual(["b", "c"]);
    expect(game.slots).toBe(1);
    expect(game.safe).toEqual(["a"]);
    expect(game.rounds[0].tied.sort()).toEqual(["b", "c"]);

    // The roll-off: a never rolls again.
    expect(nextRoller(game)).toBe("b");
    game = rollAll(game, { a: [1, 1], b: [5, 5], c: [2, 1] });
    expect(isDiceGameOver(game)).toBe(true);
    // c's Mäxchen beats b's double five, so b pays.
    expect(game.losers).toEqual(["b"]);
    expect(game.safe.sort()).toEqual(["a", "c"]);
    expect(game.rounds).toHaveLength(2);
  });

  it("clamps the number of payers so someone always stays dry", () => {
    expect(maxDiceLoserCount(2)).toBe(1);
    expect(maxDiceLoserCount(6)).toBe(5);
    expect(startDiceGame(["a", "b", "c"], 9).slots).toBe(2);
    expect(startDiceGame(["a", "b", "c"], 0).slots).toBe(1);
  });

  it("always ends with exactly the requested payers, every loser rolling no higher than every safe player's first roll", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const random = seeded(seed);
      const roll = (): DicePair => [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
      const size = 2 + Math.floor(random() * 8);
      const pool = Array.from({ length: size }, (_, i) => `p${i}`);
      const payers = 1 + Math.floor(random() * (size - 1));
      let game = startDiceGame(pool, payers);
      let guard = 0;
      while (!isDiceGameOver(game)) {
        if (++guard > 2000) throw new Error("dice game did not finish");
        const uid = nextRoller(game)!;
        game = recordDiceRoll(game, uid, roll());
      }
      expect(game.losers).toHaveLength(payers);
      expect(new Set(game.losers).size).toBe(payers);
      expect(game.losers.length + game.safe.length).toBe(size);
      expect([...game.losers, ...game.safe].sort()).toEqual([...pool].sort());

      const first = game.rounds[0].rolls;
      for (const loser of game.losers) {
        for (const safe of game.safe) {
          expect(diceRank(first[loser])).toBeLessThanOrEqual(diceRank(first[safe]));
        }
      }
    }
  });
});
