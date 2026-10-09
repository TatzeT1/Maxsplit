"use client";

import { motion, useReducedMotion } from "motion/react";
import { useT } from "@/components/locale-provider";
import { InkStamp, STAMP_DROP_S, STAMP_IMPACT_S } from "@/components/groups/split-game/celebration";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

/** When the tied faces clash: the end of the drum roll. The clash sound and the jolt key off it. */
export const STECHEN_IMPACT_S = 0.9;
/** The "Stechen!" stamp lands a beat after the clash, so the two hits read as two. */
export const STECHEN_STAMP_S = STECHEN_IMPACT_S + 0.24;
/** How long the takeover stays up before the roll-off starts — long enough to read who's in it. */
export const STECHEN_HOLD_MS = 2400;

/** The avatars' flight: a creep in under the drum roll, the slam, a recoil, settled. */
const FLIGHT_S = STECHEN_IMPACT_S + 0.4;
const FLIGHT_TIMES = [
  0,
  (STECHEN_IMPACT_S * 0.78) / FLIGHT_S,
  STECHEN_IMPACT_S / FLIGHT_S,
  (STECHEN_IMPACT_S + 0.12) / FLIGHT_S,
  1,
];

/** Left half flies in from the left, right half from the right, an odd one out drops from above. */
function sideOf(index: number, count: number): -1 | 0 | 1 {
  const middle = (count - 1) / 2;
  return index < middle ? -1 : index > middle ? 1 : 0;
}

/**
 * "STECHEN!" — the people level on the line between paying and not, face to
 * face. It replaces the duels' small "Unentschieden — nochmal!" notice, which
 * undersold the tensest moment of the game: the faces creep in under a drum
 * roll, slam together (a clash and a jolt of the play area, scheduled by the
 * caller on `STECHEN_IMPACT_S`), and a stamp says what happens now.
 *
 * Pure staging, like `CatchFlash`: `aria-hidden` and `pointer-events-none`,
 * mounted inside `AnimatePresence` over the play area; the caller announces
 * the roll-off in its live region, owns the hold timer and keeps "Würfeln"
 * disabled while it's up. Under reduced motion the faces are simply there.
 */
export function DiceStechenTakeover({
  uids,
  slots,
  members,
  stamp,
  caption,
}: {
  /** Who rolls off, in roll order. */
  uids: readonly string[];
  /** How many of them will pay. */
  slots: number;
  members: Record<string, GroupMember>;
  /**
   * The stamp's text. Defaults to the dice game's ("Stechen!"); another game
   * that levels players on the paying line (the estimate game's "Stechfrage!")
   * passes its own.
   */
  stamp?: string;
  /** The line under the names. Defaults to the dice game's, by `slots`. */
  caption?: string;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const names = uids.map((uid) => members[uid].displayName);
  const count = names.length;
  const impactMs = `${Math.round(STECHEN_IMPACT_S * 1000)}ms`;
  const avatarClass =
    count <= 3 ? "size-16 text-2xl" : count <= 5 ? "size-12 text-lg" : "size-10 text-base";
  const versus =
    count === 2 ? t("expenses.diceStechenVersus", { a: names[0], b: names[1] }) : names.join(" · ");

  return (
    <motion.div
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduceMotion ? 0 : 0.15 } }}
      exit={{
        opacity: 0,
        transition: reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.4, 0, 1, 1] },
      }}
      className="pointer-events-none absolute -inset-x-4 -inset-y-2 z-30 flex items-center justify-center overflow-hidden"
    >
      <span className="bg-popover/85 absolute inset-0 backdrop-blur-[2px]" />
      <span
        className="animate-bloom bg-primary absolute size-52 rounded-full blur-2xl"
        style={{ animationDelay: impactMs }}
      />
      <span
        className="animate-settle-ring border-primary absolute size-40 rounded-full border-2"
        style={{ animationDelay: impactMs }}
      />

      {/* A card of its own, like the catch's slip: over the scrim alone the names would fight the rows behind. */}
      <div className="relative mx-6 mt-6 w-72 max-w-full">
        <div className="bg-card shadow-e2 flex flex-col items-center gap-3 rounded-2xl border px-5 pt-9 pb-5 text-center">
          <div className="flex flex-wrap items-center justify-center -space-x-3">
            {names.map((name, index) => {
              const side = sideOf(index, count);
              return (
                <motion.span
                  key={uids[index]}
                  className="relative block rounded-full"
                  // The middle face of an odd count sits on top, so it's never half hidden.
                  style={{ zIndex: side === 0 ? 1 : 0 }}
                  initial={
                    reduceMotion
                      ? false
                      : { opacity: 0, x: side * 170, y: side === 0 ? -150 : 0, scale: 0.7 }
                  }
                  animate={
                    reduceMotion
                      ? { opacity: 1 }
                      : {
                          opacity: [0, 1, 1, 1, 1],
                          x: [side * 170, side * 54, 0, side * 12, 0],
                          y: side === 0 ? [-150, -46, 0, -10, 0] : 0,
                          rotate: [side * 22, side * 10, side * -8, side * 3, 0],
                          scale: [0.7, 0.92, 1.14, 0.96, 1],
                        }
                  }
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : {
                          duration: FLIGHT_S,
                          times: FLIGHT_TIMES,
                          ease: ["easeInOut", "easeIn", "easeOut", "easeInOut"],
                        }
                  }
                >
                  <GameAvatar
                    name={name}
                    className={cn("ring-card shadow-e2 ring-4", avatarClass)}
                  />
                </motion.span>
              );
            })}
          </div>
          <span className="font-heading line-clamp-2 max-w-full text-xl leading-tight font-medium">
            {versus}
          </span>
          <span className="text-muted-foreground text-sm text-balance">
            {caption ??
              (slots === 1
                ? t("expenses.diceStechenOne")
                : t("expenses.diceStechenMany", { count: slots }))}
          </span>
        </div>
        {/* Over the card's top edge, like the stamp on a slip. */}
        <span className="absolute inset-x-0 -top-6 flex justify-center">
          <InkStamp
            label={stamp ?? t("expenses.diceStechenStamp")}
            name={names.join(" ")}
            ink="var(--primary)"
            // InkStamp hits the paper (STAMP_IMPACT_S - STAMP_DROP_S) after its delay.
            delay={STECHEN_STAMP_S - (STAMP_IMPACT_S - STAMP_DROP_S)}
          />
        </span>
      </div>
    </motion.div>
  );
}
