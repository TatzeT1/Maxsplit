import { describe, expect, it } from "vitest";
import { NUDGE_AFTER_MS, NUDGE_COOLDOWN_MS, nudgeAllowedFrom, waitingOn } from "@/lib/games/nudge";

describe("waitingOn", () => {
  it("is the other player when it's their move", () => {
    // One mark down: player 1 is to move.
    expect(waitingOn({ gameId: "tictactoe", moves: [4] }, 0)).toBe(1);
    expect(waitingOn({ gameId: "tictactoe", moves: [4] }, 1)).toBeNull();
    expect(waitingOn({ gameId: "connectfour", columns: [] }, 1)).toBe(0);
  });

  it("is whoever hasn't locked in a hand yet", () => {
    const state = {
      gameId: "rps" as const,
      rounds: [],
      locked: [true, false] as [boolean, boolean],
    };
    expect(waitingOn(state, 0)).toBe(1);
    expect(waitingOn(state, 1)).toBeNull();
    expect(waitingOn({ ...state, locked: [false, false] }, 0)).toBeNull();
  });

  it("is whoever isn't ready, or hasn't reported a reaction yet", () => {
    const base = {
      gameId: "reaction" as const,
      ready: [true, false] as [boolean, boolean],
      signalDelayMs: null,
      results: [null, null] as [null, null],
    };
    expect(waitingOn(base, 0)).toBe(1);
    expect(waitingOn(base, 1)).toBeNull();
    expect(
      waitingOn(
        {
          ...base,
          ready: [true, true],
          signalDelayMs: 2000,
          results: [{ kind: "time", ms: 240 }, null],
        },
        0,
      ),
    ).toBe(1);
  });
});

describe("nudgeAllowedFrom", () => {
  const board = "2026-10-03T12:00:00.000Z";

  it("waits for a quiet board first", () => {
    expect(nudgeAllowedFrom(board, null)).toBe(Date.parse(board) + NUDGE_AFTER_MS);
  });

  it("then for the last nudge to sink in", () => {
    const nudged = "2026-10-03T12:05:00.000Z";
    expect(nudgeAllowedFrom(board, nudged)).toBe(Date.parse(nudged) + NUDGE_COOLDOWN_MS);
  });
});
