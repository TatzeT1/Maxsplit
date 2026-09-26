/**
 * Pure Vier gewinnt (Connect Four) rules for the duel mini-game. A standard
 * 7×6 board; discs stack from the bottom of each column. A draw (all 42
 * slots filled with no line) is rare but possible, and — like Tic-Tac-Toe —
 * just replays via `knockout-ladder.ts`'s `recordDraw`.
 */

export const CF_COLUMNS = 7;
export const CF_ROWS = 6;

/** Each column bottom-to-top; index 0 is the bottom-most disc. */
export type ConnectFourBoard = readonly (0 | 1)[][];

export function emptyConnectFourBoard(): ConnectFourBoard {
  return Array.from({ length: CF_COLUMNS }, () => []);
}

export interface ConnectFourDrop {
  board: ConnectFourBoard;
  row: number;
}

/** `null` if the column is already full. */
export function dropConnectFourDisc(
  board: ConnectFourBoard,
  column: number,
  player: 0 | 1,
): ConnectFourDrop | null {
  const current = board[column];
  if (current.length >= CF_ROWS) return null;
  const row = current.length;
  const nextBoard = board.map((col, index) => (index === column ? [...col, player] : col));
  return { board: nextBoard, row };
}

function discAt(board: ConnectFourBoard, col: number, row: number): 0 | 1 | undefined {
  if (col < 0 || col >= CF_COLUMNS || row < 0) return undefined;
  return board[col][row];
}

const DIRECTIONS: readonly [number, number][] = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal /
  [1, -1], // diagonal \
];

/** Scans through the just-dropped disc at `(col, row)` in all four axes; returns the winning run (4+ coords) or `null`. */
export function findConnectFourWin(
  board: ConnectFourBoard,
  col: number,
  row: number,
): [number, number][] | null {
  const player = discAt(board, col, row);
  if (player === undefined) return null;

  for (const [dx, dy] of DIRECTIONS) {
    const run: [number, number][] = [[col, row]];
    for (const sign of [1, -1] as const) {
      let step = 1;
      while (discAt(board, col + dx * step * sign, row + dy * step * sign) === player) {
        run.push([col + dx * step * sign, row + dy * step * sign]);
        step += 1;
      }
    }
    if (run.length >= 4) return run;
  }
  return null;
}

export function isConnectFourFull(board: ConnectFourBoard): boolean {
  return board.every((column) => column.length >= CF_ROWS);
}

export interface ConnectFourMoveResult {
  board: ConnectFourBoard;
  row: number;
  winner: { player: 0 | 1; cells: [number, number][] } | null;
  draw: boolean;
}

/** Caller must check the column isn't full first (`board[column].length < CF_ROWS`). */
export function applyConnectFourMove(
  board: ConnectFourBoard,
  column: number,
  player: 0 | 1,
): ConnectFourMoveResult {
  const drop = dropConnectFourDisc(board, column, player);
  if (!drop) throw new Error(`Column ${column} is full`);
  const cells = findConnectFourWin(drop.board, column, drop.row);
  const winner = cells ? { player, cells } : null;
  const draw = !winner && isConnectFourFull(drop.board);
  return { board: drop.board, row: drop.row, winner, draw };
}
