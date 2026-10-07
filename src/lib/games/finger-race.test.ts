import { describe, expect, it } from "vitest";
import {
  FINGER_MAX_PLAYERS,
  FINGER_REST_MS,
  FINGER_SETTLE_MS,
  FINGER_TIE_WINDOW_MS,
  allRestingSince,
  armFingerRound,
  closeFingerRound,
  falseStarters,
  falseStartsDecide,
  fingerCancel,
  fingerCatch,
  fingerDown,
  fingerPoolLimit,
  fingerRoundSettled,
  fingerSeats,
  fingerStandings,
  fingerUp,
  heldCircle,
  isFingerGameOver,
  judgeFingerRound,
  liftMs,
  maxFingerLoserCount,
  nextFingerRound,
  recordFingerRound,
  signalFingerRound,
  startFingerGame,
  startFingerRound,
  type FingerGame,
  type FingerRound,
} from "./finger-race";

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

const SIGNAL = 10_000;

/** Every contender puts a finger down (pointer ids 1, 2, …) and the round arms. */
function armed(contenders: readonly string[], slots: number): FingerRound {
  let round = startFingerRound(contenders, slots);
  contenders.forEach((uid, index) => {
    round = fingerDown(round, index + 1, uid, 100 + index);
  });
  return armFingerRound(round, 100 + contenders.length + FINGER_REST_MS);
}

function pointerOf(round: FingerRound, uid: string): number {
  const finger = round.fingers.find((candidate) => candidate.uid === uid);
  if (!finger) throw new Error(`${uid} has no finger down`);
  return finger.pointerId;
}

/**
 * A whole round through the reducers: armed, „LOS!“ at `SIGNAL`, then each
 * listed lift (absolute timestamps, in the order given), then closed.
 * Contenders not in `lifts` never lift.
 */
function race(
  contenders: readonly string[],
  slots: number,
  lifts: Record<string, number>,
  { signal = true }: { signal?: boolean } = {},
): FingerRound {
  let round = armed(contenders, slots);
  const ordered = Object.entries(lifts).sort(([, a], [, b]) => a - b);
  let signalled = false;
  for (const [uid, at] of ordered) {
    if (signal && !signalled && at >= SIGNAL) {
      round = signalFingerRound(round, SIGNAL);
      signalled = true;
    }
    round = fingerUp(round, pointerOf(round, uid), at);
  }
  if (signal && !signalled) round = signalFingerRound(round, SIGNAL);
  return closeFingerRound(round);
}

describe("limits", () => {
  it("caps the table at five, or what the screen can track", () => {
    expect(fingerPoolLimit(5)).toBe(5);
    expect(fingerPoolLimit(10)).toBe(FINGER_MAX_PLAYERS);
    expect(fingerPoolLimit(2)).toBe(2);
  });

  it("falls back to five when the device reports no touch points", () => {
    expect(fingerPoolLimit(0)).toBe(5);
    expect(fingerPoolLimit(undefined)).toBe(5);
    expect(fingerPoolLimit(null)).toBe(5);
  });

  it("always keeps one person dry", () => {
    expect(maxFingerLoserCount(2)).toBe(1);
    expect(maxFingerLoserCount(5)).toBe(4);
    expect(maxFingerLoserCount(1)).toBe(1);
  });
});

describe("touch bookkeeping", () => {
  it("gives each finger the circle it came down on", () => {
    let round = startFingerRound(["a", "b"], 1);
    round = fingerDown(round, 7, "a", 100);
    expect(heldCircle(round, "a")).toBe(true);
    expect(heldCircle(round, "b")).toBe(false);
    expect(round.fingers).toEqual([{ pointerId: 7, uid: "a", downAt: 100 }]);
  });

  it("ignores a second finger on a circle that is already held", () => {
    const round = fingerDown(startFingerRound(["a", "b"], 1), 1, "a", 100);
    expect(fingerDown(round, 2, "a", 120)).toBe(round);
    // …and that finger's lift changes nothing either.
    expect(fingerUp(round, 2, 200)).toBe(round);
  });

  it("ignores the same pointer claiming a second circle", () => {
    const round = fingerDown(startFingerRound(["a", "b"], 1), 1, "a", 100);
    expect(fingerDown(round, 1, "b", 120)).toBe(round);
  });

  it("ignores circles of players who aren't in this round", () => {
    const round = startFingerRound(["a", "b"], 1);
    expect(fingerDown(round, 1, "c", 100)).toBe(round);
  });

  it("frees a circle when its finger lifts before the round is armed — no penalty", () => {
    let round = fingerDown(startFingerRound(["a", "b"], 1), 1, "a", 100);
    round = fingerUp(round, 1, 150);
    expect(heldCircle(round, "a")).toBe(false);
    expect(round.lifts).toEqual({});
    // Someone else may take the free pointer id later; the circle is claimable again.
    expect(heldCircle(fingerDown(round, 1, "a", 200), "a")).toBe(true);
  });

  it("frees a circle on pointercancel while gathering, without voiding anything", () => {
    let round = fingerDown(startFingerRound(["a", "b"], 1), 1, "a", 100);
    round = fingerCancel(round, 1);
    expect(round.phase).toBe("gather");
    expect(round.voided).toBe(false);
    expect(heldCircle(round, "a")).toBe(false);
  });

  it("ignores a cancel for a pointer it doesn't track", () => {
    const round = fingerDown(startFingerRound(["a", "b"], 1), 1, "a", 100);
    expect(fingerCancel(round, 9)).toBe(round);
  });

  it("knows when every finger is down, and since when", () => {
    let round = startFingerRound(["a", "b", "c"], 1);
    round = fingerDown(round, 1, "a", 100);
    round = fingerDown(round, 2, "b", 180);
    expect(allRestingSince(round)).toBeNull();
    round = fingerDown(round, 3, "c", 150);
    expect(allRestingSince(round)).toBe(180);
  });

  it("arms only once every finger has rested long enough", () => {
    let round = startFingerRound(["a", "b"], 1);
    round = fingerDown(round, 1, "a", 100);
    expect(armFingerRound(round, 5000)).toBe(round);
    round = fingerDown(round, 2, "b", 300);
    expect(armFingerRound(round, 300 + FINGER_REST_MS - 1)).toBe(round);
    expect(armFingerRound(round, 300 + FINGER_REST_MS).phase).toBe("steady");
  });

  it("takes no new fingers once armed", () => {
    const round = armed(["a", "b"], 1);
    expect(fingerDown(round, 9, "a", 2000)).toBe(round);
    const lifted = fingerUp(round, pointerOf(round, "a"), 2000);
    expect(fingerDown(lifted, 9, "a", 2100)).toBe(lifted);
  });

  it("signals only from the armed pause", () => {
    const gathering = startFingerRound(["a", "b"], 1);
    expect(signalFingerRound(gathering, SIGNAL)).toBe(gathering);
    const round = signalFingerRound(armed(["a", "b"], 1), SIGNAL);
    expect(round.phase).toBe("go");
    expect(round.signalAt).toBe(SIGNAL);
    expect(signalFingerRound(round, SIGNAL + 5)).toBe(round);
  });
});

describe("false starts", () => {
  it("counts a lift during the armed pause", () => {
    let round = armed(["a", "b", "c"], 2);
    round = fingerUp(round, pointerOf(round, "b"), 3000);
    expect(round.lifts).toEqual({ b: 3000 });
    expect(falseStarters(round)).toEqual(["b"]);
    expect(falseStartsDecide(round)).toBe(false);
    round = fingerUp(round, pointerOf(round, "c"), 3100);
    expect(falseStartsDecide(round)).toBe(true);
  });

  it("counts a lift stamped before „LOS!“ even when it is handled after", () => {
    let round = signalFingerRound(armed(["a", "b"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL - 3);
    expect(falseStarters(round)).toEqual(["a"]);
    expect(liftMs(round, "a")).toBeNull();
  });

  it("a false start pays and everyone else is safe", () => {
    const verdict = judgeFingerRound(race(["a", "b", "c"], 1, { b: 4000 }, { signal: false }));
    expect(verdict).toEqual({
      losers: ["b"],
      safe: ["a", "c"],
      tied: [],
      tiedSlots: 0,
      falseStarts: ["b"],
      replay: null,
    });
  });

  it("more false starts than payers: only the false starters play again", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c", "d"], 1, { c: 4000, a: 4040 }, { signal: false }),
    );
    expect(verdict.losers).toEqual([]);
    expect(verdict.safe).toEqual(["b", "d"]);
    expect(verdict.tied).toEqual(["a", "c"]);
    expect(verdict.tiedSlots).toBe(1);
    expect(verdict.replay).toBe("falseStarts");
  });

  it("fewer false starts than payers: they pay, the slowest of the rest fill the other places", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c", "d"], 2, { d: 4000, a: SIGNAL + 200, b: SIGNAL + 450, c: SIGNAL + 300 }),
    );
    expect(verdict.losers).toEqual(["d", "b"]);
    expect(verdict.safe).toEqual(["a", "c"]);
    expect(verdict.falseStarts).toEqual(["d"]);
    expect(verdict.replay).toBeNull();
  });
});

describe("the race", () => {
  it("the slowest finger pays", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c"], 1, { a: SIGNAL + 210, b: SIGNAL + 340, c: SIGNAL + 260 }),
    );
    expect(verdict.losers).toEqual(["b"]);
    expect(verdict.safe).toEqual(["a", "c"]);
    expect(verdict.replay).toBeNull();
  });

  it("the slowest k pay, the very slowest last", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c", "d", "e"], 3, {
        a: SIGNAL + 400,
        b: SIGNAL + 200,
        c: SIGNAL + 600,
        d: SIGNAL + 300,
        e: SIGNAL + 500,
      }),
    );
    expect(verdict.losers).toEqual(["a", "e", "c"]);
    expect(verdict.safe).toEqual(["b", "d"]);
  });

  it("a finger that never lifts is the slowest of all", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c"], 1, { a: SIGNAL + 900, b: SIGNAL + 250 }),
    );
    expect(verdict.losers).toEqual(["c"]);
  });

  it("two fingers that never lift are level", () => {
    const verdict = judgeFingerRound(race(["a", "b", "c"], 1, { a: SIGNAL + 250 }));
    expect(verdict.safe).toEqual(["a"]);
    expect(verdict.tied).toEqual(["b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
  });

  it("a dead heat on the paying line replays among only those two", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c", "d"], 1, {
        a: SIGNAL + 200,
        b: SIGNAL + 400,
        c: SIGNAL + 400 + FINGER_TIE_WINDOW_MS,
        d: SIGNAL + 250,
      }),
    );
    expect(verdict.losers).toEqual([]);
    expect(verdict.safe).toEqual(["a", "d"]);
    expect(verdict.tied).toEqual(["b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
    expect(verdict.replay).toBe("tooClose");
  });

  it("just outside the tie window is a clear result", () => {
    const verdict = judgeFingerRound(
      race(["a", "b"], 1, { a: SIGNAL + 400, b: SIGNAL + 400 + FINGER_TIE_WINDOW_MS + 1 }),
    );
    expect(verdict.losers).toEqual(["b"]);
    expect(verdict.replay).toBeNull();
  });

  it("a dead heat away from the line settles anyway", () => {
    // a and b are level, but both are faster than the one who pays.
    const verdict = judgeFingerRound(
      race(["a", "b", "c"], 1, { a: SIGNAL + 200, b: SIGNAL + 205, c: SIGNAL + 400 }),
    );
    expect(verdict.losers).toEqual(["c"]);
    expect(verdict.safe).toEqual(["a", "b"]);
    expect(verdict.replay).toBeNull();
  });

  it("only those who could really be on either side of the line replay", () => {
    // 0, 10, 20 ms: a vs c is clear (20 > 16), so a is certainly not the slowest.
    const verdict = judgeFingerRound(
      race(["a", "b", "c"], 1, { a: SIGNAL + 300, b: SIGNAL + 310, c: SIGNAL + 320 }),
    );
    expect(verdict.safe).toEqual(["a"]);
    expect(verdict.tied).toEqual(["b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
  });

  it("a level pair that straddles two paying places keeps one place each side", () => {
    const verdict = judgeFingerRound(
      race(["a", "b", "c", "d"], 2, {
        a: SIGNAL + 200,
        b: SIGNAL + 300,
        c: SIGNAL + 308,
        d: SIGNAL + 600,
      }),
    );
    expect(verdict.losers).toEqual(["d"]);
    expect(verdict.safe).toEqual(["a"]);
    expect(verdict.tied).toEqual(["b", "c"]);
    expect(verdict.tiedSlots).toBe(1);
  });

  it("times each lift from „LOS!“", () => {
    let round = signalFingerRound(armed(["a", "b"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    expect(liftMs(round, "a")).toBe(200);
    expect(liftMs(round, "b")).toBeNull();
    round = fingerUp(round, pointerOf(round, "b"), SIGNAL + 260.4);
    expect(liftMs(round, "b")).toBe(260);
  });

  it("partitions the players and fills exactly the paying places, whatever the times", () => {
    const random = seeded(42);
    for (let trial = 0; trial < 2000; trial++) {
      const size = 2 + Math.floor(random() * 4);
      const contenders = Array.from({ length: size }, (_, index) => `p${index}`);
      const slots = 1 + Math.floor(random() * (size - 1));
      const lifts: Record<string, number> = {};
      for (const uid of contenders) {
        const roll = random();
        if (roll < 0.1) lifts[uid] = SIGNAL - 1 - Math.floor(random() * 2000);
        else if (roll < 0.95) lifts[uid] = SIGNAL + 150 + Math.floor(random() * 60);
      }
      const verdict = judgeFingerRound(race(contenders, slots, lifts));
      const everyone = [...verdict.losers, ...verdict.safe, ...verdict.tied].sort();
      expect(everyone).toEqual([...contenders].sort());
      expect(verdict.losers.length + verdict.tiedSlots).toBe(slots);
      if (verdict.tied.length > 0) {
        expect(verdict.tiedSlots).toBeGreaterThanOrEqual(1);
        expect(verdict.tiedSlots).toBeLessThan(verdict.tied.length);
      } else {
        expect(verdict.tiedSlots).toBe(0);
      }
      // Every safe player lifted certainly before every slow payer.
      const time = (uid: string) => lifts[uid] ?? Infinity;
      for (const safe of verdict.safe) {
        for (const loser of verdict.losers) {
          if (verdict.falseStarts.includes(loser)) continue;
          const gap = time(loser) - time(safe);
          expect(gap === Infinity || gap > FINGER_TIE_WINDOW_MS).toBe(true);
        }
      }
    }
  });

  it("never replays when every gap is clear", () => {
    const random = seeded(7);
    for (let trial = 0; trial < 500; trial++) {
      const size = 2 + Math.floor(random() * 4);
      const contenders = Array.from({ length: size }, (_, index) => `p${index}`);
      const slots = 1 + Math.floor(random() * (size - 1));
      const order = [...contenders].sort(() => random() - 0.5);
      const lifts = Object.fromEntries(
        order.map((uid, rank) => [uid, SIGNAL + 150 + rank * (FINGER_TIE_WINDOW_MS + 1)]),
      );
      const verdict = judgeFingerRound(race(contenders, slots, lifts));
      expect(verdict.replay).toBeNull();
      expect(verdict.losers).toEqual(order.slice(size - slots));
    }
  });
});

describe("pointercancel", () => {
  it("voids the race while armed — no false start, everyone plays again", () => {
    let round = armed(["a", "b", "c"], 1);
    round = fingerCancel(round, pointerOf(round, "b"));
    expect(round.phase).toBe("closed");
    expect(round.voided).toBe(true);
    expect(judgeFingerRound(round)).toEqual({
      losers: [],
      safe: [],
      tied: ["a", "b", "c"],
      tiedSlots: 1,
      falseStarts: [],
      replay: "voided",
    });
  });

  it("voids the race after „LOS!“ too, discarding the lifts so far", () => {
    let round = signalFingerRound(armed(["a", "b", "c"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    round = fingerCancel(round, pointerOf(round, "c"));
    const verdict = judgeFingerRound(round);
    expect(verdict.replay).toBe("voided");
    expect(verdict.tied).toEqual(["a", "b", "c"]);
  });

  it("keeps the false starts made before it", () => {
    let round = armed(["a", "b", "c", "d"], 2);
    round = fingerUp(round, pointerOf(round, "a"), 3000);
    round = fingerCancel(round, pointerOf(round, "c"));
    const verdict = judgeFingerRound(round);
    expect(verdict.losers).toEqual(["a"]);
    expect(verdict.tied).toEqual(["b", "c", "d"]);
    expect(verdict.tiedSlots).toBe(1);
    expect(verdict.replay).toBe("voided");
  });

  it("can't undo a round the false starts already decided", () => {
    let round = armed(["a", "b", "c"], 1);
    round = fingerUp(round, pointerOf(round, "a"), 3000);
    expect(falseStartsDecide(round)).toBe(true);
    round = fingerCancel(round, pointerOf(round, "b"));
    expect(judgeFingerRound(round).losers).toEqual(["a"]);
    expect(judgeFingerRound(round).replay).toBeNull();
  });

  it("changes nothing once the round is closed", () => {
    let round = closeFingerRound(signalFingerRound(armed(["a", "b"], 1), SIGNAL));
    round = fingerCancel(round, pointerOf(round, "a"));
    expect(round.voided).toBe(false);
  });
});

describe("settling a round early", () => {
  it("never while the fingers are still gathering, or in the quiet before „LOS!“", () => {
    let round = startFingerRound(["a", "b"], 1);
    expect(fingerRoundSettled(round, 99_999)).toBe(false);
    round = armed(["a", "b"], 1);
    expect(fingerRoundSettled(round, 99_999)).toBe(false);
  });

  it("once the false starts decide it, a moment after the deciding one", () => {
    let round = armed(["a", "b", "c"], 1);
    round = fingerUp(round, pointerOf(round, "b"), 3000);
    expect(fingerRoundSettled(round, 3000 + FINGER_SETTLE_MS - 1)).toBe(false);
    expect(fingerRoundSettled(round, 3000 + FINGER_SETTLE_MS)).toBe(true);
  });

  it("not on a false start that leaves paying places open", () => {
    let round = armed(["a", "b", "c"], 2);
    round = fingerUp(round, pointerOf(round, "b"), 3000);
    expect(fingerRoundSettled(round, 9000)).toBe(false);
  });

  it("as soon as every finger still down is certain to pay", () => {
    let round = signalFingerRound(armed(["a", "b", "c"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    // b and c are both still down: either of them may yet be the slower.
    expect(fingerRoundSettled(round, SIGNAL + 900)).toBe(false);
    round = fingerUp(round, pointerOf(round, "b"), SIGNAL + 250);
    // c could still draw level with b inside the tie window…
    expect(fingerRoundSettled(round, SIGNAL + 250 + FINGER_TIE_WINDOW_MS)).toBe(false);
    // …and after it, lifting can only make c slower.
    expect(fingerRoundSettled(round, SIGNAL + 250 + FINGER_TIE_WINDOW_MS + 1)).toBe(true);
    expect(judgeFingerRound(closeFingerRound(round)).losers).toEqual(["c"]);
  });

  it("right after the first lift when that already fills the paying places", () => {
    let round = signalFingerRound(armed(["a", "b", "c"], 2), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    expect(fingerRoundSettled(round, SIGNAL + 200 + FINGER_TIE_WINDOW_MS + 1)).toBe(true);
    const verdict = judgeFingerRound(closeFingerRound(round));
    expect(verdict.safe).toEqual(["a"]);
    expect([...verdict.losers].sort()).toEqual(["b", "c"]);
  });

  it("not while two fingers still down could end up on either side of the line", () => {
    let round = signalFingerRound(armed(["a", "b", "c", "d"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    round = fingerUp(round, pointerOf(round, "b"), SIGNAL + 230);
    expect(fingerRoundSettled(round, SIGNAL + 2000)).toBe(false);
  });

  it("with every finger up, once the last lift has had its tie window — even for a dead heat", () => {
    let round = signalFingerRound(armed(["a", "b"], 1), SIGNAL);
    round = fingerUp(round, pointerOf(round, "a"), SIGNAL + 200);
    round = fingerUp(round, pointerOf(round, "b"), SIGNAL + 210);
    expect(fingerRoundSettled(round, SIGNAL + 210 + FINGER_TIE_WINDOW_MS)).toBe(false);
    expect(fingerRoundSettled(round, SIGNAL + 210 + FINGER_TIE_WINDOW_MS + 1)).toBe(true);
    expect(judgeFingerRound(closeFingerRound(round)).replay).toBe("tooClose");
  });

  it("never for a round that is already closed", () => {
    let round = signalFingerRound(armed(["a", "b"], 1), SIGNAL);
    round = fingerCancel(round, pointerOf(round, "a"));
    expect(fingerRoundSettled(round, SIGNAL + 5000)).toBe(false);
  });

  it("a settled round's verdict is the one the remaining fingers can't change", () => {
    const random = seeded(99);
    let settled = 0;
    for (let trial = 0; trial < 500; trial++) {
      const size = 2 + Math.floor(random() * 4);
      const contenders = Array.from({ length: size }, (_, index) => `p${index}`);
      const slots = 1 + Math.floor(random() * (size - 1));
      // Everyone's eventual lift; some are still down at the moment we look.
      const finalLifts = Object.fromEntries(
        contenders.map((uid) => [uid, SIGNAL + 150 + Math.floor(random() * 400)]),
      );
      const now = SIGNAL + 150 + Math.floor(random() * 500);
      let round = signalFingerRound(armed(contenders, slots), SIGNAL);
      const seen = Object.entries(finalLifts)
        .filter(([, at]) => at < now)
        .sort(([, a], [, b]) => a - b);
      for (const [uid, at] of seen) round = fingerUp(round, pointerOf(round, uid), at);
      if (!fingerRoundSettled(round, now)) continue;
      settled += 1;
      const early = judgeFingerRound(closeFingerRound(round));
      const late = judgeFingerRound(race(contenders, slots, finalLifts));
      expect([...early.losers].sort()).toEqual([...late.losers].sort());
      expect([...early.safe].sort()).toEqual([...late.safe].sort());
      expect([...early.tied].sort()).toEqual([...late.tied].sort());
    }
    // Enough of the draws settle early for this to mean something.
    expect(settled).toBeGreaterThan(100);
  });
});

describe("standings", () => {
  it("runs from the fastest to the slowest across a tie-break", () => {
    let game = startFingerGame(["a", "b", "c", "d"], 2);
    game = recordFingerRound(
      game,
      race(["a", "b", "c", "d"], 2, {
        a: SIGNAL + 200,
        b: SIGNAL + 300,
        c: SIGNAL + 305,
        d: SIGNAL + 700,
      }),
    );
    game = recordFingerRound(game, race(["b", "c"], 1, { b: SIGNAL + 330, c: SIGNAL + 250 }));
    expect(fingerStandings(game)).toEqual([
      { uid: "a", pays: false, round: 0, falseStart: false, ms: 200 },
      { uid: "c", pays: false, round: 1, falseStart: false, ms: 250 },
      { uid: "b", pays: true, round: 1, falseStart: false, ms: 330 },
      { uid: "d", pays: true, round: 0, falseStart: false, ms: 700 },
    ]);
  });

  it("puts a false start behind the slow ones of its round", () => {
    let game = startFingerGame(["a", "b", "c", "d"], 2);
    game = recordFingerRound(
      game,
      race(["a", "b", "c", "d"], 2, { a: 4000, b: SIGNAL + 210, c: SIGNAL + 480, d: SIGNAL + 300 }),
    );
    expect(
      fingerStandings(game).map(({ uid, pays, falseStart }) => [uid, pays, falseStart]),
    ).toEqual([
      ["b", false, false],
      ["d", false, false],
      ["c", true, false],
      ["a", true, true],
    ]);
  });

  it("has no time for whoever a false-start round let go before „LOS!“", () => {
    let game = startFingerGame(["a", "b", "c"], 1);
    game = recordFingerRound(
      game,
      race(["a", "b", "c"], 1, { a: 3000, b: 3010 }, { signal: false }),
    );
    game = recordFingerRound(game, race(["a", "b"], 1, { a: SIGNAL + 240, b: SIGNAL + 280 }));
    expect(fingerStandings(game)).toEqual([
      { uid: "c", pays: false, round: 0, falseStart: false, ms: null },
      { uid: "a", pays: false, round: 1, falseStart: false, ms: 240 },
      { uid: "b", pays: true, round: 1, falseStart: false, ms: 280 },
    ]);
  });
});

describe("seats", () => {
  it("sits two players across the phone from each other, each face turned to its edge", () => {
    expect(fingerSeats(2)).toEqual([
      { x: 0.5, y: 0.83, rotate: 0 },
      { x: 0.5, y: 0.17, rotate: 180 },
    ]);
  });

  it("goes round clockwise from the bottom edge", () => {
    expect(fingerSeats(4).map((seat) => seat.rotate)).toEqual([0, 90, 180, -90]);
    const [bottom, left, top, right] = fingerSeats(4);
    expect(bottom.y).toBeGreaterThan(0.5);
    expect(left.x).toBeLessThan(0.5);
    expect(top.y).toBeLessThan(0.5);
    expect(right.x).toBeGreaterThan(0.5);
  });

  it("keeps 104 px circles apart and inside the smallest field a phone gets", () => {
    const [width, height, circle] = [343, 320, 104];
    for (let count = 2; count <= FINGER_MAX_PLAYERS; count++) {
      const seats = fingerSeats(count).map((seat) => ({ x: seat.x * width, y: seat.y * height }));
      for (const seat of seats) {
        expect(seat.x - circle / 2).toBeGreaterThanOrEqual(0);
        expect(seat.x + circle / 2).toBeLessThanOrEqual(width);
        expect(seat.y - circle / 2).toBeGreaterThanOrEqual(0);
        expect(seat.y + circle / 2).toBeLessThanOrEqual(height);
      }
      for (let i = 0; i < seats.length; i++) {
        for (let j = i + 1; j < seats.length; j++) {
          const gap = Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y);
          expect(gap).toBeGreaterThan(circle);
        }
      }
    }
  });
});

describe("a whole game", () => {
  function play(game: FingerGame, lifts: Record<string, number>, signal = true): FingerGame {
    const round = nextFingerRound(game);
    if (!round) throw new Error("game is over");
    return recordFingerRound(game, race(round.contenders, round.slots, lifts, { signal }));
  }

  it("clamps the payer count to the pool", () => {
    expect(startFingerGame(["a", "b"], 5).slots).toBe(1);
    expect(startFingerGame(["a", "b", "c"], 0).slots).toBe(1);
    expect(startFingerGame(["a", "b", "c"], 2.7).slots).toBe(2);
  });

  it("settles in one round when the line is clear", () => {
    const game = play(startFingerGame(["a", "b", "c"], 1), {
      a: SIGNAL + 200,
      b: SIGNAL + 500,
      c: SIGNAL + 300,
    });
    expect(isFingerGameOver(game)).toBe(true);
    expect(game.losers).toEqual(["b"]);
    expect(game.safe).toEqual(["a", "c"]);
    expect(nextFingerRound(game)).toBeNull();
  });

  it("plays a tie-break among only the tied players", () => {
    let game = startFingerGame(["a", "b", "c", "d"], 2);
    game = play(game, { a: SIGNAL + 200, b: SIGNAL + 300, c: SIGNAL + 305, d: SIGNAL + 700 });
    expect(isFingerGameOver(game)).toBe(false);
    expect(game.losers).toEqual(["d"]);
    expect(game.contenders).toEqual(["b", "c"]);
    expect(game.slots).toBe(1);

    game = play(game, { b: SIGNAL + 330, c: SIGNAL + 250 });
    expect(isFingerGameOver(game)).toBe(true);
    expect(game.losers).toEqual(["d", "b"]);
    expect(game.safe).toEqual(["a", "c"]);
    expect(game.rounds).toHaveLength(2);
  });

  it("replays false starters among themselves, the others already safe", () => {
    let game = startFingerGame(["a", "b", "c"], 1);
    game = play(game, { a: 3000, b: 3010 }, false);
    expect(game.safe).toEqual(["c"]);
    expect(game.contenders).toEqual(["a", "b"]);
    game = play(game, { a: SIGNAL + 240, b: SIGNAL + 280 });
    expect(game.losers).toEqual(["b"]);
    expect(isFingerGameOver(game)).toBe(true);
  });

  it("ignores a round that isn't closed or isn't the game's", () => {
    const game = startFingerGame(["a", "b", "c"], 1);
    expect(recordFingerRound(game, armed(["a", "b", "c"], 1))).toBe(game);
    expect(recordFingerRound(game, race(["a", "b"], 1, { a: SIGNAL + 1 }))).toBe(game);
    expect(recordFingerRound(game, race(["a", "b", "c"], 2, { a: SIGNAL + 1 }))).toBe(game);
  });

  it("says how each payer was caught", () => {
    let game = startFingerGame(["a", "b", "c", "d"], 2);
    game = play(game, { a: 4000, b: SIGNAL + 210, c: SIGNAL + 480, d: SIGNAL + 300 });
    expect(fingerCatch(game, "a")).toEqual({ kind: "falseStart" });
    expect(fingerCatch(game, "c")).toEqual({ kind: "slow", ms: 480 });
    expect(fingerCatch(game, "b")).toBeNull();

    let lazy = startFingerGame(["a", "b"], 1);
    lazy = play(lazy, { a: SIGNAL + 200 });
    expect(fingerCatch(lazy, "b")).toEqual({ kind: "slow", ms: null });
  });
});
