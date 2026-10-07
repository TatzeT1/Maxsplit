import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sound/game-sounds", () => ({
  playStampSound: vi.fn(),
  playLaughSound: vi.fn(),
}));
vi.mock("@/lib/games/haptics", () => ({
  HAPTIC_STAMP: 45,
  HAPTIC_STAMP_FINALE: [45, 70, 110],
  vibrate: vi.fn(),
  cancelVibration: vi.fn(),
}));

import { CATCH_FLASH_HOLD_MS, CATCH_FLASH_STEP_MS } from "./celebration";
import { useCatchFlashes } from "./use-catch-flashes";
import { cancelVibration, vibrate } from "@/lib/games/haptics";
import { playStampSound } from "@/lib/sound/game-sounds";

describe("useCatchFlashes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("gives every payer their own slip, the finale only on the last", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    const onDone = vi.fn();
    act(() => result.current.catchEach(["ben", "lea", "max"], { delayMs: 450, onDone }));

    // Busy from the call on, so the verdict can't flash up during the beat.
    expect(result.current.active).toBe(true);
    expect(result.current.flash).toBeNull();

    act(() => vi.advanceTimersByTime(450));
    expect(result.current.flash).toMatchObject({ uid: "ben", finale: false, index: 0, count: 3 });
    const firstId = result.current.flash!.id;

    act(() => vi.advanceTimersByTime(CATCH_FLASH_STEP_MS));
    expect(result.current.flash).toMatchObject({ uid: "lea", finale: false, index: 1 });
    expect(result.current.flash!.id).toBeGreaterThan(firstId);

    act(() => vi.advanceTimersByTime(CATCH_FLASH_STEP_MS));
    expect(result.current.flash).toMatchObject({ uid: "max", finale: true, index: 2 });
    expect(onDone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(CATCH_FLASH_HOLD_MS));
    expect(result.current.flash).toBeNull();
    expect(result.current.active).toBe(false);
    expect(result.current.isActive()).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);

    expect(playStampSound).toHaveBeenCalledTimes(3);
    expect(vibrate).toHaveBeenLastCalledWith([45, 70, 110], expect.any(Number));
  });

  it("keeps the finale back for a run that more catches follow", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    const onDone = vi.fn();
    act(() => result.current.catchEach(["ben", "lea"], { finale: false, onDone }));

    expect(result.current.flash).toMatchObject({ uid: "ben", finale: false, index: 0 });
    act(() => vi.advanceTimersByTime(CATCH_FLASH_STEP_MS));
    expect(result.current.flash).toMatchObject({ uid: "lea", finale: false, index: 1 });

    // An ordinary slip's hold, not the finale's.
    act(() => vi.advanceTimersByTime(CATCH_FLASH_STEP_MS));
    expect(result.current.flash).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenLastCalledWith(45, expect.any(Number));
  });

  it("lands a single catch at once, inside the tap that caused it", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    act(() => result.current.catchOne("lea", { finale: true }));
    expect(result.current.flash).toMatchObject({ uid: "lea", finale: true, index: 0, count: 1 });
    expect(result.current.isActive()).toBe(true);
    expect(playStampSound).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(CATCH_FLASH_HOLD_MS));
    expect(result.current.flash).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it("lets a new catch replace the slip still on screen", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    act(() => result.current.catchOne("lea"));
    act(() => vi.advanceTimersByTime(CATCH_FLASH_HOLD_MS - 100));
    act(() => result.current.catchOne("ben"));
    expect(result.current.flash).toMatchObject({ uid: "ben" });

    // The first catch's hold must not clear the second one early.
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.flash).toMatchObject({ uid: "ben" });
    act(() => vi.advanceTimersByTime(CATCH_FLASH_HOLD_MS));
    expect(result.current.flash).toBeNull();
  });

  it("cancels everything still scheduled on Neu mischen", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    const onDone = vi.fn();
    act(() => result.current.catchEach(["ben", "lea"], { delayMs: 300, onDone }));
    act(() => vi.advanceTimersByTime(300));
    act(() => result.current.cancel());
    expect(result.current.flash).toBeNull();
    expect(result.current.active).toBe(false);
    expect(cancelVibration).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(10_000));
    expect(result.current.flash).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    expect(playStampSound).toHaveBeenCalledTimes(1);
  });

  it("stops its timers when the game unmounts", () => {
    const { result, unmount } = renderHook(() => useCatchFlashes()[1]);
    act(() => result.current.catchEach(["ben", "lea"], { delayMs: 300 }));
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(playStampSound).not.toHaveBeenCalled();
    expect(cancelVibration).toHaveBeenCalled();
  });

  it("finishes straight away when nobody pays", () => {
    const { result } = renderHook(() => useCatchFlashes()[1]);
    const onDone = vi.fn();
    act(() => result.current.catchEach([], { onDone }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.active).toBe(false);
  });
});
