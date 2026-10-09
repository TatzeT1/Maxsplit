import { useEffect, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNow } from "@/lib/use-now";

const START = Date.UTC(2026, 9, 8, 12, 0, 0);

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  act(() => void document.dispatchEvent(new Event("visibilitychange")));
}

/** Runs the timers for `ms`; fake `Date` moves with them. */
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("starts at the clock and moves every interval while active", () => {
    const { result } = renderHook(() => useNow(1000, true));
    expect(result.current).toBe(START);

    advance(1000);
    expect(result.current).toBe(START + 1000);
    advance(3000);
    expect(result.current).toBe(START + 4000);
  });

  it("only re-renders on its own interval", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      return useNow(1000, true);
    });
    const afterMount = renders;

    advance(999);
    expect(renders).toBe(afterMount);
    advance(1);
    expect(renders).toBe(afterMount + 1);
  });

  it("follows the interval it was given", () => {
    const { result } = renderHook(() => useNow(15_000, true));
    advance(14_999);
    expect(result.current).toBe(START);
    advance(1);
    expect(result.current).toBe(START + 15_000);
  });

  it("runs no timer and stands still while inactive", () => {
    const { result } = renderHook(() => useNow(1000, false));
    expect(result.current).toBe(START);
    expect(vi.getTimerCount()).toBe(0);

    advance(60_000);
    expect(result.current).toBe(START);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops ticking, on the last reading, when it is switched off", () => {
    const { result, rerender } = renderHook(({ active }) => useNow(1000, active), {
      initialProps: { active: true },
    });
    advance(2000);
    expect(result.current).toBe(START + 2000);

    rerender({ active: false });
    expect(vi.getTimerCount()).toBe(0);
    advance(30_000);
    expect(result.current).toBe(START + 2000);
  });

  it("takes a fresh reading the moment it is switched on, not a full interval later", () => {
    const { result, rerender } = renderHook(({ active }) => useNow(1000, active), {
      initialProps: { active: false },
    });
    advance(45_000);
    expect(result.current).toBe(START);

    rerender({ active: true });
    expect(result.current).toBe(START + 45_000);
    advance(1000);
    expect(result.current).toBe(START + 46_000);
  });

  it("lets `active` depend on the clock itself, so it stops exactly when the time is up", () => {
    const closesAt = START + 3500;
    const { result } = renderHook(() => {
      // The page's own use: tick only while the deadline is still ahead.
      const [active, setActive] = useState(true);
      const now = useNow(1000, active);
      useEffect(() => {
        if (now >= closesAt) setActive(false);
      }, [now]);
      return now;
    });
    // One second at a time: React commits (and so switches `active` off)
    // between acts, not inside one long timer run.
    for (let i = 0; i < 10; i++) advance(1000);
    // Ticks at 1, 2, 3 s are before the deadline; the one at 4 s is the first
    // past it, and nothing runs after that.
    expect(result.current).toBe(START + 4000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restarts on a changed interval", () => {
    const { result, rerender } = renderHook(({ ms }) => useNow(ms, true), {
      initialProps: { ms: 1000 },
    });
    advance(1000);
    expect(result.current).toBe(START + 1000);

    // The new timer starts at t = 1000 s and is first due 5 s after that.
    rerender({ ms: 5000 });
    expect(vi.getTimerCount()).toBe(1);
    advance(4999);
    expect(result.current).toBe(START + 1000);
    advance(1);
    expect(result.current).toBe(START + 6000);
  });

  it("never spins on an interval that is not a positive number", () => {
    for (const ms of [0, -1000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { result, unmount } = renderHook(() => useNow(ms, true));
      expect(vi.getTimerCount()).toBe(0);
      advance(10_000);
      expect(result.current).toBe(START + 0);
      unmount();
      vi.setSystemTime(START);
    }
  });

  describe("while the tab is hidden", () => {
    it("stops its timer and stops re-rendering", () => {
      let renders = 0;
      const { result } = renderHook(() => {
        renders += 1;
        return useNow(1000, true);
      });
      advance(2000);
      expect(result.current).toBe(START + 2000);

      setVisibility("hidden");
      expect(vi.getTimerCount()).toBe(0);
      const before = renders;
      advance(60_000);
      expect(renders).toBe(before);
      expect(result.current).toBe(START + 2000);
    });

    it("catches up to the real clock the moment the tab is visible again, then carries on", () => {
      const { result } = renderHook(() => useNow(1000, true));
      advance(2000);
      setVisibility("hidden");
      advance(60_000);

      setVisibility("visible");
      expect(result.current).toBe(START + 62_000);
      expect(vi.getTimerCount()).toBe(1);

      advance(1000);
      expect(result.current).toBe(START + 63_000);
    });

    it("does not start a timer for a clock that mounts or switches on while hidden", () => {
      setVisibility("hidden");
      const { result, rerender } = renderHook(({ active }) => useNow(1000, active), {
        initialProps: { active: false },
      });
      rerender({ active: true });
      expect(vi.getTimerCount()).toBe(0);
      advance(10_000);
      expect(result.current).toBe(START);

      setVisibility("visible");
      expect(result.current).toBe(START + 10_000);
      expect(vi.getTimerCount()).toBe(1);
    });
  });

  it("clears its timer and its listener on unmount", () => {
    const removed = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useNow(1000, true));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
    expect(removed).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    removed.mockRestore();
  });

  it("does not keep a listener on the document while inactive", () => {
    const added = vi.spyOn(document, "addEventListener");
    renderHook(() => useNow(1000, false));
    expect(added).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    added.mockRestore();
  });
});
