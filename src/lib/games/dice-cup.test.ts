import { describe, expect, it } from "vitest";
import {
  diceKind,
  diceNumber,
  diceRank,
  diceStanding,
  diceZoneChanges,
  isDiceGameOver,
  isDie,
  latestDiceRoll,
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

describe("live standings", () => {
  function play(pool: string[], payers: number, rolls: [string, DicePair][]): DiceGame {
    let game = startDiceGame(pool, payers);
    for (const [uid, pair] of rolls) game = recordDiceRoll(game, uid, pair);
    return game;
  }

  it("starts with everyone waiting, an empty zone and no target", () => {
    const standing = diceStanding(startDiceGame(["a", "b", "c"], 1));
    expect(standing.order).toEqual(["a", "b", "c"]);
    expect(standing.seats).toEqual({ a: "waiting", b: "waiting", c: "waiting" });
    expect(standing.zoneSize).toBe(0);
    expect(standing.target).toBeNull();
  });

  it("puts the first roll in the zone and makes it the roll to beat", () => {
    const standing = diceStanding(play(["a", "b", "c"], 1, [["a", [5, 4]]]));
    expect(standing.seats.a).toBe("zone");
    expect(standing.order).toEqual(["a", "b", "c"]);
    expect(standing.zoneSize).toBe(1);
    expect(standing.target).toEqual({ pair: [5, 4], holders: ["a"] });
  });

  it("ticks off whoever is above the line straight away", () => {
    const standing = diceStanding(
      play(["a", "b", "c", "d"], 1, [
        ["a", [5, 4]],
        ["b", [6, 3]],
      ]),
    );
    expect(standing.seats).toEqual({ a: "zone", b: "safe", c: "waiting", d: "waiting" });
    // Zone first, then whoever is still to roll, then the safe.
    expect(standing.order).toEqual(["a", "c", "d", "b"]);
    expect(standing.zoneSize).toBe(1);
  });

  it("hands the zone on when someone rolls lower, saving the one who was in it", () => {
    const before = play(["a", "b", "c", "d"], 1, [
      ["a", [5, 4]],
      ["b", [6, 3]],
    ]);
    const after = recordDiceRoll(before, "c", [3, 1]);
    const standing = diceStanding(after);
    expect(standing.seats).toEqual({ a: "safe", b: "safe", c: "zone", d: "waiting" });
    expect(standing.order).toEqual(["c", "d", "a", "b"]);
    expect(standing.target).toEqual({ pair: [3, 1], holders: ["c"] });
    expect(diceZoneChanges(diceStanding(before), standing)).toEqual({
      entered: ["c"],
      saved: ["a"],
    });
  });

  it("keeps the zone open while fewer have rolled than will pay", () => {
    const standing = diceStanding(play(["a", "b", "c", "d"], 2, [["a", [6, 5]]]));
    expect(standing.seats.a).toBe("zone");
    expect(standing.target).toBeNull();
  });

  it("names everyone level on the line, and the roll they share", () => {
    const standing = diceStanding(
      play(["a", "b", "c"], 1, [
        ["a", [4, 2]],
        ["b", [2, 4]],
      ]),
    );
    expect(standing.seats).toEqual({ a: "line", b: "line", c: "waiting" });
    expect(standing.zoneSize).toBe(2);
    expect(standing.target).toEqual({ pair: [4, 2], holders: ["a", "b"] });
  });

  it("compares the target by rank, not by the number: a double two outranks 65", () => {
    // With two to pay, the line is a's 65 — b's 22 is the better roll, although the smaller number.
    const standing = diceStanding(
      play(["a", "b", "c", "d"], 2, [
        ["a", [6, 5]],
        ["b", [2, 2]],
        ["c", [3, 1]],
      ]),
    );
    expect(standing.target).toEqual({ pair: [6, 5], holders: ["a"] });
    // c's 31 stays among the two lowest whatever d rolls.
    expect(standing.seats).toEqual({ a: "zone", b: "safe", c: "pays", d: "waiting" });
  });

  it("makes a Mäxchen on the line unbeatable — only another one can draw level", () => {
    const standing = diceStanding(play(["a", "b"], 1, [["a", [1, 2]]]));
    expect(standing.target?.pair).toEqual([1, 2]);
    expect(diceKind(standing.target!.pair)).toBe("maexchen");
  });

  it("marks a payer as certain once nobody left to roll can push them out", () => {
    const standing = diceStanding(
      play(["a", "b", "c"], 2, [
        ["a", [5, 4]],
        ["b", [3, 1]],
      ]),
    );
    // c can roll anything: b's 31 stays among the two lowest.
    expect(standing.seats).toEqual({ a: "zone", b: "pays", c: "waiting" });
    expect(standing.order).toEqual(["b", "a", "c"]);
  });

  it("lists a roll-off with the settled payers on top and the settled safe at the bottom", () => {
    // Three pay: a is settled at 31, c and d straddle the line at 42, e is safe.
    let game = play(["a", "b", "c", "d", "e"], 3, [
      ["a", [3, 1]],
      ["b", [3, 2]],
      ["c", [4, 2]],
      ["d", [2, 4]],
      ["e", [6, 6]],
    ]);
    expect(game.losers).toEqual(["a", "b"]);
    expect(game.contenders).toEqual(["c", "d"]);
    let standing = diceStanding(game);
    expect(standing.seats).toEqual({
      a: "pays",
      b: "pays",
      c: "waiting",
      d: "waiting",
      e: "safe",
    });
    expect(standing.order).toEqual(["a", "b", "c", "d", "e"]);
    expect(standing.zoneSize).toBe(2);

    game = recordDiceRoll(game, "c", [5, 1]);
    standing = diceStanding(game);
    expect(standing.seats.c).toBe("zone");
    expect(standing.target).toEqual({ pair: [5, 1], holders: ["c"] });
    expect(standing.order).toEqual(["a", "b", "c", "d", "e"]);

    game = recordDiceRoll(game, "d", [6, 2]);
    standing = diceStanding(game);
    expect(isDiceGameOver(game)).toBe(true);
    // d won the roll-off and was settled after e, so sits nearer the line.
    expect(standing.order).toEqual(["a", "b", "c", "d", "e"]);
    expect(standing.seats).toEqual({ a: "pays", b: "pays", c: "pays", d: "safe", e: "safe" });
    expect(standing.zoneSize).toBe(3);
    expect(standing.target).toBeNull();
  });

  it("orders earlier rounds' safe players after the later rounds'", () => {
    // e is safe from round one (66); d wins the roll-off later.
    const game = play(["e", "c", "d"], 1, [
      ["e", [6, 6]],
      ["c", [4, 2]],
      ["d", [4, 2]],
      ["c", [3, 1]],
      ["d", [6, 5]],
    ]);
    expect(isDiceGameOver(game)).toBe(true);
    expect(diceStanding(game).order).toEqual(["c", "d", "e"]);
  });

  it("does not call a tie on the line saved when it turns into a roll-off", () => {
    const before = play(["a", "b", "c"], 1, [
      ["a", [6, 5]],
      ["b", [3, 1]],
    ]);
    const after = recordDiceRoll(before, "c", [1, 3]);
    expect(after.contenders).toEqual(["b", "c"]);
    const change = diceZoneChanges(diceStanding(before), diceStanding(after));
    expect(change).toEqual({ entered: [], saved: [] });
    expect(diceStanding(after).seats).toEqual({ a: "safe", b: "waiting", c: "waiting" });
  });

  it("finds a player's latest roll across rounds", () => {
    const game = play(["a", "b", "c"], 1, [
      ["a", [6, 5]],
      ["b", [3, 1]],
      ["c", [1, 3]],
      ["b", [4, 4]],
    ]);
    expect(latestDiceRoll(game, "b")).toEqual([4, 4]);
    expect(latestDiceRoll(game, "c")).toEqual([1, 3]);
    expect(latestDiceRoll(game, "a")).toEqual([6, 5]);
    expect(latestDiceRoll(startDiceGame(["a"], 1), "a")).toBeNull();
  });

  it("never ticks off anyone who ends up paying, and agrees with the verdict once a round is judged", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const random = seeded(seed);
      const roll = (): DicePair => [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
      const size = 2 + Math.floor(random() * 8);
      const pool = Array.from({ length: size }, (_, i) => `p${i}`);
      const payers = 1 + Math.floor(random() * (size - 1));
      let game = startDiceGame(pool, payers);
      const everSafe = new Set<string>();
      const everCertain = new Set<string>();
      let guard = 0;
      while (!isDiceGameOver(game)) {
        if (++guard > 2000) throw new Error("dice game did not finish");
        const before = diceStanding(game);
        expect([...before.order].sort()).toEqual([...pool].sort());
        for (const uid of pool) {
          if (before.seats[uid] === "safe") everSafe.add(uid);
          if (before.seats[uid] === "pays") everCertain.add(uid);
        }

        const uid = nextRoller(game)!;
        const pair = roll();
        const next = recordDiceRoll(game, uid, pair);
        const after = diceStanding(next);

        // The target means what the hint says: beat it and you're out, fall short and you're in.
        if (before.target) {
          const versus = diceRank(pair) - diceRank(before.target.pair);
          if (versus > 0) expect(after.seats[uid]).toBe("safe");
          if (versus < 0) expect(["pays", "zone"]).toContain(after.seats[uid]);
        } else if (Object.keys(game.rolls).length > 0) {
          // An open zone: whatever you roll, you're in it (or a roll-off decides).
          expect(after.seats[uid]).not.toBe("safe");
        }

        // A judged round: the standings are the verdict.
        if (next.rounds.length > game.rounds.length) {
          const verdict = resolveDiceRound(next.rounds.at(-1)!.rolls, game.slots);
          for (const loser of verdict.losers) expect(after.seats[loser]).toBe("pays");
          for (const safe of verdict.safe) expect(after.seats[safe]).toBe("safe");
          for (const tied of verdict.tied) expect(after.seats[tied]).toBe("waiting");
        }

        // Nobody is ever both rescued and pulled back in.
        const change = diceZoneChanges(before, after);
        for (const saved of change.saved) expect(change.entered).not.toContain(saved);
        game = next;
      }
      for (const uid of everSafe) expect(game.safe).toContain(uid);
      for (const uid of everCertain) expect(game.losers).toContain(uid);
      expect(diceStanding(game).zoneSize).toBe(payers);
    }
  });
});
