"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Smallest frame we will ever ask for. Below roughly this, the header and
 * composer alone no longer fit and `overflow-hidden` would clip the send
 * button — the very symptom this module exists to prevent. On a viewport
 * that short nothing can lay out well, so we stop shrinking and let the
 * bottom fall behind the keyboard rather than clipping controls.
 */
const MIN_FRAME_HEIGHT = 200;

/**
 * The pixel height an element needs to reach exactly the bottom of the
 * *visible* area — what is left once browser chrome and the on-screen
 * keyboard are accounted for.
 *
 * Every input is in **layout-viewport coordinates**, and mixing frames here
 * is an easy mistake: `visualViewport.offsetTop` is the visual viewport's
 * offset within the layout viewport, and `getBoundingClientRect().top` is
 * already layout-viewport-relative, so neither needs `window.scrollY` added.
 * The visible band spans `[offsetTop, offsetTop + height]`, so the room below
 * `elementTop` is `height + offsetTop - elementTop`.
 *
 * The result is clamped at both ends, and both clamps are load-bearing:
 *
 * - **Floor** (`MIN_FRAME_HEIGHT`): below it the header and composer no longer
 *   fit and `overflow-hidden` clips the send button.
 * - **Cap** (`visualHeight`): nothing can occupy more of the visible area than
 *   the visible area has. Without it a *negative* `elementTop` — the frame
 *   scrolled partly off the top, which iOS does by leaving a non-zero body
 *   scroll with the keyboard up in a standalone PWA — is subtracted as a
 *   negative and *adds* the scrolled-away distance to the frame. That
 *   overshoot feeds itself: a taller frame makes the document scrollable,
 *   which permits more scroll, which measures taller still, until the header
 *   is above the fold and the composer is behind the keyboard.
 *
 * The floor is applied last, so on a viewport too short for both it wins —
 * clipping a control is the worse of the two failures.
 */
export function computeVisibleHeight(
  visualHeight: number,
  visualOffsetTop: number,
  elementTop: number,
): number {
  const available = visualHeight + visualOffsetTop - elementTop;
  if (!Number.isFinite(available)) return MIN_FRAME_HEIGHT;
  const capped = Math.min(Math.round(available), Math.round(visualHeight));
  return Math.max(MIN_FRAME_HEIGHT, capped);
}

/** The stage scroller of the game pages; a frame inside one is re-measured when it scrolls. */
const DEFAULT_SCROLLER = '[data-slot="stage-scroller"]';

export interface UseVisibleHeightOptions {
  /**
   * CSS selector of the scrollable ancestor to watch, or `null` to watch none.
   * Defaults to the game stage scroller (`[data-slot="stage-scroller"]`).
   *
   * A frame inside a scroller needs more than the `visualViewport` events: when
   * a field in it gains focus, WebKit scrolls it into view inside every
   * scrollable ancestor *without any viewport event*, so the frame's top
   * (`getBoundingClientRect().top`) moves while `visualViewport` stays silent
   * and the measured bottom goes stale — under the keypad. When the element has
   * no such ancestor (the chat) none of this is installed and the hook behaves
   * exactly as it always has.
   */
  scroller?: string | null;
  /**
   * Only with a scroller: after the first `visualViewport` resize that follows
   * a `focusin`, scroll the focused field's form (or the field itself) into view
   * with `{ block: "nearest" }`, two animation frames later, once the frame has
   * been resized. Default `true`.
   */
  revealFocused?: boolean;
}

/**
 * Pins an element to exactly the visible viewport height, so a screen that
 * owns its own internal scrolling (the chat) never grows the document.
 *
 * Why this needs JavaScript at all: the app's height chain bottoms out at
 * `body { min-height: 100% }` (app/layout.tsx), which is deliberately
 * indefinite so ordinary pages can grow and scroll. A chat screen wants the
 * opposite — a fixed frame with the composer parked at the bottom — and no
 * pure-CSS unit expresses "what's visible right now" on both platforms:
 *
 * - Android Chrome shrinks the layout viewport for the keyboard (thanks to
 *   `interactiveWidget: "resizes-content"`), so `dvh` would work there.
 * - iOS Safari, standalone PWA included, ignores that hint: the keyboard
 *   *overlays* a still-full-height layout viewport, `dvh` never changes, and
 *   anything at the bottom — our composer — ends up behind the keyboard.
 *   Only `visualViewport` reports the shrunken area.
 *
 * Returns `null` until measured, so the caller can fall back to its normal
 * flex layout during SSR and first paint, and forever in the rare browser
 * with no `visualViewport`.
 *
 * Size the element with `maxHeight`, never `height`, when it should only
 * shrink for a keyboard (the estimate guess frame): without one it keeps its
 * natural height. See {@link UseVisibleHeightOptions} for the stage-scroller
 * extension; the chat passes nothing and is unaffected.
 */
export function useVisibleHeight(
  ref: RefObject<HTMLElement | null>,
  options?: UseVisibleHeightOptions,
): number | null {
  const scrollerSelector = options?.scroller === undefined ? DEFAULT_SCROLLER : options.scroller;
  const revealFocused = options?.revealFocused ?? true;
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;
    // Set by a focusin inside the scroller, consumed by the next viewport resize.
    let revealTarget: HTMLElement | null = null;
    let revealFrames: number[] = [];

    function cancelReveal() {
      for (const id of revealFrames) cancelAnimationFrame(id);
      revealFrames = [];
    }

    function measure() {
      frame = 0;
      const element = ref.current;
      if (!element || !viewport) return;
      // While the user is pinch-zoomed in, visualViewport reports the zoomed
      // region rather than the keyboard-adjusted page. Resizing the frame to
      // that would fight the gesture on every pan, so hold the last value.
      if (viewport.scale > 1) return;
      setHeight(
        computeVisibleHeight(
          viewport.height,
          viewport.offsetTop,
          element.getBoundingClientRect().top,
        ),
      );
    }

    // visualViewport scroll fires per animation frame while panning, and each
    // handler forces a reflow via getBoundingClientRect — coalesce them.
    function schedule() {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    }

    // The keyboard has resized the frame by now; two frames later the layout
    // has settled and the field can be brought into the (smaller) frame.
    function onViewportResize() {
      schedule();
      const target = revealTarget;
      if (!target) return;
      revealTarget = null;
      cancelReveal();
      revealFrames.push(
        requestAnimationFrame(() => {
          revealFrames.push(
            requestAnimationFrame(() => {
              revealFrames = [];
              if (target.isConnected) target.scrollIntoView({ block: "nearest" });
            }),
          );
        }),
      );
    }

    function onFocusIn(event: FocusEvent) {
      schedule();
      if (!revealFocused || !(event.target instanceof HTMLElement)) return;
      revealTarget = event.target.closest("form") ?? event.target;
    }

    // A pending reveal belongs to one focus; leaving the field drops it, so a
    // later unrelated resize (keyboard closing) cannot scroll the page.
    function onFocusOut() {
      revealTarget = null;
    }

    const root = ref.current;
    const scroller =
      root instanceof Element && scrollerSelector ? root.closest(scrollerSelector) : null;

    measure();
    viewport.addEventListener("resize", onViewportResize);
    viewport.addEventListener("scroll", schedule);
    if (root && scroller) {
      scroller.addEventListener("scroll", schedule, { passive: true });
      root.addEventListener("focusin", onFocusIn);
      root.addEventListener("focusout", onFocusOut);
    }
    // No ResizeObserver on purpose: outside a scroller (watched above) nothing
    // above this element changes height without also firing a viewport event,
    // and observing an element whose
    // height we set invites a feedback loop.
    return () => {
      if (frame) cancelAnimationFrame(frame);
      cancelReveal();
      viewport.removeEventListener("resize", onViewportResize);
      viewport.removeEventListener("scroll", schedule);
      if (root && scroller) {
        scroller.removeEventListener("scroll", schedule);
        root.removeEventListener("focusin", onFocusIn);
        root.removeEventListener("focusout", onFocusOut);
      }
    };
  }, [ref, scrollerSelector, revealFocused]);

  return height;
}
