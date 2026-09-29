import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSyncMarks,
  readSyncMark,
  useCurrentScreenSync,
  useScreenSync,
} from "@/lib/offline/sync-marks";

describe("sync marks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00.000Z"));
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has no mark for a screen that was never live on this device", () => {
    const { result } = renderHook(() => useScreenSync("u1:group:g1", false));
    expect(result.current).toBeNull();
    expect(readSyncMark("u1:group:g1")).toBeNull();
  });

  it("marks a live screen, keeps the mark fresh, and closes it when the data stops being live", () => {
    const { result, rerender } = renderHook(({ live }) => useScreenSync("u1:group:g1", live), {
      initialProps: { live: true },
    });
    const start = Date.parse("2026-09-29T12:00:00.000Z");
    expect(result.current).toBe(start);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(start + 30_000);

    // Offline at 12:00:45: the copy on screen was live until exactly then.
    act(() => {
      vi.setSystemTime(start + 45_000);
    });
    rerender({ live: false });
    expect(result.current).toBe(start + 45_000);

    // Nothing moves while offline.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current).toBe(start + 45_000);
  });

  it("keeps screens, and users, apart", () => {
    renderHook(() => useScreenSync("u1:group:g1", true));
    expect(readSyncMark("u1:group:g1")).not.toBeNull();
    expect(readSyncMark("u1:group:g2")).toBeNull();
    expect(readSyncMark("u2:group:g1")).toBeNull();
  });

  it("tells the banner which screen is showing and how old its copy is", () => {
    const banner = renderHook(() => useCurrentScreenSync());
    expect(banner.result.current).toBeNull();

    const screen = renderHook(({ live }) => useScreenSync("u1:groups", live), {
      initialProps: { live: true },
    });
    expect(banner.result.current).toEqual({
      live: true,
      syncedAt: Date.parse("2026-09-29T12:00:00.000Z"),
    });

    screen.rerender({ live: false });
    expect(banner.result.current?.live).toBe(false);

    screen.unmount();
    expect(banner.result.current).toBeNull();
  });

  it("clears only its own keys", () => {
    localStorage.setItem("theme", "dark");
    renderHook(() => useScreenSync("u1:groups", true));
    clearSyncMarks();
    expect(readSyncMark("u1:groups")).toBeNull();
    expect(localStorage.getItem("theme")).toBe("dark");
  });
});
