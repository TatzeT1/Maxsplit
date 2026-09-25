"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
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
import {
  playAppliedSound,
  playLaughSound,
  playMissSound,
  playStampSound,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { ScratchCard } from "@/components/groups/split-game/scratch-card";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

interface FlashState {
  id: number;
  uid: string;
  /** The round's last losing card. */
  finale: boolean;
}

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
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashIdRef = useRef(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();
  const draw = useSequentialDraw();

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  function clearFlash() {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlash(null);
  }

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
    clearFlash();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setScratchedUids([]);
      clearFlash();
    }
    onOpenChange(nextOpen);
  }

  function revealCard(uid: string) {
    if (scratchedUids.includes(uid)) return;
    setScratchedUids((current) => [...current, uid]);
    if (!draw.losers.includes(uid)) {
      playMissSound();
      return;
    }
    // Presentation only: is this the last losing card still under foil?
    const losersFound = scratchedUids.filter((id) => draw.losers.includes(id)).length + 1;
    playStampSound(STAMP_IMPACT_S);
    playLaughSound(STAMP_IMPACT_S + 0.1);
    shakeStage();
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, uid, finale: losersFound >= draw.losers.length });
    flashTimeoutRef.current = setTimeout(() => setFlash(null), CATCH_FLASH_HOLD_MS);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const allScratched = poolUids.length > 0 && scratchedUids.length >= poolUids.length;
  // The verdict waits for the last catch's takeover to clear, as the
  // lottery's does — otherwise its bloom and rise play out hidden behind it.
  const showVerdict = allScratched && flash === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        x-clipped: the impact shake jolts the play area sideways, and without
        this the scrim and cards would briefly overhang the scroll box and
        flash a horizontal scrollbar.
      */}
      <DialogContent className="overflow-x-hidden sm:max-w-md">
        {/*
          Over the whole dialog rather than just the cards, like the
          lottery's takeover: with two or three players the card grid is
          shorter than the till slip.
        */}
        <AnimatePresence>
          {flash && (
            <CatchFlash
              key={flash.id}
              seed={flash.id}
              name={members[flash.uid].displayName}
              stampLabel={t("expenses.gameCaughtStamp")}
              finale={flash.finale}
              className="inset-0 z-50 rounded-xl"
              caption={
                <span className="text-muted-foreground text-sm font-medium">
                  {t("expenses.scratchResultPay")}
                </span>
              }
            />
          )}
        </AnimatePresence>
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
          <div ref={stageRef} className="flex flex-col gap-3">
            {showVerdict ? (
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
