/**
 * Pure Streichholz-Duell (Nim) rules for the duel mini-game. Rows of matches;
 * on your turn you take as many as you like from exactly one row; whoever
 * takes the very last match loses ("misère" Nim). Nobody can ever be stuck
 * and there is no draw, so a match always ends with a loser.
 *
 * The classic 1·3·5·7 layout is used. With perfect play the *second* player
 * wins it — which almost nobody at a table knows, and the knockout ladder
 * draws who moves first anyway (see `knockout-ladder.ts`).
 */

export const NIM_START_ROWS: readonly number[] = [1, 3, 5, 7];

/** The most matches any row starts with — and so the most a single move can take. */
const NIM_MAX_TAKE = 7;
/** Moves are stored as one small integer each: `row * NIM_CODE_BASE + count`. */
const NIM_CODE_BASE = 8;

export type NimRows = readonly number[];

export function nimTotal(rows: NimRows): number {
  return rows.reduce((sum, count) => sum + count, 0);
}

export function isValidNimMove(rows: NimRows, row: number, count: number): boolean {
  if (!Number.isInteger(row) || row < 0 || row >= rows.length) return false;
  if (!Number.isInteger(count) || count < 1) return false;
  return count <= rows[row];
}

export function encodeNimMove(row: number, count: number): number {
  return row * NIM_CODE_BASE + count;
}

/** The inverse of `encodeNimMove`, or `null` for a number no move could have produced. */
export function decodeNimMove(code: number): { row: number; count: number } | null {
  if (!Number.isInteger(code) || code < 0) return null;
  const row = Math.floor(code / NIM_CODE_BASE);
  const count = code % NIM_CODE_BASE;
  if (row >= NIM_START_ROWS.length || count < 1 || count > NIM_MAX_TAKE) return null;
  return { row, count };
}

export interface NimMoveResult {
  rows: NimRows;
  /** The player who just took the last match, if this move did — they lose. */
  loser: 0 | 1 | null;
}

/** Caller must check `isValidNimMove` first. */
export function applyNimMove(
  rows: NimRows,
  row: number,
  count: number,
  player: 0 | 1,
): NimMoveResult {
  if (!isValidNimMove(rows, row, count)) throw new Error(`Invalid Nim move: ${row}/${count}`);
  const next = rows.map((matches, index) => (index === row ? matches - count : matches));
  return { rows: next, loser: nimTotal(next) === 0 ? player : null };
}

export interface NimReplay {
  rows: NimRows;
  /** Whose move it is next; after the last match is gone, whoever would have been. */
  turn: 0 | 1;
  loser: 0 | 1 | null;
  winner: 0 | 1 | null;
  /** The most recent move, so the board can show what was just taken. */
  last: { row: number; count: number; player: 0 | 1 } | null;
}

/** A match rebuilt from its flat move list — players alternate, `players[0]` first. */
export function replayNim(moves: readonly number[]): NimReplay {
  let rows: NimRows = NIM_START_ROWS;
  let turn: 0 | 1 = 0;
  let loser: 0 | 1 | null = null;
  let last: NimReplay["last"] = null;
  for (const code of moves) {
    const move = decodeNimMove(code);
    // The server only stores moves it has validated; a bad one is skipped
    // rather than allowed to take the whole board down.
    if (!move || !isValidNimMove(rows, move.row, move.count)) continue;
    const result = applyNimMove(rows, move.row, move.count, turn);
    rows = result.rows;
    last = { row: move.row, count: move.count, player: turn };
    if (result.loser !== null) loser = result.loser;
    turn = turn === 0 ? 1 : 0;
  }
  return {
    rows,
    turn,
    loser,
    winner: loser === null ? null : loser === 0 ? 1 : 0,
    last,
  };
}
