import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_STAMP_FINALE, cancelVibration, vibrate } from "./haptics";

// jsdom has no Vibration API, like iOS Safari: tests that need one install it.
function installVibrate(result = true) {
  const spy = vi.fn((pattern: number | number[]) => {
    void pattern;
    return result;
  });
  Object.defineProperty(navigator, "vibrate", { value: spy, configurable: true, writable: true });
  return spy;
}

describe("haptics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("is a silent no-op where the device can't vibrate (iOS)", () => {
    expect("vibrate" in navigator).toBe(false);
    expect(vibrate(45)).toBe(false);
    expect(() => cancelVibration()).not.toThrow();
  });

  it("buzzes a pattern as given", () => {
    const spy = installVibrate();
    expect(vibrate(45)).toBe(true);
    expect(spy).toHaveBeenLastCalledWith(45);
    vibrate(HAPTIC_STAMP_FINALE);
    expect(spy).toHaveBeenLastCalledWith([45, 70, 110]);
  });

  it("delays inside the pattern, so no timer is left to cancel", () => {
    const spy = installVibrate();
    vibrate(45, 300);
    expect(spy).toHaveBeenLastCalledWith([0, 300, 45]);
    vibrate([45, 70, 110], 299.6);
    expect(spy).toHaveBeenLastCalledWith([0, 300, 45, 70, 110]);
  });

  it("cancels a buzz that is still queued, and nothing once it is over", () => {
    const spy = installVibrate();
    vibrate(45, 300);
    vi.advanceTimersByTime(100);
    cancelVibration();
    expect(spy).toHaveBeenLastCalledWith(0);

    spy.mockClear();
    vibrate(45, 300);
    vi.advanceTimersByTime(400);
    cancelVibration();
    expect(spy).not.toHaveBeenCalledWith(0);
  });

  it("reports a refused or throwing call as not buzzing", () => {
    installVibrate(false);
    expect(vibrate(45)).toBe(false);
    Object.defineProperty(navigator, "vibrate", {
      value: () => {
        throw new Error("blocked");
      },
      configurable: true,
      writable: true,
    });
    expect(vibrate(45)).toBe(false);
  });
});
