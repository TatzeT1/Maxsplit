import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Next = (snapshot: unknown) => void;
type Fail = (error: { code: string }) => void;
interface Listener {
  path: string[];
  options: unknown;
  next: Next;
  fail: Fail;
  unsubscribe: ReturnType<typeof vi.fn>;
}

const h = vi.hoisted(() => ({
  listeners: [] as Listener[],
  user: { uid: "lea" } as { uid: string } | null,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path }),
  onSnapshot: (ref: { path: string[] }, options: unknown, next: Next, fail: Fail) => {
    const unsubscribe = vi.fn();
    h.listeners.push({ path: ref.path, options, next, fail, unsubscribe });
    return unsubscribe;
  },
}));
vi.mock("@/lib/firebase/client", () => ({ db: {} }));
vi.mock("@/lib/firebase/use-current-user", () => ({ useCurrentUser: () => h.user }));

import { useDeadlineNow, useEstimateRound } from "./use-estimate-round";

function snap(data: object | null, fromCache: boolean, id = "r1") {
  return {
    id,
    exists: () => data !== null,
    data: () => data,
    metadata: { fromCache },
  };
}

const latest = () => h.listeners[h.listeners.length - 1];

describe("useEstimateRound", () => {
  beforeEach(() => {
    h.listeners.length = 0;
    h.user = { uid: "lea" };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("subscribes to the round document with metadata changes and is not received yet", () => {
    const { result } = renderHook(() => useEstimateRound("g1", "r1"));
    expect(latest().path).toEqual(["groups", "g1", "estimateRounds", "r1"]);
    expect(latest().options).toEqual({ includeMetadataChanges: true });
    expect(result.current).toMatchObject({
      round: null,
      received: false,
      missing: false,
      cachedEmpty: false,
      errorCode: null,
    });
  });

  it("does not subscribe without a user or without a round id", () => {
    h.user = null;
    renderHook(() => useEstimateRound("g1", "r1"));
    expect(h.listeners).toHaveLength(0);
    h.user = { uid: "lea" };
    renderHook(() => useEstimateRound("g1", null));
    expect(h.listeners).toHaveLength(0);
  });

  it("returns the round with its id and the cache state", () => {
    const { result } = renderHook(() => useEstimateRound("g1", "r1"));
    act(() => latest().next(snap({ status: "running", stages: [] }, true)));
    expect(result.current.round).toMatchObject({ id: "r1", status: "running" });
    expect(result.current).toMatchObject({ received: true, fromCache: true, missing: false });
    act(() => latest().next(snap({ status: "running", stages: [] }, false)));
    expect(result.current.fromCache).toBe(false);
  });

  it("tells a cache without a copy (cachedEmpty) from a document the server says is absent (missing)", () => {
    const { result } = renderHook(() => useEstimateRound("g1", "r1"));
    act(() => latest().next(snap(null, true)));
    expect(result.current).toMatchObject({
      received: true,
      cachedEmpty: true,
      missing: false,
      round: null,
      fromCache: true,
    });
    act(() => latest().next(snap(null, false)));
    expect(result.current).toMatchObject({ received: true, cachedEmpty: false, missing: true });
    // The round appears later: both flags clear.
    act(() => latest().next(snap({ status: "running" }, false)));
    expect(result.current).toMatchObject({ cachedEmpty: false, missing: false });
    expect(result.current.round).not.toBeNull();
  });

  it("surfaces a listener error with its code, reports it, and never calls it loading", () => {
    const { result } = renderHook(() => useEstimateRound("g1", "r1"));
    act(() => latest().fail({ code: "permission-denied" }));
    expect(result.current.errorCode).toBe("permission-denied");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("estimate-round listener failed: permission-denied"),
      expect.anything(),
    );
  });

  it("starts clean when the round id changes and unsubscribes the old listener", () => {
    const { result, rerender } = renderHook(
      ({ roundId }: { roundId: string }) => useEstimateRound("g1", roundId),
      { initialProps: { roundId: "r1" } },
    );
    const first = latest();
    act(() => first.next(snap({ status: "running" }, false)));
    expect(result.current.round).not.toBeNull();
    rerender({ roundId: "r2" });
    expect(first.unsubscribe).toHaveBeenCalled();
    expect(result.current).toMatchObject({ round: null, received: false });
    expect(latest().path[3]).toBe("r2");
  });

  it("feeds every snapshot's metadata to the callback, which need not be stable", () => {
    const seen: boolean[] = [];
    renderHook(() =>
      useEstimateRound("g1", "r1", (snapshot) => seen.push(snapshot.metadata.fromCache)),
    );
    expect(h.listeners).toHaveLength(1);
    act(() => latest().next(snap({ status: "running" }, true)));
    act(() => latest().next(snap({ status: "running" }, false)));
    expect(seen).toEqual([true, false]);
    // An inline callback did not resubscribe.
    expect(h.listeners).toHaveLength(1);
  });
});

describe("useDeadlineNow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const base = Date.parse("2026-05-01T10:00:00.000Z");

  it("ticks every second while the deadline is ahead", () => {
    const { result } = renderHook(() => useDeadlineNow(base + 10_000, true));
    expect(result.current).toBe(base);
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(base + 3000);
  });

  it("stands still once the deadline is reached, and takes no further timer", () => {
    const { result } = renderHook(() => useDeadlineNow(base + 2000, true));
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(base + 2000);
    act(() => void vi.advanceTimersByTime(30_000));
    expect(result.current).toBe(base + 2000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("wakes again for a deadline that moves (a last call)", () => {
    const { result, rerender } = renderHook(
      ({ deadline }: { deadline: number }) => useDeadlineNow(deadline, true),
      { initialProps: { deadline: base + 1000 } },
    );
    act(() => void vi.advanceTimersByTime(1000));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(base + 1000);
    rerender({ deadline: base + 120_000 });
    expect(result.current).toBe(base + 6000);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(base + 8000);
  });

  it("does not tick when not running or without a deadline", () => {
    renderHook(() => useDeadlineNow(base + 10_000, false));
    renderHook(() => useDeadlineNow(null, true));
    expect(vi.getTimerCount()).toBe(0);
  });
});
