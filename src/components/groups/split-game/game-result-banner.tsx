"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { DialogDescription } from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { ConfettiBurst, celebrationColors } from "@/components/groups/split-game/celebration";
import { memberColor } from "@/lib/games/member-colors";
import { STAGGER_STEP } from "@/lib/motion";
import { nameHash } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "X pays" verdict banner, shown once a wheel or scratch-card round
 * is fully resolved, so a round always lands the same way regardless of
 * which game produced it.
 *
 * It arrives after the last catch's takeover has cleared, as the round's
 * finale: the payers' avatars spring up one after another, each with a ring
 * in their own color, and a last confetti burst in all of their colors goes
 * up from the row.
 */
export function GameResultBanner({
  loserUids,
  members,
}: {
  loserUids: string[];
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const avatarsRef = useRef<HTMLDivElement | null>(null);
  const loserNames = loserUids.map((uid) => members[uid].displayName);
  const resultText =
    loserNames.length === 1
      ? t("expenses.gameResultOne", { name: loserNames[0] })
      : t("expenses.gameResultMultiple", { names: loserNames.join(", ") });

  return (
    <div className="border-primary/30 bg-primary/5 animate-rise relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-4 text-center">
      {/* Visible text alone doesn't get announced on arrival — this is the state change screen readers actually hear. */}
      <p aria-live="polite" className="sr-only">
        {resultText}
      </p>
      <span
        aria-hidden="true"
        className="bg-primary/25 animate-bloom pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
      />
      <span className="text-muted-foreground relative text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.gameResultEyebrow")}
      </span>
      <div ref={avatarsRef} className="relative flex -space-x-2">
        {loserNames.map((name, index) => {
          const delay = 0.08 + index * STAGGER_STEP * 2;
          return (
            <motion.span
              key={loserUids[index]}
              className="relative block rounded-full"
              initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: "spring", stiffness: 420, damping: 13, mass: 0.8, delay }
              }
            >
              <span
                aria-hidden="true"
                className="animate-settle-ring pointer-events-none absolute inset-0 rounded-full border-2"
                style={{
                  borderColor: memberColor(name),
                  animationDelay: `${Math.round((delay + 0.12) * 1000)}ms`,
                }}
              />
              <GameAvatar name={name} className="ring-popover size-10 text-sm ring-2" />
            </motion.span>
          );
        })}
      </div>
      <DialogDescription className="font-heading text-foreground relative text-lg font-medium">
        {resultText}
      </DialogDescription>
      <ConfettiBurst
        anchorRef={avatarsRef}
        seed={nameHash(loserNames.join("|"))}
        colors={celebrationColors(loserNames)}
        count={64}
        power={1.2}
        delay={0.1}
      />
    </div>
  );
}
