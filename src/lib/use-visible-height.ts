"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * The pixel height an element must have to fill exactly the *visible* area
 * below its own top edge — the space left over once browser chrome and the
 * on-screen keyboard are accounted for.
 *
 * `elementTop` is the element's distance from the top of the layout viewport's
 * document origin; `visualOffsetTop` adds back however far the browser has
 * scrolled the visual viewport inside the layout viewport (iOS does this to
 * reveal a focused field).
 */
export function computeVisibleHeight(
  visualHeight: number,
  visualOffsetTop: number,
  elementTop: number,
): number {
  const available = visualHeight + visualOffsetTop - elementTop;
  if (!Number.isFinite(available) || available < 0) return 0;
  return Math.round(available);
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
 * flex layout during SSR and first paint.
 */
export function useVisibleHeight(ref: RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    function update() {
      const element = ref.current;
      if (!element || !viewport) return;
      // Read the top edge in document coordinates. Once this hook has applied
      // a height the document no longer scrolls, so this stays stable instead
      // of feeding back into itself.
      const top = element.getBoundingClientRect().top + window.scrollY;
      setHeight(computeVisibleHeight(viewport.height, viewport.offsetTop, top));
    }

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [ref]);

  return height;
}
