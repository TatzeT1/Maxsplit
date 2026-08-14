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
 */
export function useVisibleHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    let frame = 0;

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

    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    // No ResizeObserver on purpose: nothing above this element changes height
    // without also firing a viewport event, and observing an element whose
    // height we set invites a feedback loop.
    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
    };
  }, [ref]);

  return height;
}
