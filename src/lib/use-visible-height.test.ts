import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeVisibleHeight, useVisibleHeight } from "@/lib/use-visible-height";

// Numbers below are an iPhone 13 standalone PWA: 664px layout viewport with a
// 56px app top bar above the chat, and a ~336px German keyboard.
describe("computeVisibleHeight", () => {
  it("fills the viewport below the element when no keyboard is open", () => {
    expect(computeVisibleHeight(664, 0, 56)).toBe(608);
  });

  it("shrinks by the keyboard on iOS, where the layout viewport does not", () => {
    // visualViewport is the only thing that reports the covered area; the
    // composer must end up exactly at the keyboard's top edge (56 + 272 = 328).
    expect(computeVisibleHeight(328, 0, 56)).toBe(272);
  });

  it("adds back the visual viewport scroll iOS applies to reveal the field", () => {
    expect(computeVisibleHeight(328, 40, 56)).toBe(312);
  });

  it("matches the full viewport for an element flush with the top", () => {
    expect(computeVisibleHeight(664, 0, 0)).toBe(664);
  });

  it("rounds sub-pixel viewport measurements", () => {
    expect(computeVisibleHeight(663.6, 0, 56)).toBe(608);
  });

  it("floors at a height that still fits the header and composer", () => {
    // Without a floor, a frame this short would let overflow-hidden clip the
    // send button — the exact symptom this module exists to prevent.
    expect(computeVisibleHeight(120, 0, 56)).toBe(200);
    expect(computeVisibleHeight(328, 0, 500)).toBe(200);
  });
});

/** Installs a fake visualViewport and returns a handle to drive it. */
function stubVisualViewport(initial: { height: number; offsetTop?: number; scale?: number }) {
  const listeners = new Map<string, Set<() => void>>();
  const viewport = {
    height: initial.height,
    offsetTop: initial.offsetTop ?? 0,
    scale: initial.scale ?? 1,
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners.get(type)?.delete(fn);
    },
  };
  Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  return {
    viewport,
    listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
    emit: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
  };
}

function elementAt(top: number) {
  return {
    current: { getBoundingClientRect: () => ({ top }) } as unknown as HTMLElement,
  };
}

describe("useVisibleHeight", () => {
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    // Reset here rather than at the end of the test that sets it, so a failure
    // there cannot leak a scrolled document into the rest of the suite.
    window.scrollY = 0;
    vi.restoreAllMocks();
  });

  it("measures against the layout viewport, without adding document scroll", () => {
    // Regression guard: getBoundingClientRect().top and visualViewport.offsetTop
    // are both already layout-viewport-relative, so a scrolled document must
    // not shift the result. Adding window.scrollY here under-measured the frame.
    window.scrollY = 250;
    stubVisualViewport({ height: 328 });
    const { result } = renderHook(() => useVisibleHeight(elementAt(56)));
    expect(result.current).toBe(272);
  });

  it("re-measures when the keyboard opens", async () => {
    const handle = stubVisualViewport({ height: 664 });
    const { result } = renderHook(() => useVisibleHeight(elementAt(56)));
    expect(result.current).toBe(608);

    handle.viewport.height = 328;
    await act(async () => {
      handle.emit("resize");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(result.current).toBe(272);
  });

  it("holds its last height while the user is pinch-zoomed in", async () => {
    const handle = stubVisualViewport({ height: 664 });
    const { result } = renderHook(() => useVisibleHeight(elementAt(56)));
    expect(result.current).toBe(608);

    // Zoomed: visualViewport reports the magnified region, not a keyboard.
    handle.viewport.scale = 2;
    handle.viewport.height = 300;
    await act(async () => {
      handle.emit("resize");
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(result.current).toBe(608);
  });

  it("stays null in a browser without visualViewport, so the caller keeps its flex layout", () => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    const { result } = renderHook(() => useVisibleHeight(elementAt(56)));
    expect(result.current).toBeNull();
  });

  it("stays null while the element is not mounted yet", () => {
    stubVisualViewport({ height: 664 });
    const { result } = renderHook(() => useVisibleHeight({ current: null }));
    expect(result.current).toBeNull();
  });

  it("removes every listener on unmount", () => {
    const handle = stubVisualViewport({ height: 664 });
    const { unmount } = renderHook(() => useVisibleHeight(elementAt(56)));
    expect(handle.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(handle.listenerCount()).toBe(0);
  });
});
