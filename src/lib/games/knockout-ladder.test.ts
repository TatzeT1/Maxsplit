import { describe, expect, it } from "vitest";
import {
  IDLE_LADDER,
  clampDuelLoserCount,
  isLadderOver,
  maxDuelLoserCount,
  recordDraw,
  recordWin,
  startLadder,
} from "./knockout-ladder";

describe("maxDuelLoserCount / clampDuelLoserCount", () => {
  it("caps at pool size minus one, so at least one person stays unbeaten", () => {
    expect(maxDuelLoserCount(5)).toBe(4);
    expect(maxDuelLoserCount(2)).toBe(1);
    expect(maxDuelLoserCount(1)).toBe(1);
  });

  it("clamps a requested count into 1..max", () => {
    expect(clampDuelLoserCount(0, 5)).toBe(1);
    expect(clampDuelLoserCount(3, 5)).toBe(3);
    expect(clampDuelLoserCount(99, 5)).toBe(4);
  });
});

describe("startLadder", () => {
  it("stays idle for a pool smaller than 2", () => {
    expect(startLadder(["a"], 1)).toEqual(IDLE_LADDER);
    expect(startLadder([], 1)).toEqual(IDLE_LADDER);
  });

  it("pairs the first two of the order and queues the rest", () => {
    const state = startLadder(["a", "b", "c", "d"], 2);
    expect(state.current).toEqual({ key: "1:0", matchNumber: 1, attempt: 0, players: ["a", "b"] });
    expect(state.queue).toEqual(["c", "d"]);
    expect(state.losers).toEqual([]);
    expect(state.targetLoserCount).toBe(2);
  });
});

describe("a duel of exactly two", () => {
  it("ends the ladder after a single match", () => {
    const started = startLadder(["a", "b"], 1);
    const state = recordWin(started, "1:0", "a");
    expect(isLadderOver(state)).toBe(true);
    expect(state.current).toBeNull();
    expect(state.losers).toEqual(["b"]);
    expect(state.results).toEqual([{ matchNumber: 1, winnerUid: "a", loserUid: "b", attempts: 1 }]);
  });
});

describe("recordDraw", () => {
  it("replays the same match with swapped starters and a new key", () => {
    const started = startLadder(["a", "b"], 1);
    const replayed = recordDraw(started, "1:0");
    expect(replayed.current).toEqual({
      key: "1:1",
      matchNumber: 1,
      attempt: 1,
      players: ["b", "a"],
    });
    expect(replayed.losers).toEqual([]);
  });

  it("is a no-op for a stale key", () => {
    const started = startLadder(["a", "b"], 1);
    expect(recordDraw(started, "not-the-current-key")).toBe(started);
  });
});

describe("recordWin", () => {
  it("is a no-op for a stale key", () => {
    const started = startLadder(["a", "b"], 1);
    expect(recordWin(started, "not-the-current-key", "a")).toBe(started);
  });

  it("is a no-op when the reported winner isn't in the current match", () => {
    const started = startLadder(["a", "b", "c"], 2);
    expect(recordWin(started, "1:0", "c")).toBe(started);
  });

  it("advances the winner to face the next queued challenger", () => {
    const started = startLadder(["a", "b", "c", "d"], 2);
    const afterFirst = recordWin(started, "1:0", "a");
    expect(isLadderOver(afterFirst)).toBe(false);
    expect(afterFirst.losers).toEqual(["b"]);
    expect(afterFirst.queue).toEqual(["d"]);
    // The challenger (c) moves first against the player who stayed on (a).
    expect(afterFirst.current).toEqual({
      key: "2:0",
      matchNumber: 2,
      attempt: 0,
      players: ["c", "a"],
    });
  });

  it("runs a full ladder until the target loser count is reached", () => {
    let state = startLadder(["a", "b", "c", "d", "e"], 3);
    state = recordWin(state, state.current!.key, state.current!.players[0]); // a beats b
    state = recordWin(state, state.current!.key, state.current!.players[0]); // c beats a
    expect(isLadderOver(state)).toBe(false);
    expect(state.losers).toEqual(["b", "a"]);
    state = recordWin(state, state.current!.key, state.current!.players[0]); // d beats c
    expect(isLadderOver(state)).toBe(true);
    expect(state.current).toBeNull();
    expect(state.losers).toEqual(["b", "a", "c"]);
    expect(state.results).toHaveLength(3);
  });

  it("ends the ladder once the queue runs dry even under target (defensive: target is always <= poolSize - 1, so this shouldn't trigger in practice)", () => {
    let state = startLadder(["a", "b", "c"], 2);
    state = recordWin(state, state.current!.key, "a"); // b loses, c queued
    state = recordWin(state, state.current!.key, "a"); // c loses, queue empty
    expect(isLadderOver(state)).toBe(true);
    expect(state.losers).toEqual(["b", "c"]);
  });

  it("never lets a loser reappear as a current player", () => {
    // Target 3 of 5, so a `current` match still exists after two eliminations.
    let state = startLadder(["a", "b", "c", "d", "e"], 3);
    state = recordWin(state, state.current!.key, "a");
    state = recordWin(state, state.current!.key, "a");
    expect(state.current).not.toBeNull();
    for (const loser of state.losers) {
      expect(state.current!.players).not.toContain(loser);
    }
  });
});
