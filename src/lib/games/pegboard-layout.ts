/**
 * Where the Kugelfall ball is drawn, turning `planBallPath`'s half-slot
 * positions into the screen coordinates and timing the board animates along.
 * Pure geometry in SVG units (the board is a fixed-width viewBox that scales
 * with its container), so it can be tested without a browser.
 */
import { pegboardRows } from "@/lib/games/pegboard";

export const BOARD_WIDTH = 300;
export const PEG_RADIUS = 3.5;
export const BALL_RADIUS = 7;
/** Vertical distance between two rows of pegs. */
export const ROW_GAP = 20;
/** Space above the first row of pegs, where the ball is released. */
export const TOP_PAD = 34;
/** Height of the row of slots under the last peg row. */
export const SLOT_HEIGHT = 56;

export function boardHeight(slotCount: number): number {
  return TOP_PAD + pegboardRows(slotCount) * ROW_GAP + SLOT_HEIGHT;
}

/** Horizontal screen position of a half-slot column. */
export function halfSlotX(half: number, slotCount: number): number {
  return (half * BOARD_WIDTH) / (2 * slotCount);
}

/** Vertical position of the pegs in peg row `row` (0-based). */
export function pegY(row: number): number {
  return TOP_PAD + row * ROW_GAP;
}

/** Top edge of the row of slots. */
export function slotTop(slotCount: number): number {
  return TOP_PAD + pegboardRows(slotCount) * ROW_GAP;
}

export interface PegPosition {
  row: number;
  half: number;
}

/**
 * Every peg on the board. A row's pegs sit at the half-slot columns the ball
 * can be at when it reaches that row: slot centres (odd) on even rows, the
 * gaps between slots (even) on odd rows, never on the walls.
 */
export function pegPositions(slotCount: number): PegPosition[] {
  const pegs: PegPosition[] = [];
  const rows = pegboardRows(slotCount);
  for (let row = 0; row < rows; row++) {
    const parity = row % 2 === 0 ? 1 : 0;
    for (let half = 1; half <= 2 * slotCount - 1; half++) {
      if (half % 2 === parity) pegs.push({ row, half });
    }
  }
  return pegs;
}

export interface BallFlight {
  cx: number[];
  cy: number[];
  /** Animation progress (0..1) of each keyframe, strictly increasing. */
  times: number[];
  /** Easing of each segment between keyframes: `keyframes - 1` entries. */
  ease: ("easeIn" | "easeOut")[];
  /** Total flight time in seconds. */
  durationSec: number;
  /** Seconds after release at which the ball touches peg `i`, for the click sounds. */
  pegHitSec: number[];
  /** Seconds after release at which the ball lands in its slot. */
  landSec: number;
}

/**
 * Keyframes for a ball following `path` (from `planBallPath`): released above
 * the first peg, it touches each peg, hops to the next one and finally drops
 * into its slot. The last two rows are slower so the ball seems to hesitate
 * over the neighbouring slots before it settles.
 */
export function ballFlight(path: readonly number[], slotCount: number): BallFlight {
  const rows = pegboardRows(slotCount);
  const restOnPeg = (row: number) => pegY(row) - PEG_RADIUS - BALL_RADIUS;
  const x = (index: number) => halfSlotX(path[index], slotCount);

  const cx = [x(0)];
  const cy = [pegY(0) - 28];
  const ease: BallFlight["ease"] = [];
  const hopSeconds: number[] = [0.42]; // the first drop onto the top peg

  cx.push(x(0));
  cy.push(restOnPeg(0));
  ease.push("easeIn");

  for (let row = 0; row < rows; row++) {
    const slow = row >= rows - 2;
    const hop = slow ? 0.5 : 0.3;
    // Up from the peg and sideways, then down onto the next peg (or the slot).
    cx.push((x(row) + x(row + 1)) / 2);
    cy.push(restOnPeg(row) - 7);
    ease.push("easeOut");
    hopSeconds.push(hop * 0.4);
    cx.push(x(row + 1));
    cy.push(row === rows - 1 ? slotTop(slotCount) + SLOT_HEIGHT * 0.45 : restOnPeg(row + 1));
    ease.push("easeIn");
    hopSeconds.push(hop * 0.6);
  }

  const cumulative: number[] = [0];
  for (const seconds of hopSeconds) cumulative.push(cumulative[cumulative.length - 1] + seconds);
  const durationSec = cumulative[cumulative.length - 1];
  const times = cumulative.map((seconds) => seconds / durationSec);

  // Keyframe layout: [release, peg 0, (apex, peg 1)…, (apex, slot)]. Peg i is
  // keyframe 1 + 2i; the landing is the last one.
  const pegHitSec = Array.from({ length: rows }, (_, row) => cumulative[1 + 2 * row]);
  return { cx, cy, times, ease, durationSec, pegHitSec, landSec: durationSec };
}
