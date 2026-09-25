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
import { memberColor } from "@/lib/games/member-colors";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import { playAppliedSound, playLaughSound } from "@/lib/sound/game-sounds";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** Wheel diameter in px. */
const WHEEL_SIZE = 240;
/** Every spin gets its own duration and turn count in these ranges, so no two spins feel the same — a wheel that always spins for exactly the same length reads as a slot reading off a fixed answer, not a game of chance. */
const MIN_SPIN_DURATION = 3.6;
const MAX_SPIN_DURATION = 6.2;
const MIN_EXTRA_SPINS = 5;
const MAX_EXTRA_SPINS = 11;

function randomJitterDegrees(maxDegrees: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] / 0xffffffff) * maxDegrees * 2 - maxDegrees;
}

/**
 * How long this spin lasts and how many extra full turns it takes are pure
 * presentation — the winner already came from `useSequentialDraw`'s
 * crypto-random draw, so `Math.random` here can't affect who actually pays,
 * only how long the reveal takes to get there.
 */
function randomSpinDuration(): number {
  return MIN_SPIN_DURATION + Math.random() * (MAX_SPIN_DURATION - MIN_SPIN_DURATION);
}

function randomExtraSpins(): number {
  return Math.round(MIN_EXTRA_SPINS + Math.random() * (MAX_EXTRA_SPINS - MIN_EXTRA_SPINS));
}

/**
 * Glücksrad ("who pays" wheel): one spin per draw, landing on a member of
 * whoever's still left in the wheel. The draw order is fixed up front by
 * `useSequentialDraw` (same engine the slot machine and scratch cards use)
 * — the spin only reveals it, it never decides it, so a skipped animation
 * (`prefers-reduced-motion`) can't change who ends up paying.
 */
export function SplitWheelDialog({
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
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [spinDuration, setSpinDuration] = useState(MIN_SPIN_DURATION);
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
    setRotation(0);
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    setRotation(0);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setRotation(0);
      setSpinning(false);
    }
    onOpenChange(nextOpen);
  }

  // Members still in the wheel: the pool minus whoever's draw already landed.
  const remaining = poolUids.filter((uid) => !draw.revealedLosers.includes(uid));
  const segAngle = remaining.length > 0 ? 360 / remaining.length : 360;

  function spin() {
    if (spinning || draw.gameOver || !draw.currentUid) return;
    const winnerIndex = remaining.indexOf(draw.currentUid);
    if (winnerIndex < 0) return;

    // The needle sits fixed at the top (0deg). Landing on segment `winnerIndex`
    // means rotating the wheel until that segment's midpoint sits at 0deg —
    // a little jitter inside the segment so it doesn't always land dead
    // center, several extra full turns for flourish, and always strictly
    // forward from the current rotation so the spin never looks like it
    // reverses.
    const targetMid = winnerIndex * segAngle + segAngle / 2 + randomJitterDegrees(segAngle * 0.3);
    const targetMod = ((-targetMid % 360) + 360) % 360;
    const base = rotation - (rotation % 360) + 360 * randomExtraSpins() + targetMod;
    setRotation(base <= rotation ? base + 360 : base);
    setSpinDuration(randomSpinDuration());
    setSpinning(true);
  }

  function handleSpinComplete() {
    if (!spinning) return;
    setSpinning(false);
    playLaughSound();
    draw.revealNext();
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const lastLoserUid = draw.revealedLosers[draw.revealedLosers.length - 1];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎡</span>
            {t("expenses.wheelTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.wheelIntro")}</DialogDescription>}
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
            countHint={t("expenses.wheelCountHint")}
            countIcon="🎡"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {spinning
                ? t("expenses.wheelSpinningLabel")
                : !draw.gameOver && lastLoserUid
                  ? t("expenses.wheelRoundResult", {
                      name: members[lastLoserUid].displayName,
                    })
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
                    {t("expenses.wheelRoundResult", { name: members[lastLoserUid].displayName })}
                  </p>
                </div>
              )
            )}

            <GameProgressPips
              revealedCount={draw.revealedCount}
              target={draw.losers.length}
              progressLabel={t("expenses.wheelProgress", {
                found: draw.revealedCount,
                target: draw.losers.length,
              })}
            />

            <div className="relative mx-auto flex items-center justify-center py-2">
              <div
                aria-hidden="true"
                className="border-t-primary absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-8 border-t-[14px] border-x-transparent drop-shadow"
              />
              <div
                className="shadow-e2 ring-foreground/10 relative rounded-full ring-1"
                style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
              >
                <motion.div
                  className="absolute inset-0 overflow-hidden rounded-full"
                  style={{
                    background: `conic-gradient(${remaining
                      .map((uid, index) => {
                        const from = (index * 360) / remaining.length;
                        const to = ((index + 1) * 360) / remaining.length;
                        return `${memberColor(members[uid].displayName)} ${from}deg ${to}deg`;
                      })
                      .join(", ")})`,
                  }}
                  animate={{ rotate: rotation }}
                  transition={
                    reduceMotion
                      ? { duration: 0 }
                      : { duration: spinDuration, ease: [0.1, 0.6, 0.1, 1] }
                  }
                  onAnimationComplete={handleSpinComplete}
                >
                  {remaining.map((uid, index) => {
                    const mid = (index + 0.5) * segAngle;
                    return (
                      <div
                        key={uid}
                        aria-hidden="true"
                        className="absolute inset-0 flex justify-center"
                        style={{ transform: `rotate(${mid}deg)` }}
                      >
                        <span className="mt-2.5 flex size-7 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white ring-1 ring-white/40">
                          {members[uid].displayName.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
                <div
                  aria-hidden="true"
                  className="ring-popover bg-foreground/80 absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
                />
              </div>
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
            <Button type="button" size="lg" className="flex-1" disabled={spinning} onClick={spin}>
              {draw.revealedCount > 0 ? t("expenses.wheelSpinAgain") : t("expenses.wheelSpin")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
