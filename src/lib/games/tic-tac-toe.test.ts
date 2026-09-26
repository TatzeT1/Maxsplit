import { describe, expect, it } from "vitest";
import {
  EMPTY_TIC_TAC_TOE_STATE,
  applyTicTacToeMove,
  findTicTacToeWin,
  isTicTacToeBoardFull,
  ticTacToeCells,
  ticTacToeNextToVanish,
  ticTacToeVariantForAttempt,
  type TicTacToeState,
} from "./tic-tac-toe";

describe("ticTacToeVariantForAttempt", () => {
  it("is classic for the first two attempts and vanishing from the third", () => {
    expect(ticTacToeVariantForAttempt(0)).toBe("classic");
    expect(ticTacToeVariantForAttempt(1)).toBe("classic");
    expect(ticTacToeVariantForAttempt(2)).toBe("vanishing");
    expect(ticTacToeVariantForAttempt(5)).toBe("vanishing");
  });
});

describe("findTicTacToeWin", () => {
  it("finds no win on an empty board", () => {
    expect(findTicTacToeWin(ticTacToeCells(EMPTY_TIC_TAC_TOE_STATE))).toBeNull();
  });

  it("finds a row win", () => {
    const state: TicTacToeState = {
      moves: [
        [0, 1, 2],
        [3, 4],
      ],
    };
    const win = findTicTacToeWin(ticTacToeCells(state));
    expect(win).toEqual({ player: 0, line: [0, 1, 2] });
  });

  it("finds a diagonal win", () => {
    const state: TicTacToeState = {
      moves: [
        [0, 4, 8],
        [1, 2],
      ],
    };
    expect(findTicTacToeWin(ticTacToeCells(state))?.line).toEqual([0, 4, 8]);
  });
});

describe("applyTicTacToeMove — classic", () => {
  it("places a mark and reports no winner or draw mid-game", () => {
    const result = applyTicTacToeMove(EMPTY_TIC_TAC_TOE_STATE, 0, 4, "classic");
    expect(result.cells[4]).toBe(0);
    expect(result.winner).toBeNull();
    expect(result.draw).toBe(false);
  });

  it("detects a win the move it completes", () => {
    const state: TicTacToeState = {
      moves: [
        [0, 1],
        [3, 4],
      ],
    };
    const result = applyTicTacToeMove(state, 0, 2, "classic");
    expect(result.winner).toEqual({ player: 0, line: [0, 1, 2] });
    expect(result.draw).toBe(false);
  });

  it("detects a full-board draw", () => {
    // X: 0,1,5,6,8  O: 2,3,4,7 — full board, no line for either player.
    const state: TicTacToeState = {
      moves: [
        [0, 1, 5, 6],
        [2, 3, 4, 7],
      ],
    };
    const result = applyTicTacToeMove(state, 0, 8, "classic");
    expect(result.winner).toBeNull();
    expect(isTicTacToeBoardFull(result.cells)).toBe(true);
    expect(result.draw).toBe(true);
  });
});

describe("applyTicTacToeMove — vanishing", () => {
  it("removes the player's oldest mark once they place a fourth", () => {
    const state: TicTacToeState = {
      moves: [
        [0, 1, 2],
        [3, 4],
      ],
    };
    const result = applyTicTacToeMove(state, 0, 5, "vanishing");
    // Cell 0 (the oldest X) is gone; the new mark at 5 is present.
    expect(result.state.moves[0]).toEqual([1, 2, 5]);
    expect(result.cells[0]).toBeNull();
    expect(result.cells[5]).toBe(0);
  });

  it("never reports a draw, since the board can't fill up", () => {
    const state: TicTacToeState = {
      moves: [
        [0, 1, 2],
        [3, 4],
      ],
    };
    const result = applyTicTacToeMove(state, 0, 5, "vanishing");
    expect(result.draw).toBe(false);
  });
});

describe("ticTacToeNextToVanish", () => {
  it("is null under classic rules", () => {
    const state: TicTacToeState = { moves: [[0, 1, 2], []] };
    expect(ticTacToeNextToVanish(state, 0, "classic")).toBeNull();
  });

  it("is null with fewer than three marks", () => {
    const state: TicTacToeState = { moves: [[0, 1], []] };
    expect(ticTacToeNextToVanish(state, 0, "vanishing")).toBeNull();
  });

  it("names the oldest mark once a player has three", () => {
    const state: TicTacToeState = { moves: [[0, 1, 2], []] };
    expect(ticTacToeNextToVanish(state, 0, "vanishing")).toBe(0);
  });
});
