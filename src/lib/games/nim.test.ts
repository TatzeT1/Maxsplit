import { describe, expect, it } from "vitest";
import {
  NIM_START_ROWS,
  applyNimMove,
  decodeNimMove,
  encodeNimMove,
  isValidNimMove,
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

describe("encodeNimMove / decodeNimMove", () => {
  it("round-trips every move the start position allows", () => {
    NIM_START_ROWS.forEach((size, row) => {
      for (let count = 1; count <= size; count++) {
        expect(decodeNimMove(encodeNimMove(row, count))).toEqual({ row, count });
      }
    });
  });

  it("refuses numbers no move could have produced", () => {
    expect(decodeNimMove(-1)).toBeNull();
    expect(decodeNimMove(0)).toBeNull(); // row 0, count 0
    expect(decodeNimMove(1.5)).toBeNull();
    expect(decodeNimMove(4 * 8 + 1)).toBeNull(); // row 4 doesn't exist
  });
});

describe("replayNim", () => {
  it("alternates turns starting with player 0", () => {
    expect(replayNim([]).turn).toBe(0);
    const afterOne = replayNim([encodeNimMove(3, 2)]);
    expect(afterOne.turn).toBe(1);
    expect([...afterOne.rows]).toEqual([1, 3, 5, 5]);
    expect(afterOne.last).toEqual({ row: 3, count: 2, player: 0 });
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
  });
});

describe("the start position", () => {
  // Brute force over every reachable position (at most 2·4·6·8 of them):
  // can the player to move force the opponent to take the last match?
  const memo = new Map<string, boolean>();
  function toMoveWins(rows: NimRows): boolean {
    if (nimTotal(rows) === 0) return true; // the previous player just lost
    const key = rows.join(",");
    const known = memo.get(key);
    if (known !== undefined) return known;
    let wins = false;
    outer: for (let row = 0; row < rows.length; row++) {
      for (let count = 1; count <= rows[row]; count++) {
        if (!toMoveWins(applyNimMove(rows, row, count, 0).rows)) {
          wins = true;
          break outer;
        }
      }
    }
    memo.set(key, wins);
    return wins;
  }

  it("is won by the second player with perfect play", () => {
    expect(toMoveWins(NIM_START_ROWS)).toBe(false);
  });

  it("is won by the player to move after a single careless opening move", () => {
    expect(toMoveWins(applyNimMove(NIM_START_ROWS, 3, 1, 0).rows)).toBe(true);
  });
});
