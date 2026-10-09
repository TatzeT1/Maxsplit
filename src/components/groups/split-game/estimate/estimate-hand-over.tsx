"use client";

import { useReducedMotion } from "motion/react";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Handy an Lea" — the screen between two seats of a one-phone round. It shows
 * NO question and NO number (not even the previous seat's pins): a glance at
 * the phone while it travels reveals nothing. No input either, so tapping
 * "Ich bin Lea" is the only way on and nothing pops a keyboard (G.5, G.12).
 *
 * `position` is 1-BASED: the seat about to guess ("Tipp 2 von 3" for position 2),
 * so the pips show `position - 1` finished seats.
 */
export function EstimateHandOver({
  name,
  position,
  total,
  onReady,
}: {
  name: string;
  /** 1-based seat number. */
  position: number;
  total: number;
  onReady: () => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const progress = t("expenses.estimateHandOverProgress", { done: position, total });

  return (
    <div
      data-slot="estimate-hand-over"
      className={cn(
        "bg-card ring-foreground/10 mx-auto flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl p-6 text-center ring-1",
        !reduceMotion && "animate-rise",
      )}
    >
      <GameAvatar name={name} className="size-16 text-2xl" />
      <h2 className="font-heading text-xl leading-tight font-medium text-balance">
        {t("expenses.estimateHandOverTitle", { name })}
      </h2>
      <p className="text-muted-foreground text-sm text-balance">
        {t("expenses.estimateHandOverBody", { name })}
      </p>
      <Button type="button" size="lg" className="touch-manipulation" onClick={onReady}>
        {t("expenses.estimateHandOverReady", { name })}
      </Button>
      <GameProgressPips
        revealedCount={Math.max(0, position - 1)}
        target={total}
        progressLabel={progress}
      />
      <p className="text-muted-foreground text-xs" aria-hidden="true">
        {progress}
      </p>
    </div>
  );
}
