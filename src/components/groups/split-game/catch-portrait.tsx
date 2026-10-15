"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode } from "react";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { STAMP_IMPACT_S } from "@/components/groups/split-game/celebration";
import { memberPalette } from "@/lib/games/member-colors";
import { cn } from "@/lib/utils";

/**
 * The size the portrait renders at, for `next/image`'s `sizes`: a caller that
 * preloads the photo must use the same string to hit the same `/_next/image`
 * URL. Mirrors `PORTRAIT_BOX` below.
 */
export const CATCH_PORTRAIT_SIZES = "(max-width: 640px) 88vw, 448px";

/** Square, as wide as the screen allows without running out of height for the name below it. */
const PORTRAIT_BOX = "size-[min(88vw,56dvh,28rem)]";

/**
 * A caught face, as big as the screen allows: the lottery's catch moment.
 * Whoever tapped a laughing face sees that face full-size over the whole
 * dialog, with only a quiet line below it naming them (and what they owe, in
 * `caption`). No slip, no stamp — the face is the moment.
 *
 * Same clock as `CatchFlash`, because `useCatchFlashes` times the stamp
 * thump and the laugh for `STAMP_IMPACT_S`: the face lands on that frame.
 * `pointer-events-none` — the caller's tap guard, not this overlay, locks the
 * board — and `aria-hidden`, since the dialog announces the catch in a live
 * region instead.
 */
export function CatchPortrait({
  name,
  caption,
  className,
  children,
}: {
  name: string;
  /** Printed under the name: an amount, a count. */
  caption?: ReactNode;
  className?: string;
  /** The photo; the slot is a square, fill it. */
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const [from, to] = memberPalette(name);
  const landDelay = Math.max(STAMP_IMPACT_S - 0.12, 0);

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : 0.12 } }}
      exit={{
        opacity: 0,
        transition: reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 1, 1] },
      }}
      className={cn(
        "pointer-events-none absolute z-30 flex flex-col items-center justify-center gap-4 overflow-hidden",
        className ?? "inset-0",
      )}
    >
      <span className="bg-popover/90 absolute inset-0 backdrop-blur-sm" />
      <span
        className="animate-bloom absolute size-[min(110vw,80dvh,36rem)] rounded-full blur-3xl"
        style={{ backgroundColor: from, animationDelay: `${Math.round(STAMP_IMPACT_S * 1000)}ms` }}
      />

      <motion.span
        initial={reduceMotion ? false : { opacity: 0, scale: 0.35, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: reduceMotion ? 0 : -1.5 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 340, damping: 15, mass: 0.8, delay: landDelay }
        }
        className={cn(
          "relative block overflow-hidden rounded-3xl border-4 shadow-2xl",
          PORTRAIT_BOX,
        )}
        style={{ borderColor: to }}
      >
        {children}
      </motion.span>

      <motion.span
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { duration: 0.24, ease: "easeOut", delay: STAMP_IMPACT_S }
        }
        className="relative flex max-w-[88vw] flex-col items-center gap-1 text-center"
      >
        <span className="flex max-w-full items-center gap-2">
          <GameAvatar name={name} className="ring-card size-7 text-sm ring-2" />
          <span className="font-heading max-w-full truncate text-lg leading-tight font-medium">
            {name}
          </span>
        </span>
        {caption}
      </motion.span>
    </motion.div>
  );
}
