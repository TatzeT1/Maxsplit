"use client";

import { type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import type { GroupMember } from "@/lib/types";

/**
 * Shared "who's playing, how many pay" setup step for every split
 * mini-game — identical across the wheel, slot machine and scratch cards,
 * differing only in the count hint copy and the small icon next to the
 * stepper digit (each game gets its own, so the stepper still reads as
 * *that* game's stepper rather than a borrowed lottery widget).
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
      <div className="flex flex-col gap-2">
        <Label id="game-pool-label">{t("expenses.gamePoolLabel")}</Label>
        <div role="group" aria-labelledby="game-pool-label" className="flex flex-col gap-1.5">
          {memberUids.map((uid, index) => {
            const name = members[uid].displayName;
            const selected = poolUids.includes(uid);
            return (
              <label
                key={uid}
                style={{ "--stagger": index } as CSSProperties}
                className={cn(
                  "has-focus-visible:ring-ring/50 ease-spring animate-rise active:shadow-pressed flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none active:scale-[0.99] has-focus-visible:ring-3",
                  selected
                    ? "border-primary/40 bg-primary/5 shadow-e1"
                    : "border-border bg-background",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onTogglePoolMember(uid)}
                  className="sr-only"
                />
                <GameAvatar
                  name={name}
                  className={cn(
                    "size-9 text-sm transition-all duration-(--duration-fast)",
                    !selected && "opacity-40 grayscale",
                  )}
                />
                <span
                  className={cn(
                    "flex-1 truncate text-sm font-medium",
                    !selected && "text-muted-foreground",
                  )}
                >
                  {name}
                </span>
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--duration-fast)",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                  )}
                >
                  {selected && (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path
                        d="M20 6 9 17l-5-5"
                        pathLength={1}
                        className="animate-draw-stroke [--stroke-length:1]"
                      />
                    </svg>
                  )}
                </span>
              </label>
            );
          })}
        </div>
        {poolUids.length < 2 && (
          <p className="text-muted-foreground text-xs">{t("expenses.gamePoolMinHint")}</p>
        )}
      </div>

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
