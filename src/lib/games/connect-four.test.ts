import { describe, expect, it } from "vitest";
import {
  CF_COLUMNS,
  CF_ROWS,
  applyConnectFourMove,
  dropConnectFourDisc,
  emptyConnectFourBoard,
  findConnectFourWin,
  isConnectFourFull,
  type ConnectFourBoard,
} from "./connect-four";

describe("dropConnectFourDisc", () => {
  it("stacks discs bottom-up in a column", () => {
    let board = emptyConnectFourBoard();
    const first = dropConnectFourDisc(board, 3, 0)!;
    expect(first.row).toBe(0);
    board = first.board;
    const second = dropConnectFourDisc(board, 3, 1)!;
    expect(second.row).toBe(1);
    expect(second.board[3]).toEqual([0, 1]);
  });

  it("returns null once the column is full", () => {
    let board = emptyConnectFourBoard();
    for (let i = 0; i < CF_ROWS; i++) {
      board = dropConnectFourDisc(board, 0, (i % 2) as 0 | 1)!.board;
    }
    expect(dropConnectFourDisc(board, 0, 0)).toBeNull();
  });
});

describe("findConnectFourWin", () => {
  it("finds a horizontal win", () => {
    let board: ConnectFourBoard = emptyConnectFourBoard();
    for (const col of [0, 1, 2, 3]) board = dropConnectFourDisc(board, col, 0)!.board;
    expect(findConnectFourWin(board, 3, 0)).toEqual([
      [3, 0],
      [2, 0],
      [1, 0],
      [0, 0],
    ]);
  });

  it("finds a vertical win", () => {
    let board: ConnectFourBoard = emptyConnectFourBoard();
    for (let i = 0; i < 4; i++) board = dropConnectFourDisc(board, 2, 0)!.board;
    expect(findConnectFourWin(board, 2, 3)).toHaveLength(4);
  });

  it("finds a rising diagonal win", () => {
    let board: ConnectFourBoard = emptyConnectFourBoard();
    // Build a staircase so player 0 gets discs at (0,0),(1,1),(2,2),(3,3).
    board = dropConnectFourDisc(board, 0, 0)!.board; // (0,0) p0
    board = dropConnectFourDisc(board, 1, 1)!.board; // (1,0) p1
    board = dropConnectFourDisc(board, 1, 0)!.board; // (1,1) p0
    board = dropConnectFourDisc(board, 2, 1)!.board; // (2,0) p1
    board = dropConnectFourDisc(board, 2, 1)!.board; // (2,1) p1
    board = dropConnectFourDisc(board, 2, 0)!.board; // (2,2) p0
    board = dropConnectFourDisc(board, 3, 1)!.board; // (3,0) p1
    board = dropConnectFourDisc(board, 3, 1)!.board; // (3,1) p1
    board = dropConnectFourDisc(board, 3, 1)!.board; // (3,2) p1
    board = dropConnectFourDisc(board, 3, 0)!.board; // (3,3) p0
    expect(findConnectFourWin(board, 3, 3)).toEqual([
      [3, 3],
      [2, 2],
      [1, 1],
      [0, 0],
    ]);
  });

  it("finds no win with only three in a row", () => {
    let board: ConnectFourBoard = emptyConnectFourBoard();
    for (const col of [0, 1, 2]) board = dropConnectFourDisc(board, col, 0)!.board;
    expect(findConnectFourWin(board, 2, 0)).toBeNull();
  });
});

describe("isConnectFourFull / applyConnectFourMove", () => {
  // A full 7x6 board, verified by exhaustive check to contain no
  // four-in-a-row for either player in any direction.
  const DRAW_BOARD: ConnectFourBoard = [
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [1, 1, 1, 0, 1, 1],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0, 0],
  ];

  it("recognizes a full board as full and finds no win anywhere on it", () => {
    expect(isConnectFourFull(DRAW_BOARD)).toBe(true);
    for (let col = 0; col < CF_COLUMNS; col++) {
      for (let row = 0; row < CF_ROWS; row++) {
        expect(findConnectFourWin(DRAW_BOARD, col, row)).toBeNull();
      }
    }
  });

  it("reports a draw for the move that fills the last empty slot", () => {
    const almostFull = DRAW_BOARD.map((column, index) =>
      index === 6 ? column.slice(0, 5) : column,
    );
    const result = applyConnectFourMove(almostFull, 6, DRAW_BOARD[6][5]);
    expect(result.winner).toBeNull();
    expect(result.draw).toBe(true);
    expect(isConnectFourFull(result.board)).toBe(true);
  });

  it("throws when applying a move to a full column", () => {
    let board = emptyConnectFourBoard();
    for (let i = 0; i < CF_ROWS; i++) board = dropConnectFourDisc(board, 0, 0)!.board;
    expect(() => applyConnectFourMove(board, 0, 1)).toThrow();
  });
});
