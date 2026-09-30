import { describe, expect, it } from "vitest";
import {
  NIM_FUSE_MAX_SECONDS,
  NIM_FUSE_MIN_SECONDS,
  NIM_JOKERS,
  NIM_START_ROWS,
  applyNimMove,
  canNimSkip,
  decodeNimAction,
  encodeNimMove,
  encodeNimSkip,
  isValidNimMove,
  nimFuseSeconds,
  nimLateMove,
  nimTotal,
  replayNim,
  type NimRows,
} from "./nim";

describe("isValidNimMove / applyNimMove", () => {
  it("starts from the classic 1·3·5·7", () => {
    expect([...NIM_START_ROWS]).toEqual([1, 3, 5, 7]);
    expect(nimTotal(NIM_START_ROWS)).toBe(16);
  });

  it("takes matches from exactly one row", () => {
    const result = applyNimMove(NIM_START_ROWS, 3, 4, 0);
    expect([...result.rows]).toEqual([1, 3, 5, 3]);
    expect(result.loser).toBeNull();
  });

  it("rejects empty, oversized, fractional and out-of-range moves", () => {
    expect(isValidNimMove(NIM_START_ROWS, 0, 0)).toBe(false);
    expect(isValidNimMove(NIM_START_ROWS, 0, 2)).toBe(false);
    expect(isValidNimMove(NIM_START_ROWS, 1, 1.5)).toBe(false);
    expect(isValidNimMove(NIM_START_ROWS, -1, 1)).toBe(false);
    expect(isValidNimMove(NIM_START_ROWS, 4, 1)).toBe(false);
    expect(isValidNimMove(NIM_START_ROWS, 3, 7)).toBe(true);
  });

  it("throws when a move is applied without checking it first", () => {
    expect(() => applyNimMove(NIM_START_ROWS, 0, 2, 0)).toThrow();
  });

  it("makes whoever takes the very last match the loser", () => {
    const almostDone: NimRows = [0, 0, 0, 2];
    expect(applyNimMove(almostDone, 3, 1, 1).loser).toBeNull();
    expect(applyNimMove(almostDone, 3, 2, 1).loser).toBe(1);
    expect(applyNimMove([0, 0, 1, 0], 2, 1, 0).loser).toBe(0);
  });
});

describe("encodeNimMove / decodeNimAction", () => {
  it("round-trips every move the start position allows, made by hand or by the fuse", () => {
    NIM_START_ROWS.forEach((size, row) => {
      for (let count = 1; count <= size; count++) {
        expect(decodeNimAction(encodeNimMove(row, count))).toEqual({
          kind: "take",
          row,
          count,
          late: false,
        });
        expect(decodeNimAction(encodeNimMove(row, count, true))).toEqual({
          kind: "take",
          row,
          count,
          late: true,
        });
      }
    });
  });

  it("round-trips a joker", () => {
    expect(decodeNimAction(encodeNimSkip())).toEqual({ kind: "skip" });
  });

  it("refuses numbers no move could have produced", () => {
    expect(decodeNimAction(-1)).toBeNull();
    expect(decodeNimAction(0)).toBeNull(); // row 0, count 0
    expect(decodeNimAction(1.5)).toBeNull();
    expect(decodeNimAction(32)).toBeNull(); // a late take of nothing
    expect(decodeNimAction(64)).toBeNull();
    expect(decodeNimAction(99)).toBeNull();
    expect(decodeNimAction(101)).toBeNull();
    expect(decodeNimAction(Number.NaN)).toBeNull();
  });

  it("keeps hand-made and late takes apart from the joker", () => {
    const codes = new Set<number>([encodeNimSkip()]);
    NIM_START_ROWS.forEach((size, row) => {
      for (let count = 1; count <= size; count++) {
        codes.add(encodeNimMove(row, count));
        codes.add(encodeNimMove(row, count, true));
      }
    });
    // 16 distinct takes, each in two flavours, plus the joker.
    expect(codes.size).toBe(16 * 2 + 1);
  });
});

describe("the fuse", () => {
  it("is longest on a full board and never shorter than the floor", () => {
    expect(nimFuseSeconds(16)).toBe(NIM_FUSE_MAX_SECONDS);
    expect(nimFuseSeconds(12)).toBe(NIM_FUSE_MAX_SECONDS);
    expect(nimFuseSeconds(3)).toBe(NIM_FUSE_MIN_SECONDS);
    expect(nimFuseSeconds(1)).toBe(NIM_FUSE_MIN_SECONDS);
    expect(nimFuseSeconds(0)).toBe(NIM_FUSE_MIN_SECONDS);
  });

  it("only ever gets shorter as matches go", () => {
    let previous = Infinity;
    for (let left = 16; left >= 0; left--) {
      const seconds = nimFuseSeconds(left);
      expect(seconds).toBeLessThanOrEqual(previous);
      previous = seconds;
    }
    expect(nimFuseSeconds(8)).toBeLessThan(nimFuseSeconds(16));
  });

  it("plays one match from a random open row when it burns down", () => {
    const rows: NimRows = [0, 3, 0, 7];
    // The injected draw picks an index among the *open* rows only.
    expect(nimLateMove(rows, (min) => min)).toEqual({ row: 1, count: 1 });
    expect(nimLateMove(rows, (_min, max) => max)).toEqual({ row: 3, count: 1 });
    // A move it produces is always legal.
    for (const pick of [0, 1]) {
      const move = nimLateMove(rows, () => pick)!;
      expect(isValidNimMove(rows, move.row, move.count)).toBe(true);
    }
  });

  it("has nothing to play on an empty board", () => {
    expect(nimLateMove([0, 0, 0, 0], () => 0)).toBeNull();
  });
});

describe("replayNim", () => {
  it("alternates turns starting with player 0", () => {
    expect(replayNim([]).turn).toBe(0);
    const afterOne = replayNim([encodeNimMove(3, 2)]);
    expect(afterOne.turn).toBe(1);
    expect([...afterOne.rows]).toEqual([1, 3, 5, 5]);
    expect(afterOne.last).toEqual({ kind: "take", row: 3, count: 2, player: 0, late: false });
    expect(afterOne.moveCount).toBe(1);
    expect(afterOne.loser).toBeNull();
    expect(afterOne.winner).toBeNull();
  });

  it("names the loser and winner when the last match goes", () => {
    // Player 0 takes 1+3+5 (rows 0..2), player 1 a whole row of 7, then it is
    // player 0's move with nothing left — so build a real finish instead.
    const moves = [
      encodeNimMove(0, 1), // p0
      encodeNimMove(1, 3), // p1
      encodeNimMove(2, 5), // p0
      encodeNimMove(3, 6), // p1 leaves one match
      encodeNimMove(3, 1), // p0 is forced to take the last one
    ];
    const replay = replayNim(moves);
    expect(nimTotal(replay.rows)).toBe(0);
    expect(replay.loser).toBe(0);
    expect(replay.winner).toBe(1);
  });

  it("skips a move the rules would never have allowed instead of throwing", () => {
    const replay = replayNim([encodeNimMove(0, 3), encodeNimMove(3, 1)]);
    expect([...replay.rows]).toEqual([1, 3, 5, 6]);
    expect(replay.turn).toBe(1);
    expect(replay.moveCount).toBe(1);
  });

  it("remembers that the fuse, not the player, made a move", () => {
    const replay = replayNim([encodeNimMove(2, 1, true)]);
    expect(replay.last).toEqual({ kind: "take", row: 2, count: 1, player: 0, late: true });
    expect([...replay.rows]).toEqual([1, 3, 4, 7]);
  });

  it("spends a joker: nothing is taken and the other player is on the move", () => {
    const start = replayNim([]);
    expect(start.jokers).toEqual([NIM_JOKERS, NIM_JOKERS]);
    expect(canNimSkip(start, 0)).toBe(true);
    expect(canNimSkip(start, 1)).toBe(false); // not their move

    const skipped = replayNim([encodeNimSkip()]);
    expect([...skipped.rows]).toEqual([...NIM_START_ROWS]);
    expect(skipped.turn).toBe(1);
    expect(skipped.jokers).toEqual([NIM_JOKERS - 1, NIM_JOKERS]);
    expect(skipped.last).toEqual({ kind: "skip", player: 0 });
    expect(skipped.moveCount).toBe(1);
    expect(canNimSkip(skipped, 1)).toBe(true);
  });

  it("gives each player exactly their own joker", () => {
    // p0 skips, p1 skips back, p0 is on the move again with no joker left.
    const replay = replayNim([encodeNimSkip(), encodeNimSkip()]);
    expect(replay.jokers).toEqual([0, 0]);
    expect(replay.turn).toBe(0);
    expect(canNimSkip(replay, 0)).toBe(false);
  });

  it("ignores a second joker from the same player", () => {
    // p0 skips, p1 takes, p0 tries to skip again: nothing happens, it is still p0's move.
    const replay = replayNim([encodeNimSkip(), encodeNimMove(0, 1), encodeNimSkip()]);
    expect(replay.turn).toBe(0);
    expect(replay.jokers).toEqual([0, NIM_JOKERS]);
    expect(replay.moveCount).toBe(2);
  });

  it("lets a joker turn a forced last match into the other player's loss", () => {
    const moves = [
      encodeNimMove(0, 1), // p0
      encodeNimMove(1, 3), // p1
      encodeNimMove(2, 5), // p0
      encodeNimMove(3, 6), // p1 leaves one match — p0 would have to take it
      encodeNimSkip(), // p0 uses the joker
      encodeNimMove(3, 1), // p1 is forced to take the last one
    ];
    const replay = replayNim(moves);
    expect(replay.loser).toBe(1);
    expect(replay.winner).toBe(0);
  });

  it("does not let anything happen after the last match", () => {
    const finished = [
      encodeNimMove(0, 1),
      encodeNimMove(1, 3),
      encodeNimMove(2, 5),
      encodeNimMove(3, 6),
      encodeNimMove(3, 1),
    ];
    const replay = replayNim([...finished, encodeNimSkip()]);
    expect(replay.loser).toBe(0);
    expect(replay.moveCount).toBe(finished.length);
    expect(canNimSkip(replay, replay.turn)).toBe(false);
  });
});

describe("the start position", () => {
  // Brute force over every reachable position — at most 2·4·6·8 board states
  // times the jokers left: can the player to move force the other to take the
  // last match?
  const memo = new Map<string, boolean>();
  function moverWins(rows: NimRows, jokersMover: number, jokersOther: number): boolean {
    if (nimTotal(rows) === 0) return true; // the previous player just lost
    const key = `${rows.join(",")}|${jokersMover}|${jokersOther}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let wins = false;
    outer: for (let row = 0; row < rows.length; row++) {
      for (let count = 1; count <= rows[row]; count++) {
        if (!moverWins(applyNimMove(rows, row, count, 0).rows, jokersOther, jokersMover)) {
          wins = true;
          break outer;
        }
      }
    }
    // A joker hands the other player the same position.
    if (!wins && jokersMover > 0 && !moverWins(rows, jokersOther, jokersMover - 1)) wins = true;
    memo.set(key, wins);
    return wins;
  }

  it("is won by the second player with perfect play, jokers or not", () => {
    expect(moverWins(NIM_START_ROWS, 0, 0)).toBe(false);
    expect(moverWins(NIM_START_ROWS, NIM_JOKERS, NIM_JOKERS)).toBe(false);
  });

  it("has no winning opening for the first player — not even skipping", () => {
    NIM_START_ROWS.forEach((size, row) => {
      for (let count = 1; count <= size; count++) {
        const after = applyNimMove(NIM_START_ROWS, row, count, 0).rows;
        expect(moverWins(after, NIM_JOKERS, NIM_JOKERS)).toBe(true);
      }
    });
    // Skipping doesn't help: the other player then starts with the last joker.
    expect(moverWins(NIM_START_ROWS, NIM_JOKERS, NIM_JOKERS - 1)).toBe(true);
  });

  it("is won by the player to move after a single careless opening move", () => {
    const careless = applyNimMove(NIM_START_ROWS, 3, 1, 0).rows;
    expect(moverWins(careless, NIM_JOKERS, NIM_JOKERS)).toBe(true);
  });

  it("makes an unspent joker worth a whole game against someone without one", () => {
    expect(moverWins(NIM_START_ROWS, NIM_JOKERS, 0)).toBe(true);
    expect(moverWins(NIM_START_ROWS, 0, NIM_JOKERS)).toBe(false);
  });

  it("ends in a joker duel over the very last match: the last joker wins it", () => {
    const lastMatch: NimRows = [1, 0, 0, 0];
    expect(moverWins(lastMatch, 0, 0)).toBe(false); // forced to take it
    expect(moverWins(lastMatch, 1, 0)).toBe(true); // skip — the other must take it
    expect(moverWins(lastMatch, 1, 1)).toBe(false); // skip, they skip back, forced
    expect(moverWins(lastMatch, 0, 1)).toBe(false);
  });
});
