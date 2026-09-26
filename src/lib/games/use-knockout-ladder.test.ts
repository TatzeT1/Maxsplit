import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/games/random", () => ({
  // Deterministic "shuffle" for the hook test — the pure ladder logic
  // already has its own randomness-free unit tests. `vi.mock` calls are
  // hoisted above this import by Vitest.
  secureShuffle: <T>(items: T[]) => [...items],
}));

import { useKnockoutLadder } from "./use-knockout-ladder";

describe("useKnockoutLadder", () => {
  it("starts idle", () => {
    const { result } = renderHook(() => useKnockoutLadder());
    expect(result.current.started).toBe(false);
    expect(result.current.current).toBeNull();
  });

  it("starts a ladder and resolves a two-player duel", () => {
    const { result } = renderHook(() => useKnockoutLadder());
    act(() => result.current.start(["a", "b"], 1));
    expect(result.current.current).toEqual({
      key: "1:0",
      matchNumber: 1,
      attempt: 0,
      players: ["a", "b"],
    });

    act(() => result.current.reportWin("1:0", "a"));
    expect(result.current.gameOver).toBe(true);
    expect(result.current.losers).toEqual(["b"]);
    expect(result.current.decidedCount).toBe(1);
  });

  it("advances through a knockout ladder for a bigger pool", () => {
    const { result } = renderHook(() => useKnockoutLadder());
    act(() => result.current.start(["a", "b", "c", "d"], 2));

    act(() => result.current.reportWin(result.current.current!.key, "a"));
    expect(result.current.gameOver).toBe(false);
    expect(result.current.current?.players).toEqual(["c", "a"]);

    act(() => result.current.reportWin(result.current.current!.key, "c"));
    expect(result.current.gameOver).toBe(true);
    expect(result.current.losers).toEqual(["b", "a"]);
  });

  it("replays a drawn match under a fresh key", () => {
    const { result } = renderHook(() => useKnockoutLadder());
    act(() => result.current.start(["a", "b"], 1));
    const firstKey = result.current.current!.key;

    act(() => result.current.reportDraw(firstKey));
    expect(result.current.current!.key).not.toBe(firstKey);
    expect(result.current.current!.players).toEqual(["b", "a"]);
    expect(result.current.gameOver).toBe(false);
  });

  it("resets back to idle", () => {
    const { result } = renderHook(() => useKnockoutLadder());
    act(() => result.current.start(["a", "b"], 1));
    act(() => result.current.reportWin(result.current.current!.key, "a"));
    act(() => result.current.reset());
    expect(result.current.started).toBe(false);
    expect(result.current.losers).toEqual([]);
  });
});
