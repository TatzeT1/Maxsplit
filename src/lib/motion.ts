import type { Transition, Variants } from "motion/react";

/**
 * The motion vocabulary, in one place.
 *
 * The CSS half of this system lives in `globals.css` (`--ease-*`,
 * `--duration-*`, the `animate-*` utilities). This file is its counterpart for
 * anything JS-driven: springs, orchestrated variants, and the stagger step.
 * Keep the two in agreement — a spring here that settles noticeably slower
 * than the CSS entrance next to it is exactly the kind of mismatch that reads
 * as "unfinished" without anyone being able to say why.
 *
 * Springs, not durations, for anything the user physically acts on. A duration
 * cannot be interrupted gracefully: tap a button twice quickly and a
 * duration-based scale restarts from the beginning, which is the visual
 * signature of a cheap interface. A spring carries its current velocity into
 * the new animation, so repeated input compounds instead of stuttering.
 */
export const springs = {
  /** Interactive feedback — presses, toggles, hovers. Settles almost at once. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Substantial surfaces arriving: dialogs, cards, panels. Reads as weight. */
  weighted: { type: "spring", stiffness: 260, damping: 30, mass: 1 },
  /**
   * Zero overshoot, for anything that moves between two real layout positions
   * — shared elements and `layout` animations. Overshoot on a shared element
   * makes it visibly overshoot its destination and snap back, which destroys
   * the illusion that it is one object moving rather than two being crossfaded.
   */
  precise: { type: "spring", stiffness: 400, damping: 40, mass: 0.9 },
} satisfies Record<string, Transition>;

/**
 * Seconds between siblings in a cascade.
 *
 * 40ms is deliberately tight. Much above ~70ms and a list of eight items stops
 * reading as one gesture and starts reading as items queueing up one at a time,
 * which makes the interface feel slow no matter how fast it actually is.
 */
export const STAGGER_STEP = 0.04;

/** Distance an entering element travels, in px. Small enough to read as settling. */
const RISE_DISTANCE = 10;

/**
 * Parent/child pair for an orchestrated cascade. Put `cascade` on the
 * container and `cascadeItem` on each child; the container drives the timing.
 */
export const cascade: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: STAGGER_STEP, delayChildren: 0.02 },
  },
};

export const cascadeItem: Variants = {
  hidden: { opacity: 0, y: RISE_DISTANCE },
  visible: { opacity: 1, y: 0, transition: springs.weighted },
};

/** A single element arriving on its own, with no siblings to coordinate with. */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: RISE_DISTANCE },
  visible: { opacity: 1, y: 0, transition: springs.weighted },
};

/**
 * Reduced-motion variants. Same names, same states, no travel — so a component
 * swaps the variant object and changes nothing else.
 */
export const staticCascade: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
};

export const staticItem: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
};

/**
 * Picks the right variant pair for the user's motion preference.
 *
 * `useReducedMotion()` returns `null` before it has read the media query, which
 * is falsy — so the full-motion variants are the default and reduced motion
 * applies as soon as it resolves.
 */
export function cascadeVariants(reduceMotion: boolean | null): {
  container: Variants;
  item: Variants;
} {
  return reduceMotion
    ? { container: staticCascade, item: staticItem }
    : { container: cascade, item: cascadeItem };
}
