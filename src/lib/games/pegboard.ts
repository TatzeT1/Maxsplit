/**
 * Pure Kugelfall (pegboard) planning for the luck mini-game. The result is
 * decided *first* — `useSequentialDraw` fixes who pays, and so which slot the
 * ball must land in — and this module only invents a believable way down:
 * a random walk through the pegs that is forced to end in exactly that slot.
 * The path cannot change the result, only how it feels on the way.
 *
 * Positions are counted in half slots across the board, so a ball that sits in
 * the middle of slot `n` is at `2n + 1` and one balanced on a peg between two
 * slots is at an even number. Every row the ball drops one peg and shifts by
 * exactly half a slot to either side; the walls stop it leaving the board.
 */

export const PEGBOARD_MIN_SLOTS = 2;
/** More slots than this and the labels no longer fit across a phone. */
export const PEGBOARD_MAX_SLOTS = 12;

/**
 * How many peg rows the ball drops through. Always even (the ball starts and
 * ends at a slot centre, and each row flips that parity) and deep enough that
 * any slot is reachable from the start.
 */
export function pegboardRows(slotCount: number): number {
  return Math.max(8, 2 * Math.ceil(slotCount / 2) + 2);
}

/** Half-slot position of the ball's release point: the middle-most slot. */
export function pegboardStart(slotCount: number): number {
  return 2 * Math.floor((slotCount - 1) / 2) + 1;
}

export function slotCentre(slot: number): number {
  return 2 * slot + 1;
}

/**
 * The ball's half-slot position at the release point and after each peg row:
 * `pegboardRows(slots) + 1` values, the first `pegboardStart(slots)` and the
 * last `slotCentre(target)`. `random` returns a number in `[0, 1)` and only
 * picks between the two ways the ball could bounce when both still lead home.
 */
export function planBallPath(input: {
  slots: number;
  target: number;
  random: () => number;
}): number[] {
  const { slots, target, random } = input;
  if (!Number.isInteger(slots) || slots < PEGBOARD_MIN_SLOTS) {
    throw new Error(`A pegboard needs at least ${PEGBOARD_MIN_SLOTS} slots`);
  }
  if (!Number.isInteger(target) || target < 0 || target >= slots) {
    throw new Error(`Slot ${target} is not on a ${slots}-slot board`);
  }

  const rows = pegboardRows(slots);
  const goal = slotCentre(target);
  const leftWall = 1;
  const rightWall = 2 * slots - 1;
  const path = [pegboardStart(slots)];

  for (let row = 0; row < rows; row++) {
    const position = path[row];
    const stepsLeft = rows - row;
    // A move is fine if it stays on the board and the goal is still in reach
    // of the steps that remain.
    const canGoLeft = position - 1 >= leftWall && Math.abs(goal - (position - 1)) <= stepsLeft - 1;
    const canGoRight =
      position + 1 <= rightWall && Math.abs(goal - (position + 1)) <= stepsLeft - 1;
    let goRight: boolean;
    if (canGoLeft && canGoRight) goRight = random() >= 0.5;
    else if (canGoRight) goRight = true;
    else if (canGoLeft) goRight = false;
    else throw new Error("Pegboard path got stuck"); // unreachable: see pegboardRows
    path.push(position + (goRight ? 1 : -1));
  }
  return path;
}
