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

  // Reported from an iPhone standalone PWA: with the keyboard open, the chat
  // header had scrolled off the top and the composer sat behind the keyboard —
  // the frame had grown past the visible area at both ends at once.
  //
  // The cause is a negative elementTop. Every other case here assumes the frame
  // starts at or below the top of the layout viewport, but iOS is known to
  // leave a non-zero body scroll with the keyboard up in a standalone PWA (see
  // f8b4fb0, which removed the scrollY term on the assumption that the frame
  // keeps the document at viewport height — true only until something scrolls
  // it once). Once elementTop goes negative, `visualHeight - elementTop`
  // *adds* the scrolled-away distance to the frame, and the overshoot is
  // self-feeding: a taller frame makes the document scrollable, which allows
  // more scroll, which makes the next measurement taller still.
  it("never asks for more height than the visible area itself", () => {
    // Keyboard open (340px visible), frame scrolled 144px off the top.
    // Uncapped this returns 484 — 144px of composer below the fold.
    expect(computeVisibleHeight(340, 0, -144)).toBe(340);
  });

  it("caps against the visible band, not the layout viewport", () => {
    // offsetTop is iOS scrolling the visual viewport to reveal the field. It
    // shifts where the band sits, but never makes the band itself taller, so
    // it must not raise the cap.
    expect(computeVisibleHeight(328, 40, -100)).toBe(328);
  });

  it("keeps the floor winning over the cap on a very short viewport", () => {
    // Both guards apply at once here. The floor has to win: clipping the send
    // button is the worse failure, and is what MIN_FRAME_HEIGHT exists for.
    expect(computeVisibleHeight(120, 0, -50)).toBe(200);
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

/**
 * A real DOM frame inside a stage scroller, with the frame's top driven by a
 * variable so a "scroll" can move it the way WebKit does when it brings a
 * focused field into view.
 */
function mountFrame(top: { value: number }, withScroller = true) {
  const scroller = document.createElement("div");
  if (withScroller) scroller.setAttribute("data-slot", "stage-scroller");
  const frame = document.createElement("div");
  const form = document.createElement("form");
  const input = document.createElement("input");
  form.append(input);
  frame.append(form);
  scroller.append(frame);
  document.body.append(scroller);
  frame.getBoundingClientRect = () => ({ top: top.value }) as DOMRect;
  form.scrollIntoView = vi.fn();
  return { scroller, frame, form, input, ref: { current: frame } };
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

describe("useVisibleHeight inside a stage scroller", () => {
  afterEach(() => {
    Object.defineProperty(window, "visualViewport", { value: undefined, configurable: true });
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("re-measures when the scroller scrolls, with no viewport event", async () => {
    // WebKit scrolls a focused field into view inside the scroller silently:
    // the frame's top moves, visualViewport says nothing.
    stubVisualViewport({ height: 320, offsetTop: 120 });
    const top = { value: 200 };
    const { scroller, ref } = mountFrame(top);
    const { result } = renderHook(() => useVisibleHeight(ref));
    expect(result.current).toBe(240);

    top.value = 100;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
      await nextFrame();
    });
    // The frame bottom stays on the visible bottom (offsetTop + height = 440).
    expect(result.current).toBe(320);
  });

  it("re-measures on focusin", async () => {
    stubVisualViewport({ height: 320, offsetTop: 120 });
    const top = { value: 200 };
    const { input, ref } = mountFrame(top);
    const { result } = renderHook(() => useVisibleHeight(ref));
    expect(result.current).toBe(240);

    top.value = 150;
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await nextFrame();
    });
    expect(result.current).toBe(290);
  });

  it("keeps the frame bottom at the visible bottom and never above the cap", async () => {
    const handle = stubVisualViewport({ height: 320, offsetTop: 120 });
    const top = { value: 200 };
    const { scroller, ref } = mountFrame(top);
    const { result } = renderHook(() => useVisibleHeight(ref));
    for (const next of [200, 160, 120, -40]) {
      top.value = next;
      await act(async () => {
        scroller.dispatchEvent(new Event("scroll"));
        await nextFrame();
      });
      expect(result.current).toBeLessThanOrEqual(handle.viewport.height);
      if (next >= 120) {
        expect(next + result.current!).toBe(handle.viewport.offsetTop + handle.viewport.height);
      }
    }
  });

  it("scrolls the form into view two frames after the first resize that follows a focusin", async () => {
    const handle = stubVisualViewport({ height: 664 });
    const top = { value: 56 };
    const { input, form, ref } = mountFrame(top);
    renderHook(() => useVisibleHeight(ref));

    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await nextFrame();
    });
    // Focus alone does not scroll: the frame has not been resized yet.
    expect(form.scrollIntoView).not.toHaveBeenCalled();

    handle.viewport.height = 328;
    await act(async () => {
      handle.emit("resize");
      await nextFrame();
    });
    expect(form.scrollIntoView).not.toHaveBeenCalled();
    await act(async () => {
      await nextFrame();
      await nextFrame();
    });
    expect(form.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(form.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    // Only the first resize after a focus: the next one does nothing.
    await act(async () => {
      handle.emit("resize");
      await nextFrame();
      await nextFrame();
      await nextFrame();
    });
    expect(form.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("does not scroll when focus left before the resize, or when revealFocused is off", async () => {
    const handle = stubVisualViewport({ height: 664 });
    const top = { value: 56 };
    const { input, form, ref } = mountFrame(top);
    const { rerender } = renderHook(
      ({ reveal }) => useVisibleHeight(ref, { revealFocused: reveal }),
      {
        initialProps: { reveal: true },
      },
    );

    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      handle.emit("resize");
      for (let i = 0; i < 3; i++) await nextFrame();
    });
    expect(form.scrollIntoView).not.toHaveBeenCalled();

    rerender({ reveal: false });
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      handle.emit("resize");
      for (let i = 0; i < 3; i++) await nextFrame();
    });
    expect(form.scrollIntoView).not.toHaveBeenCalled();
  });

  it("installs nothing extra without a scroller (the chat), and can be switched off", () => {
    const top = { value: 56 };
    const chat = mountFrame(top, false);
    const added = vi.spyOn(chat.frame, "addEventListener");
    const handle = stubVisualViewport({ height: 664 });
    const { unmount } = renderHook(() => useVisibleHeight(chat.ref));
    expect(added).not.toHaveBeenCalled();
    expect(handle.listenerCount()).toBe(2);
    unmount();
    expect(handle.listenerCount()).toBe(0);

    const staged = mountFrame(top);
    const stagedAdded = vi.spyOn(staged.frame, "addEventListener");
    renderHook(() => useVisibleHeight(staged.ref, { scroller: null }));
    expect(stagedAdded).not.toHaveBeenCalled();
  });

  it("accepts another scroller selector", async () => {
    stubVisualViewport({ height: 320 });
    const top = { value: 100 };
    const { scroller, ref } = mountFrame(top, false);
    scroller.id = "custom";
    const { result } = renderHook(() => useVisibleHeight(ref, { scroller: "#custom" }));
    expect(result.current).toBe(220);
    top.value = 50;
    await act(async () => {
      scroller.dispatchEvent(new Event("scroll"));
      await nextFrame();
    });
    expect(result.current).toBe(270);
  });

  it("removes the scroller and focus listeners on unmount", () => {
    stubVisualViewport({ height: 664 });
    const { scroller, frame, ref } = mountFrame({ value: 56 });
    const removedScroller = vi.spyOn(scroller, "removeEventListener");
    const removedFrame = vi.spyOn(frame, "removeEventListener");
    const { unmount } = renderHook(() => useVisibleHeight(ref));
    unmount();
    expect(removedScroller).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removedFrame).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(removedFrame).toHaveBeenCalledWith("focusout", expect.any(Function));
  });
});
