"use client";

import { useState } from "react";
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
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import { playAppliedSound, playLaughSound, playMissSound } from "@/lib/sound/game-sounds";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { ScratchCard } from "@/components/groups/split-game/scratch-card";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/**
 * Rubbellos ("who pays" scratch cards): unlike the wheel and slot machine,
 * every pool member gets their own card rather than taking turns on a
 * shared board, so the round isn't "done" until everyone has checked
 * theirs — not just until the losers are found. That's why this game
 * tracks its own `scratchedUids` instead of `useSequentialDraw`'s
 * reveal-count; it only borrows the hook for the fixed, crypto-random set
 * of who's a loser this round.
 */
export function SplitScratchDialog({
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
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [loserCountInput, setLoserCountInput] = useState("1");
  const [stepperDirection, setStepperDirection] = useState<1 | -1>(1);
  const [scratchedUids, setScratchedUids] = useState<string[]>([]);
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
    setScratchedUids([]);
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    setScratchedUids([]);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setScratchedUids([]);
    }
    onOpenChange(nextOpen);
  }

  function revealCard(uid: string) {
    if (scratchedUids.includes(uid)) return;
    setScratchedUids((current) => [...current, uid]);
    if (draw.losers.includes(uid)) playLaughSound();
    else playMissSound();
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const allScratched = poolUids.length > 0 && scratchedUids.length >= poolUids.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎫</span>
            {t("expenses.scratchTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.scratchIntro")}</DialogDescription>}
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
            countHint={t("expenses.scratchCountHint")}
            countIcon="🎫"
          />
        ) : (
          <div className="flex flex-col gap-3">
            {allScratched ? (
              <GameResultBanner loserUids={draw.losers} members={members} />
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {t("expenses.scratchCardRevealHint")}
              </p>
            )}

            <GameProgressPips
              revealedCount={scratchedUids.length}
              target={poolUids.length}
              progressLabel={t("expenses.scratchProgress", {
                found: scratchedUids.length,
                target: poolUids.length,
              })}
            />

            <div className="grid grid-cols-3 gap-2">
              {poolUids.map((uid) => (
                <ScratchCard
                  key={uid}
                  name={members[uid].displayName}
                  isLoser={draw.losers.includes(uid)}
                  scratched={scratchedUids.includes(uid)}
                  onReveal={() => revealCard(uid)}
                />
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
          ) : allScratched ? (
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
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={goToSetup}
            >
              {t("expenses.gamePlayAgain")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
