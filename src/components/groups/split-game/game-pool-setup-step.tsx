"use client";

import { type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "who's playing, how many pay" setup step for the sequential-draw
 * split mini-games (wheel, scratch cards, the lottery) — the member
 * checklist (`GamePoolChecklist`) plus a 1..poolSize stepper. Callers pass
 * their own count hint copy and stepper icon so it still reads as *that*
 * game's stepper rather than a borrowed widget. A game with no fixed
 * "how many pay" concept — the slot machine's staked spins — uses
 * `GamePoolChecklist` directly instead of this wrapper.
 */
export function GamePoolSetupStep({
  memberUids,
  members,
  poolUids,
  onTogglePoolMember,
  loserCount,
  maxLoserCount,
  onStepLoserCount,
  stepperDirection,
  countHint,
  countIcon,
}: {
  memberUids: string[];
  members: Record<string, GroupMember>;
  poolUids: string[];
  onTogglePoolMember: (uid: string) => void;
  loserCount: number;
  maxLoserCount: number;
  onStepLoserCount: (delta: number) => void;
  stepperDirection: 1 | -1;
  countHint: string;
  countIcon: ReactNode;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-4">
      <GamePoolChecklist
        memberUids={memberUids}
        members={members}
        poolUids={poolUids}
        onTogglePoolMember={onTogglePoolMember}
      />

      <div className="flex flex-col gap-2">
        <Label id="game-count-label">{t("expenses.gameCountLabel")}</Label>
        <div
          role="group"
          aria-labelledby="game-count-label"
          className="bg-muted/40 flex items-center gap-3 rounded-xl border p-2"
        >
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={t("expenses.gameCountDecrease")}
            disabled={loserCount <= 1}
            onClick={() => onStepLoserCount(-1)}
          >
            <Minus />
          </Button>
          <div className="relative flex flex-1 items-center justify-center gap-2">
            {/* Live, so stepping the count is audible as well as visible. */}
            <span aria-live="polite" className="sr-only">
              {loserCount}
            </span>
            <span className="relative h-8 overflow-hidden">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={loserCount}
                  aria-hidden="true"
                  initial={reduceMotion ? false : { opacity: 0, y: stepperDirection * 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -stepperDirection * 14, transition: { duration: 0.12 } }
                  }
                  transition={reduceMotion ? { duration: 0 } : springs.snappy}
                  className="font-heading tabular-money block text-2xl leading-none font-medium"
                >
                  {loserCount}
                </motion.span>
              </AnimatePresence>
            </span>
            <span
              className="relative flex size-7 shrink-0 items-center justify-center text-lg"
              aria-hidden="true"
            >
              {countIcon}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={t("expenses.gameCountIncrease")}
            disabled={loserCount >= maxLoserCount}
            onClick={() => onStepLoserCount(1)}
          >
            <Plus />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">{countHint}</p>
      </div>
    </div>
  );
}
