import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  BOARD_WIDTH,
  ballFlight,
  boardHeight,
  halfSlotX,
  pegPositions,
  pegY,
  slotTop,
} from "./pegboard-layout";
import {
  PEGBOARD_MAX_SLOTS,
  PEGBOARD_MIN_SLOTS,
  pegboardRows,
  planBallPath,
  slotCentre,
} from "./pegboard";

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("board geometry", () => {
  it("spreads the slot centres evenly across the board width", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      expect(halfSlotX(0, slots)).toBe(0);
      expect(halfSlotX(2 * slots, slots)).toBeCloseTo(BOARD_WIDTH);
      const slotWidth = BOARD_WIDTH / slots;
      for (let slot = 0; slot < slots; slot++) {
        expect(halfSlotX(slotCentre(slot), slots)).toBeCloseTo(slotWidth * (slot + 0.5));
      }
    }
  });

  it("stacks the rows of pegs above the slots", () => {
    expect(pegY(1)).toBeGreaterThan(pegY(0));
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      const lastRow = pegboardRows(slots) - 1;
      expect(pegY(lastRow)).toBeLessThan(slotTop(slots));
      expect(boardHeight(slots)).toBeGreaterThan(slotTop(slots));
    }
  });

  it("puts a peg wherever the ball can be, on every row, and nowhere else", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      const pegs = pegPositions(slots);
      const has = (row: number, half: number) =>
        pegs.some((peg) => peg.row === row && peg.half === half);
      for (let target = 0; target < slots; target++) {
        const path = planBallPath({ slots, target, random: seeded(slots * 17 + target) });
        // The ball sits on a peg at every row but the last (the slot).
        for (let row = 0; row < pegboardRows(slots); row++) expect(has(row, path[row])).toBe(true);
      }
      for (const peg of pegs) {
        expect(peg.half).toBeGreaterThanOrEqual(1);
        expect(peg.half).toBeLessThanOrEqual(2 * slots - 1);
      }
    }
  });
});

describe("ballFlight", () => {
  it("has matching keyframes, strictly increasing times and one ease per segment", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      const path = planBallPath({ slots, target: slots - 1, random: seeded(slots) });
      const flight = ballFlight(path, slots);
      expect(flight.cx).toHaveLength(flight.cy.length);
      expect(flight.times).toHaveLength(flight.cx.length);
      expect(flight.ease).toHaveLength(flight.cx.length - 1);
      expect(flight.times[0]).toBe(0);
      expect(flight.times[flight.times.length - 1]).toBe(1);
      for (let i = 1; i < flight.times.length; i++) {
        expect(flight.times[i]).toBeGreaterThan(flight.times[i - 1]);
      }
    }
  });

  it("releases above the first peg and lands inside the target slot", () => {
    for (let slots = PEGBOARD_MIN_SLOTS; slots <= PEGBOARD_MAX_SLOTS; slots++) {
      for (let target = 0; target < slots; target++) {
        const path = planBallPath({ slots, target, random: seeded(slots * 31 + target) });
        const flight = ballFlight(path, slots);
        expect(flight.cy[0]).toBeLessThan(pegY(0));
        const landingX = flight.cx[flight.cx.length - 1];
        const slotWidth = BOARD_WIDTH / slots;
        expect(landingX).toBeGreaterThan(slotWidth * target);
        expect(landingX).toBeLessThan(slotWidth * (target + 1));
        const landingY = flight.cy[flight.cy.length - 1];
        expect(landingY).toBeGreaterThan(slotTop(slots));
        expect(landingY).toBeLessThan(boardHeight(slots) + BALL_RADIUS);
      }
    }
  });

  it("touches every peg row once, in order, before it lands", () => {
    const slots = 6;
    const path = planBallPath({ slots, target: 2, random: seeded(5) });
    const flight = ballFlight(path, slots);
    expect(flight.pegHitSec).toHaveLength(pegboardRows(slots));
    for (let i = 1; i < flight.pegHitSec.length; i++) {
      expect(flight.pegHitSec[i]).toBeGreaterThan(flight.pegHitSec[i - 1]);
    }
    expect(flight.pegHitSec[flight.pegHitSec.length - 1]).toBeLessThan(flight.landSec);
    expect(flight.landSec).toBe(flight.durationSec);
  });

  it("takes longer on a deeper board", () => {
    const shallow = ballFlight(planBallPath({ slots: 2, target: 0, random: seeded(1) }), 2);
    const deep = ballFlight(planBallPath({ slots: 12, target: 0, random: seeded(1) }), 12);
    expect(deep.durationSec).toBeGreaterThan(shallow.durationSec);
  });
});
