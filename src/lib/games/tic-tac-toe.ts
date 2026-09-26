/**
 * Pure Tic-Tac-Toe rules for the duel mini-game. A classic 3×3 game between
 * two people who both play well is a forced draw — but a knockout ladder
 * needs every match to produce a loser, so a draw always replays (see
 * `knockout-ladder.ts`'s `recordDraw`), and from the third attempt onward the
 * match switches to "vanishing" rules: once you have three marks on the
 * board, placing a fourth removes your oldest one first. That shrinks the
 * state space enough that two draws in a row essentially never happen again,
 * while staying pure skill — nothing here is randomized.
 */

export const TIC_TAC_TOE_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

/** A draw replays at attempt 1; a second draw (attempt 2) switches the match to vanishing rules. */
export const TIC_TAC_TOE_SUDDEN_DEATH_ATTEMPT = 2;
const VANISHING_MARK_LIMIT = 3;

export type TicTacToeCell = 0 | 1 | null;
export type TicTacToeVariant = "classic" | "vanishing";

/** Each player's occupied cell indices, oldest first — the mark that vanishes next is always `moves[player][0]`. */
export interface TicTacToeState {
  moves: [number[], number[]];
}

export const EMPTY_TIC_TAC_TOE_STATE: TicTacToeState = { moves: [[], []] };

export function ticTacToeVariantForAttempt(attempt: number): TicTacToeVariant {
  return attempt >= TIC_TAC_TOE_SUDDEN_DEATH_ATTEMPT ? "vanishing" : "classic";
}

export function ticTacToeCells(state: TicTacToeState): TicTacToeCell[] {
  const cells: TicTacToeCell[] = new Array(9).fill(null);
  state.moves[0].forEach((cell) => (cells[cell] = 0));
  state.moves[1].forEach((cell) => (cells[cell] = 1));
  return cells;
}

/** The cell that will disappear if this player places another mark under vanishing rules, or `null` if none would. */
export function ticTacToeNextToVanish(
  state: TicTacToeState,
  player: 0 | 1,
  variant: TicTacToeVariant,
): number | null {
  if (variant !== "vanishing") return null;
  const playerMoves = state.moves[player];
  return playerMoves.length >= VANISHING_MARK_LIMIT ? playerMoves[0] : null;
}

export function findTicTacToeWin(
  cells: TicTacToeCell[],
): { player: 0 | 1; line: readonly [number, number, number] } | null {
  for (const line of TIC_TAC_TOE_LINES) {
    const [a, b, c] = line;
    if (cells[a] !== null && cells[a] === cells[b] && cells[b] === cells[c]) {
      return { player: cells[a], line };
    }
  }
  return null;
}

export function isTicTacToeBoardFull(cells: TicTacToeCell[]): boolean {
  return cells.every((cell) => cell !== null);
}

function placeTicTacToeMark(
  state: TicTacToeState,
  player: 0 | 1,
  cell: number,
  variant: TicTacToeVariant,
): TicTacToeState {
  const moves: [number[], number[]] = [state.moves[0].slice(), state.moves[1].slice()];
  const playerMoves = moves[player];
  if (variant === "vanishing" && playerMoves.length >= VANISHING_MARK_LIMIT) {
    playerMoves.shift();
  }
  playerMoves.push(cell);
  return { moves };
}

export interface TicTacToeMoveResult {
  state: TicTacToeState;
  cells: TicTacToeCell[];
  winner: { player: 0 | 1; line: readonly [number, number, number] } | null;
  /** Always `false` under vanishing rules — at most 3+3 of 9 cells are ever occupied at once, so the board can't fill up. */
  draw: boolean;
}

/** Caller must check the cell is empty (`ticTacToeCells(state)[cell] === null`) before calling this. */
export function applyTicTacToeMove(
  state: TicTacToeState,
  player: 0 | 1,
  cell: number,
  variant: TicTacToeVariant,
): TicTacToeMoveResult {
  const nextState = placeTicTacToeMark(state, player, cell, variant);
  const cells = ticTacToeCells(nextState);
  const winner = findTicTacToeWin(cells);
  const draw = !winner && variant === "classic" && isTicTacToeBoardFull(cells);
  return { state: nextState, cells, winner, draw };
}
