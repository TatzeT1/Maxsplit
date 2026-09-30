import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTurnFuse } from "./use-turn-fuse";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("useTurnFuse", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("starts full and burns down while it runs", () => {
    const { result } = renderHook(() => useTurnFuse({ seconds: 10, running: true, resetKey: 1 }));
    expect(result.current.remainingMs).toBe(10_000);
    expect(result.current.fraction).toBe(1);

    advance(4_000);
    expect(result.current.remainingMs).toBeGreaterThan(5_500);
    expect(result.current.remainingMs).toBeLessThan(6_500);
    expect(result.current.fraction).toBeCloseTo(0.6, 1);
    expect(result.current.burnt).toBe(false);
  });

  it("calls onBurnt exactly once when the time is up", () => {
    const onBurnt = vi.fn();
    const { result } = renderHook(() =>
      useTurnFuse({ seconds: 3, running: true, resetKey: "a", onBurnt }),
    );
    advance(2_000);
    expect(onBurnt).not.toHaveBeenCalled();

    advance(3_000);
    expect(result.current.burnt).toBe(true);
    expect(result.current.remainingMs).toBe(0);
    expect(result.current.fraction).toBe(0);
    expect(onBurnt).toHaveBeenCalledTimes(1);

    advance(5_000);
    expect(onBurnt).toHaveBeenCalledTimes(1);
  });

  it("stands still while it is not running, and carries on where it stopped", () => {
    const { result, rerender } = renderHook(
      ({ running }) => useTurnFuse({ seconds: 10, running, resetKey: 1 }),
      { initialProps: { running: false } },
    );
    advance(8_000);
    expect(result.current.remainingMs).toBe(10_000);

    rerender({ running: true });
    advance(3_000);
    const afterThree = result.current.remainingMs;
    expect(afterThree).toBeLessThan(7_500);

    rerender({ running: false });
    advance(8_000);
    expect(result.current.remainingMs).toBe(afterThree);
  });

  it("starts over for a new turn", () => {
    const { result, rerender } = renderHook(
      ({ turn }) => useTurnFuse({ seconds: 10, running: true, resetKey: turn }),
      { initialProps: { turn: 1 } },
    );
    advance(6_000);
    expect(result.current.remainingMs).toBeLessThan(4_500);

    rerender({ turn: 2 });
    expect(result.current.remainingMs).toBe(10_000);
    expect(result.current.burnt).toBe(false);
  });

  it("burns again for the next turn after one has run out", () => {
    const onBurnt = vi.fn();
    const { rerender } = renderHook(
      ({ turn }) => useTurnFuse({ seconds: 2, running: true, resetKey: turn, onBurnt }),
      { initialProps: { turn: 1 } },
    );
    advance(3_000);
    expect(onBurnt).toHaveBeenCalledTimes(1);

    rerender({ turn: 2 });
    advance(3_000);
    expect(onBurnt).toHaveBeenCalledTimes(2);
  });

  it("does not count time while the page is hidden", () => {
    const { result } = renderHook(() => useTurnFuse({ seconds: 10, running: true, resetKey: 1 }));
    advance(2_000);
    const before = result.current.remainingMs;

    setVisibility("hidden");
    advance(30_000);
    expect(result.current.remainingMs).toBe(before);
    expect(result.current.burnt).toBe(false);

    setVisibility("visible");
    advance(1_000);
    expect(result.current.remainingMs).toBeLessThan(before);
  });

  it("follows a changed length without resetting", () => {
    const { result, rerender } = renderHook(
      ({ seconds }) => useTurnFuse({ seconds, running: true, resetKey: 1 }),
      { initialProps: { seconds: 10 } },
    );
    advance(4_000);
    rerender({ seconds: 6 });
    expect(result.current.remainingMs).toBeLessThan(2_500);
  });
});
