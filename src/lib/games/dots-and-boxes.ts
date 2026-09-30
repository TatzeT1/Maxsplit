/**
 * Pure Käsekästchen (Dots and Boxes) rules for the duel mini-game. A 4×4 grid
 * of dots makes 3×3 boxes. Players alternately draw one line between two
 * neighbouring dots; whoever draws the fourth side of a box takes it and moves
 * again. When every line is drawn, more boxes wins.
 *
 * Nine boxes is an odd number, so the match can never end level — the same
 * trick Memory-Duell plays with its nine pairs — and `onDraw` is never needed.
 *
 * Lines are numbered 0..23: the twelve horizontal ones first (row by row),
 * then the twelve vertical ones (row by row). Boxes are numbered 0..8, row by
 * row. A match is stored online as the flat list of line numbers in the order
 * they were drawn (Firestore has no nested arrays) and replayed through here.
 */

/** Dots along each side. */
export const DOTS_SIZE = 4;
/** Boxes along each side. */
export const DOTS_BOXES_PER_SIDE = DOTS_SIZE - 1;

const HORIZONTAL_COUNT = DOTS_SIZE * DOTS_BOXES_PER_SIDE;
export const DOTS_LINE_COUNT = 2 * HORIZONTAL_COUNT;
export const DOTS_BOX_COUNT = DOTS_BOXES_PER_SIDE * DOTS_BOXES_PER_SIDE;

export type DotsOwner = 0 | 1 | null;

export interface DotsState {
  /** Per line: who drew it, or `null` while it is still open. */
  lines: readonly DotsOwner[];
  /** Per box: who closed it, or `null` while it is still open. */
  boxes: readonly DotsOwner[];
}

export const EMPTY_DOTS_STATE: DotsState = {
  lines: Array.from({ length: DOTS_LINE_COUNT }, () => null),
  boxes: Array.from({ length: DOTS_BOX_COUNT }, () => null),
};

/** `row` counts dot rows (0..3), `col` counts the gaps between dots in that row (0..2). */
export function horizontalLine(row: number, col: number): number {
  return row * DOTS_BOXES_PER_SIDE + col;
}

/** `row` counts the gaps between dot rows (0..2), `col` counts dot columns (0..3). */
export function verticalLine(row: number, col: number): number {
  return HORIZONTAL_COUNT + row * DOTS_SIZE + col;
}

export type DotsLineGeometry =
  { orientation: "h"; row: number; col: number } | { orientation: "v"; row: number; col: number };

export function lineGeometry(line: number): DotsLineGeometry {
  if (line < HORIZONTAL_COUNT) {
    return {
      orientation: "h",
      row: Math.floor(line / DOTS_BOXES_PER_SIDE),
      col: line % DOTS_BOXES_PER_SIDE,
    };
  }
  const index = line - HORIZONTAL_COUNT;
  return { orientation: "v", row: Math.floor(index / DOTS_SIZE), col: index % DOTS_SIZE };
}

/** The four sides of a box, as line numbers: top, bottom, left, right. */
export function boxLines(box: number): [number, number, number, number] {
  const row = Math.floor(box / DOTS_BOXES_PER_SIDE);
  const col = box % DOTS_BOXES_PER_SIDE;
  return [
    horizontalLine(row, col),
    horizontalLine(row + 1, col),
    verticalLine(row, col),
    verticalLine(row, col + 1),
  ];
}

/** The one or two boxes a line is a side of. */
export function boxesOfLine(line: number): number[] {
  const geometry = lineGeometry(line);
  const boxes: number[] = [];
  if (geometry.orientation === "h") {
    if (geometry.row > 0) boxes.push((geometry.row - 1) * DOTS_BOXES_PER_SIDE + geometry.col);
    if (geometry.row < DOTS_BOXES_PER_SIDE) {
      boxes.push(geometry.row * DOTS_BOXES_PER_SIDE + geometry.col);
    }
  } else {
    if (geometry.col > 0) boxes.push(geometry.row * DOTS_BOXES_PER_SIDE + geometry.col - 1);
    if (geometry.col < DOTS_BOXES_PER_SIDE) {
      boxes.push(geometry.row * DOTS_BOXES_PER_SIDE + geometry.col);
    }
  }
  return boxes;
}

export function isValidDotsMove(state: DotsState, line: number): boolean {
  return (
    Number.isInteger(line) && line >= 0 && line < DOTS_LINE_COUNT && state.lines[line] === null
  );
}

export function dotsScore(state: DotsState): [number, number] {
  const score: [number, number] = [0, 0];
  for (const owner of state.boxes) if (owner !== null) score[owner] += 1;
  return score;
}

export function isDotsFinished(state: DotsState): boolean {
  return state.lines.every((owner) => owner !== null);
}

export interface DotsMoveResult {
  state: DotsState;
  /** Boxes this line closed (0, 1 or 2). */
  completed: number[];
  /** True when the mover closed a box and the game goes on: they move again. */
  extraTurn: boolean;
  finished: boolean;
  /** Set once every line is drawn: the player with more boxes. */
  winner: 0 | 1 | null;
}

/** Caller must check `isValidDotsMove` first. */
export function applyDotsMove(state: DotsState, line: number, player: 0 | 1): DotsMoveResult {
  if (!isValidDotsMove(state, line)) throw new Error(`Invalid Dots and Boxes move: ${line}`);
  const lines = state.lines.map((owner, index) => (index === line ? player : owner));
  const boxes = [...state.boxes];
  const completed: number[] = [];
  for (const box of boxesOfLine(line)) {
    if (boxes[box] === null && boxLines(box).every((side) => lines[side] !== null)) {
      boxes[box] = player;
      completed.push(box);
    }
  }
  const next: DotsState = { lines, boxes };
  const finished = isDotsFinished(next);
  let winner: 0 | 1 | null = null;
  if (finished) {
    const [a, b] = dotsScore(next);
    winner = a > b ? 0 : 1;
  }
  return { state: next, completed, extraTurn: completed.length > 0 && !finished, finished, winner };
}

export interface DotsReplay {
  state: DotsState;
  /** Whose move it is next. */
  turn: 0 | 1;
  finished: boolean;
  winner: 0 | 1 | null;
  /** The most recent line, so the board can show what just happened. */
  last: { line: number; player: 0 | 1; completed: number[] } | null;
}

/** A match rebuilt from its flat list of drawn lines — `players[0]` moves first, extra turns included. */
export function replayDots(lines: readonly number[]): DotsReplay {
  let state = EMPTY_DOTS_STATE;
  let turn: 0 | 1 = 0;
  let finished = false;
  let winner: 0 | 1 | null = null;
  let last: DotsReplay["last"] = null;
  for (const line of lines) {
    // The server only stores moves it has validated; a bad one is skipped
    // rather than allowed to take the whole board down.
    if (!isValidDotsMove(state, line)) continue;
    const result = applyDotsMove(state, line, turn);
    state = result.state;
    finished = result.finished;
    winner = result.winner;
    last = { line, player: turn, completed: result.completed };
    if (!result.extraTurn) turn = turn === 0 ? 1 : 0;
  }
  return { state, turn, finished, winner, last };
}
