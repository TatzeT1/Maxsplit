"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";

/**
 * `useLayoutEffect` on the client, `useEffect` on the server.
 *
 * The mount animation has to start before the browser paints, or the final
 * amount is visible for one frame and then snaps back to zero to count up —
 * a flicker that is brief, obvious, and exactly the sort of thing that
 * undermines the impression this component exists to create. React warns about
 * `useLayoutEffect` during SSR, hence the swap.
 */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * A money amount that counts to its value instead of snapping to it.
 *
 * Two details do the real work here, and both are about the digits rather than
 * the animation:
 *
 * `tabular-money` gives every digit the same advance width. Without it, an
 * amount counting from 0 to 1.234,56 € reflows on almost every frame as glyph
 * widths change, and the number visibly jitters — which looks worse than not
 * animating at all. Proportional digits are why most count-up animations feel
 * cheap.
 *
 * The value is interpolated in *minor units* and rounded before formatting, so
 * every intermediate frame is a real, well-formed amount that `formatMoney`
 * renders with the correct separators and the currency's actual minor-unit
 * exponent. Interpolating the formatted string instead would produce garbage
 * frames like "1.23,4 €".
 *
 * Counting is suppressed entirely under `prefers-reduced-motion` — the amount
 * simply appears, which is also what a screen reader announces either way.
 */
export function AnimatedMoney({
  amountMinor,
  currency,
  className,
  countOnMount = false,
}: {
  amountMinor: number;
  currency: string;
  className?: string;
  /** Count up from zero on first render. For a headline figure, not a list. */
  countOnMount?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const [displayMinor, setDisplayMinor] = useState(amountMinor);
  // Seeded with the mount value so the first effect run compares against the
  // right baseline; `countOnMount` overrides it below.
  const previousMinor = useRef(amountMinor);
  const hasMounted = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const isMount = !hasMounted.current;
    hasMounted.current = true;

    if (reduceMotion) {
      previousMinor.current = amountMinor;
      setDisplayMinor(amountMinor);
      return;
    }

    const from = isMount ? (countOnMount ? 0 : amountMinor) : previousMinor.current;
    previousMinor.current = amountMinor;
    if (from === amountMinor) {
      setDisplayMinor(amountMinor);
      return;
    }

    setDisplayMinor(from);
    const controls = animate(from, amountMinor, {
      duration: isMount ? 0.7 : 0.45,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setDisplayMinor(Math.round(value)),
    });
    return () => controls.stop();
  }, [amountMinor, countOnMount, reduceMotion]);

  return (
    <span className={cn("tabular-money", className)}>{formatMoney(displayMinor, currency)}</span>
  );
}
