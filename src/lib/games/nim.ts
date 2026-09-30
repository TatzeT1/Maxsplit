/**
 * Pure Streichholz-Duell (Nim) rules for the duel mini-game. Rows of matches;
 * on your turn you take as many as you like from exactly one row; whoever
 * takes the very last match loses ("misère" Nim). Nobody can ever be stuck
 * and there is no draw, so a match always ends with a loser.
 *
 * The classic 1·3·5·7 layout is used. Two things keep it from being a solved
 * puzzle that only the initiated can play:
 *
 * - **The fuse.** Every move after the first is on a clock that gets shorter
 *   as the matches run out (`nimFuseSeconds`). When it burns down, one match
 *   is taken for the player who hesitated (`nimLateMove`).
 * - **The joker.** Each player may once skip a move instead of taking
 *   (`NIM_JOKERS`) — the opponent has to move. A skip is the only way to flip
 *   who ends up forced to take the last match, and nobody can tell when the
 *   other will spend it.
 *
 * With perfect play the *second* player still wins (the joker doesn't change
 * that — `nim.test.ts` proves it by brute force), which almost nobody at a
 * table knows, and the knockout ladder draws who moves first anyway (see
 * `knockout-ladder.ts`).
 *
 * A match is stored as a flat list of small integers (Firestore can't hold
 * nested arrays) that `replayNim` turns back into a position:
 *
 * - `0..31` — a take: `row * 8 + count`
 * - `32..63` — the same take, made by the fuse for a player who was too slow
 * - `100` — a joker
 */

export const NIM_START_ROWS: readonly number[] = [1, 3, 5, 7];

/** How many times each player may skip a move. */
export const NIM_JOKERS = 1;

/** The longest fuse, for a full board — and the shortest, however few matches are left. */
export const NIM_FUSE_MAX_SECONDS = 15;
export const NIM_FUSE_MIN_SECONDS = 6;

/** The most matches any row starts with — and so the most a single move can take. */
const NIM_MAX_TAKE = 7;
/** A take is stored as one small integer: `row * NIM_CODE_BASE + count`. */
const NIM_CODE_BASE = 8;
/** Added to a take's code when the fuse, not the player, made it. */
const NIM_LATE_OFFSET = 32;
/** The stored form of a joker. */
const NIM_SKIP_CODE = 100;

export type NimRows = readonly number[];

export function nimTotal(rows: NimRows): number {
  return rows.reduce((sum, count) => sum + count, 0);
}

export function isValidNimMove(rows: NimRows, row: number, count: number): boolean {
  if (!Number.isInteger(row) || row < 0 || row >= rows.length) return false;
  if (!Number.isInteger(count) || count < 1) return false;
  return count <= rows[row];
}

/** `late`: the move was made by the fuse for a player who took too long. */
export function encodeNimMove(row: number, count: number, late = false): number {
  return (late ? NIM_LATE_OFFSET : 0) + row * NIM_CODE_BASE + count;
}

export function encodeNimSkip(): number {
  return NIM_SKIP_CODE;
}

export type NimAction =
  { kind: "take"; row: number; count: number; late: boolean } | { kind: "skip" };

/** The inverse of `encodeNimMove` / `encodeNimSkip`, or `null` for a number no move could have produced. */
export function decodeNimAction(code: number): NimAction | null {
  if (!Number.isInteger(code) || code < 0) return null;
  if (code === NIM_SKIP_CODE) return { kind: "skip" };
  const late = code >= NIM_LATE_OFFSET && code < NIM_LATE_OFFSET * 2;
  const base = late ? code - NIM_LATE_OFFSET : code;
  if (base >= NIM_LATE_OFFSET) return null;
  const row = Math.floor(base / NIM_CODE_BASE);
  const count = base % NIM_CODE_BASE;
  if (row >= NIM_START_ROWS.length || count < 1 || count > NIM_MAX_TAKE) return null;
  return { kind: "take", row, count, late };
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

/**
 * How long a move may take: as long as the board is full, shorter with every
 * match that goes. The last few matches are played under the most pressure —
 * exactly when a slip costs the most.
 */
export function nimFuseSeconds(matchesLeft: number): number {
  return Math.min(NIM_FUSE_MAX_SECONDS, Math.max(NIM_FUSE_MIN_SECONDS, matchesLeft + 3));
}

/**
 * What a burnt fuse plays for the player on the move: a single match from a
 * random row that still has some. Deliberately mild — it is a nudge to be
 * quicker, not a way to lose a match on the spot — though it can still turn
 * a position, which is the point. `null` once the board is empty.
 */
export function nimLateMove(
  rows: NimRows,
  randomInt: (min: number, max: number) => number,
): { row: number; count: 1 } | null {
  const open = rows.flatMap((count, row) => (count > 0 ? [row] : []));
  if (open.length === 0) return null;
  return { row: open[randomInt(0, open.length - 1)], count: 1 };
}

/** The most recent move, so the board can show what just happened. */
export type NimLastMove =
  | { kind: "take"; row: number; count: number; player: 0 | 1; late: boolean }
  | { kind: "skip"; player: 0 | 1 };

export interface NimReplay {
  rows: NimRows;
  /** Whose move it is next; after the last match is gone, whoever would have been. */
  turn: 0 | 1;
  /** The jokers each player still holds. */
  jokers: readonly [number, number];
  loser: 0 | 1 | null;
  winner: 0 | 1 | null;
  last: NimLastMove | null;
  /** How many moves the replay actually played — entries it had to skip don't count. */
  moveCount: number;
}

/** Whether `player` may skip right now: the match is still on and they have a joker left. */
export function canNimSkip(replay: Pick<NimReplay, "turn" | "jokers" | "loser">, player: 0 | 1) {
  return replay.loser === null && replay.turn === player && replay.jokers[player] > 0;
}

/** A match rebuilt from its flat move list — players alternate, `players[0]` first. */
export function replayNim(moves: readonly number[]): NimReplay {
  let rows: NimRows = NIM_START_ROWS;
  let turn: 0 | 1 = 0;
  let jokers: [number, number] = [NIM_JOKERS, NIM_JOKERS];
  let loser: 0 | 1 | null = null;
  let last: NimLastMove | null = null;
  let moveCount = 0;
  for (const code of moves) {
    const action = decodeNimAction(code);
    // The server only stores moves it has validated; a bad one is skipped
    // rather than allowed to take the whole board down.
    if (!action || loser !== null) continue;
    if (action.kind === "skip") {
      if (jokers[turn] < 1) continue;
      jokers = turn === 0 ? [jokers[0] - 1, jokers[1]] : [jokers[0], jokers[1] - 1];
      last = { kind: "skip", player: turn };
    } else {
      if (!isValidNimMove(rows, action.row, action.count)) continue;
      const result = applyNimMove(rows, action.row, action.count, turn);
      rows = result.rows;
      last = {
        kind: "take",
        row: action.row,
        count: action.count,
        player: turn,
        late: action.late,
      };
      if (result.loser !== null) loser = result.loser;
    }
    moveCount++;
    turn = turn === 0 ? 1 : 0;
  }
  return {
    rows,
    turn,
    jokers,
    loser,
    winner: loser === null ? null : loser === 0 ? 1 : 0,
    last,
    moveCount,
  };
}
