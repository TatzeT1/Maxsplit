"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import { memberColor } from "@/lib/games/member-colors";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import { playAppliedSound, playLaughSound, playMissSound } from "@/lib/sound/game-sounds";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** Row height in px, and how many rows the window shows — the classic 3-symbol payline. */
const ROW_HEIGHT = 56;
const VISIBLE_ROWS = 3;
const STRIP_LENGTH = 22;
/** Where the winner sits in every strip, with a couple of buffer rows after it. */
const WINNER_INDEX = STRIP_LENGTH - 3;
/** Reels stop one at a time, left to right, each holding a little longer than the last. */
const REEL_DURATIONS = [1.5, 2.05, 2.6];

/**
 * Filler symbols above and below the winner are purely decorative — the
 * winner itself came from `useSequentialDraw`'s crypto-random draw, so
 * `Math.random` here can't affect who actually pays.
 */
function buildReelStrip(winnerUid: string, fillerPool: string[]): string[] {
  const strip: string[] = [];
  for (let i = 0; i < STRIP_LENGTH; i++) {
    strip.push(
      i === WINNER_INDEX ? winnerUid : fillerPool[Math.floor(Math.random() * fillerPool.length)],
    );
  }
  return strip;
}

function ReelSymbol({ name }: { name: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-lg font-bold text-white"
      style={{ height: ROW_HEIGHT, backgroundColor: memberColor(name) }}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Spielautomat ("who pays" slot machine): pulling the lever spins three
 * reels that stop one after another, all landing on the same member — the
 * fixed winner for this draw from `useSequentialDraw`. The reels only ever
 * reveal that winner, never decide it.
 */
export function SplitSlotDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  onResolve: (loserUids: string[]) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [loserCountInput, setLoserCountInput] = useState("1");
  const [stepperDirection, setStepperDirection] = useState<1 | -1>(1);
  const [pullId, setPullId] = useState(0);
  const [reels, setReels] = useState<string[][]>([[], [], []]);
  const [pulling, setPulling] = useState(false);
  const draw = useSequentialDraw();

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  const maxLoserCount = Math.max(poolUids.length, 1);
  const loserCount = Math.min(
    Math.max(Number.parseInt(loserCountInput, 10) || 1, 1),
    maxLoserCount,
  );

  function stepLoserCount(delta: number) {
    setStepperDirection(delta > 0 ? 1 : -1);
    setLoserCountInput(String(Math.min(Math.max(loserCount + delta, 1), maxLoserCount)));
  }

  function startGame() {
    draw.start(poolUids, loserCount);
    setReels([[], [], []]);
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    setReels([[], [], []]);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setReels([[], [], []]);
      setPulling(false);
    }
    onOpenChange(nextOpen);
  }

  const remaining = poolUids.filter((uid) => !draw.revealedLosers.includes(uid));

  function pull() {
    if (pulling || draw.gameOver || !draw.currentUid) return;
    const fillerPool = remaining.length > 0 ? remaining : poolUids;
    setReels([
      buildReelStrip(draw.currentUid, fillerPool),
      buildReelStrip(draw.currentUid, fillerPool),
      buildReelStrip(draw.currentUid, fillerPool),
    ]);
    setPulling(true);
    setPullId((id) => id + 1);
  }

  function handleReelStop(index: number) {
    if (!pulling) return;
    playMissSound();
    const next = index + 1;
    if (next >= reels.length) {
      setPulling(false);
      playLaughSound();
      draw.revealNext();
    }
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const lastLoserUid = draw.revealedLosers[draw.revealedLosers.length - 1];
  const targetY = -(WINNER_INDEX - 1) * ROW_HEIGHT;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎰</span>
            {t("expenses.slotTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.slotIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <GamePoolSetupStep
            memberUids={memberUids}
            members={members}
            poolUids={poolUids}
            onTogglePoolMember={togglePoolMember}
            loserCount={loserCount}
            maxLoserCount={maxLoserCount}
            onStepLoserCount={stepLoserCount}
            stepperDirection={stepperDirection}
            countHint={t("expenses.slotCountHint")}
            countIcon="🎰"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {pulling
                ? t("expenses.slotSpinningLabel")
                : !draw.gameOver && lastLoserUid
                  ? t("expenses.slotRoundResult", { name: members[lastLoserUid].displayName })
                  : ""}
            </p>

            {draw.gameOver ? (
              <GameResultBanner loserUids={draw.losers} members={members} />
            ) : (
              lastLoserUid && (
                <div className="bg-muted/40 flex items-center gap-3 rounded-xl border p-3">
                  <div className="flex -space-x-2" aria-hidden="true">
                    {draw.revealedLosers.map((uid) => (
                      <GameAvatar
                        key={uid}
                        name={members[uid].displayName}
                        className="ring-popover size-8 text-xs ring-2"
                      />
                    ))}
                  </div>
                  <p aria-hidden="true" className="text-sm">
                    {t("expenses.slotRoundResult", { name: members[lastLoserUid].displayName })}
                  </p>
                </div>
              )
            )}

            <GameProgressPips
              revealedCount={draw.revealedCount}
              target={draw.losers.length}
              progressLabel={t("expenses.slotProgress", {
                found: draw.revealedCount,
                target: draw.losers.length,
              })}
            />

            <div className="bg-foreground/90 shadow-e2 mx-auto flex gap-1.5 rounded-xl p-2">
              {[0, 1, 2].map((reelIndex) => (
                <div
                  key={reelIndex}
                  className="relative overflow-hidden rounded-md bg-black/20"
                  style={{ width: ROW_HEIGHT, height: ROW_HEIGHT * VISIBLE_ROWS }}
                >
                  <motion.div
                    key={`${pullId}-${reelIndex}`}
                    className="flex flex-col"
                    initial={{ y: 0 }}
                    animate={{ y: reels[reelIndex].length > 0 ? targetY : 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : {
                            duration: REEL_DURATIONS[reelIndex],
                            ease: [0.15, 0.7, 0.15, 1],
                          }
                    }
                    onAnimationComplete={() => handleReelStop(reelIndex)}
                  >
                    {reels[reelIndex].map((uid, rowIndex) => (
                      <ReelSymbol key={rowIndex} name={members[uid]?.displayName ?? "?"} />
                    ))}
                  </motion.div>
                  {/* Payline: the middle row is the one that counts. */}
                  <div
                    aria-hidden="true"
                    className={cn(
                      "border-primary/70 pointer-events-none absolute inset-x-0 border-y-2",
                      "shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]",
                    )}
                    style={{ top: ROW_HEIGHT, height: ROW_HEIGHT }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "setup" ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.gameStart")}
            </Button>
          ) : draw.gameOver ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={goToSetup}
              >
                {t("expenses.gamePlayAgain")}
              </Button>
              <Button type="button" size="lg" className="flex-1" onClick={applyResult}>
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            <Button type="button" size="lg" className="flex-1" disabled={pulling} onClick={pull}>
              {draw.revealedCount > 0 ? t("expenses.slotPullAgain") : t("expenses.slotPull")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
