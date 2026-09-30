import { describe, expect, it } from "vitest";
import {
  DOTS_BOX_COUNT,
  DOTS_LINE_COUNT,
  EMPTY_DOTS_STATE,
  applyDotsMove,
  boxLines,
  boxesOfLine,
  dotsScore,
  horizontalLine,
  isDotsFinished,
  isValidDotsMove,
  lineGeometry,
  replayDots,
  verticalLine,
  type DotsState,
} from "./dots-and-boxes";

/** Tiny deterministic PRNG (mulberry32) so the playout tests never flake. */
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

describe("geometry", () => {
  it("numbers 12 horizontal then 12 vertical lines and 9 boxes", () => {
    expect(DOTS_LINE_COUNT).toBe(24);
    expect(DOTS_BOX_COUNT).toBe(9);
    expect(horizontalLine(0, 0)).toBe(0);
    expect(horizontalLine(3, 2)).toBe(11);
    expect(verticalLine(0, 0)).toBe(12);
    expect(verticalLine(2, 3)).toBe(23);
  });

  it("round-trips every line through lineGeometry", () => {
    for (let line = 0; line < DOTS_LINE_COUNT; line++) {
      const geometry = lineGeometry(line);
      const back =
        geometry.orientation === "h"
          ? horizontalLine(geometry.row, geometry.col)
          : verticalLine(geometry.row, geometry.col);
      expect(back).toBe(line);
    }
  });

  it("gives every box four distinct sides", () => {
    for (let box = 0; box < DOTS_BOX_COUNT; box++) {
      expect(new Set(boxLines(box)).size).toBe(4);
    }
  });

  it("agrees between boxLines and boxesOfLine, and each side borders one or two boxes", () => {
    for (let line = 0; line < DOTS_LINE_COUNT; line++) {
      const boxes = boxesOfLine(line);
      expect(boxes.length === 1 || boxes.length === 2).toBe(true);
      for (const box of boxes) expect(boxLines(box)).toContain(line);
    }
    for (let box = 0; box < DOTS_BOX_COUNT; box++) {
      for (const side of boxLines(box)) expect(boxesOfLine(side)).toContain(box);
    }
  });

  it("puts the outer frame on one box and the inner lines on two", () => {
    // 12 outer lines (the frame) border a single box, the other 12 sit between two.
    const single = Array.from({ length: DOTS_LINE_COUNT }, (_, line) => line).filter(
      (line) => boxesOfLine(line).length === 1,
    );
    expect(single).toHaveLength(12);
  });
});

describe("applyDotsMove", () => {
  it("passes the turn when no box is closed", () => {
    const result = applyDotsMove(EMPTY_DOTS_STATE, horizontalLine(0, 0), 0);
    expect(result.completed).toEqual([]);
    expect(result.extraTurn).toBe(false);
    expect(result.state.lines[horizontalLine(0, 0)]).toBe(0);
  });

  it("gives the box and another move for closing it", () => {
    let state: DotsState = EMPTY_DOTS_STATE;
    // Box 0 sides: top h(0,0), bottom h(1,0), left v(0,0), right v(0,1).
    state = applyDotsMove(state, horizontalLine(0, 0), 0).state;
    state = applyDotsMove(state, horizontalLine(1, 0), 1).state;
    state = applyDotsMove(state, verticalLine(0, 0), 0).state;
    const last = applyDotsMove(state, verticalLine(0, 1), 1);
    expect(last.completed).toEqual([0]);
    expect(last.extraTurn).toBe(true);
    expect(last.state.boxes[0]).toBe(1);
  });

  it("closes two boxes with one line", () => {
    let state: DotsState = EMPTY_DOTS_STATE;
    // Boxes 0 and 1 share v(0,1). Draw every other side of both first.
    const others = [
      horizontalLine(0, 0),
      horizontalLine(1, 0),
      verticalLine(0, 0),
      horizontalLine(0, 1),
      horizontalLine(1, 1),
      verticalLine(0, 2),
    ];
    for (const line of others) state = applyDotsMove(state, line, 0).state;
    const result = applyDotsMove(state, verticalLine(0, 1), 1);
    expect(result.completed.sort()).toEqual([0, 1]);
    expect(dotsScore(result.state)).toEqual([0, 2]);
  });

  it("refuses a line that is already drawn or does not exist", () => {
    const state = applyDotsMove(EMPTY_DOTS_STATE, 5, 0).state;
    expect(isValidDotsMove(state, 5)).toBe(false);
    expect(isValidDotsMove(state, -1)).toBe(false);
    expect(isValidDotsMove(state, 24)).toBe(false);
    expect(isValidDotsMove(state, 1.5)).toBe(false);
    expect(() => applyDotsMove(state, 5, 1)).toThrow();
  });
});

describe("full games", () => {
  function playRandomGame(seed: number) {
    const random = seeded(seed);
    const open = Array.from({ length: DOTS_LINE_COUNT }, (_, line) => line);
    const order: number[] = [];
    while (open.length > 0) {
      order.push(open.splice(Math.floor(random() * open.length), 1)[0]);
    }
    return order;
  }

  it("always ends after 24 lines with all nine boxes taken and a winner — never a tie", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const replay = replayDots(playRandomGame(seed));
      expect(isDotsFinished(replay.state)).toBe(true);
      expect(replay.finished).toBe(true);
      const [a, b] = dotsScore(replay.state);
      expect(a + b).toBe(DOTS_BOX_COUNT);
      expect(a).not.toBe(b);
      expect(replay.winner).toBe(a > b ? 0 : 1);
    }
  });

  it("keeps the turn exactly as long as boxes keep closing", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const order = playRandomGame(seed);
      let state: DotsState = EMPTY_DOTS_STATE;
      let turn: 0 | 1 = 0;
      order.forEach((line, index) => {
        const result = applyDotsMove(state, line, turn);
        const replayed = replayDots(order.slice(0, index + 1));
        state = result.state;
        const expectedNext: 0 | 1 = result.extraTurn ? turn : turn === 0 ? 1 : 0;
        if (!result.finished) expect(replayed.turn).toBe(expectedNext);
        turn = expectedNext;
      });
    }
  });

  it("skips a line that was already drawn instead of throwing", () => {
    const replay = replayDots([3, 3, 4]);
    expect(replay.state.lines[3]).toBe(0);
    expect(replay.state.lines[4]).toBe(1);
  });

  it("starts with player 0 to move and nobody ahead", () => {
    const replay = replayDots([]);
    expect(replay.turn).toBe(0);
    expect(replay.finished).toBe(false);
    expect(replay.winner).toBeNull();
    expect(replay.last).toBeNull();
    expect(dotsScore(replay.state)).toEqual([0, 0]);
  });
});
