"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  type ResolvedValues,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
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
import { memberColor, memberInk } from "@/lib/games/member-colors";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import {
  playAppliedSound,
  playLaughSound,
  playStampSound,
  playTickSound,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
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
/** How far the flapper kicks back when a peg flicks past it, in degrees. Negative: pegs travel left-to-right across the top. */
const FLAPPER_KICK_DEG = -24;
/** Closest two peg clicks may sound, so a fast spin reads as a ratchet rather than a buzz. */
const MIN_TICK_GAP_MS = 45;

interface FlashState {
  id: number;
  uid: string;
}

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
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashIdRef = useRef(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Which wedge boundary the flapper last clicked past, and when — refs
  // because they're read and written from the per-frame rotation callback.
  const lastPegRef = useRef(0);
  const lastTickAtRef = useRef(0);
  const flapperRotate = useMotionValue(0);
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
    setRotation(0);
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    setRotation(0);
    clearFlash();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setRotation(0);
      setSpinning(false);
      clearFlash();
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
    clearFlash();
    lastPegRef.current = Math.floor(rotation / segAngle);
  }

  /**
   * The flapper: every time a wedge boundary passes under the needle, the
   * peg there flicks it sideways and it springs back, with a dry click. The
   * wheel rotates clockwise and the needle is fixed at 0deg, so the wedge
   * under it changes exactly when the rotation crosses a multiple of the
   * wedge angle. Presentation only: it reads the rotation, never sets it.
   */
  function handleSpinUpdate(latest: ResolvedValues) {
    if (!spinning || reduceMotion) return;
    const current = Number(latest.rotate);
    if (!Number.isFinite(current)) return;
    const peg = Math.floor(current / segAngle);
    if (peg === lastPegRef.current) return;
    lastPegRef.current = peg;
    animate(flapperRotate, [FLAPPER_KICK_DEG, 0], { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] });
    const now = performance.now();
    if (now - lastTickAtRef.current >= MIN_TICK_GAP_MS) {
      lastTickAtRef.current = now;
      playTickSound();
    }
  }

  function handleSpinComplete() {
    if (!spinning) return;
    const caughtUid = draw.currentUid;
    setSpinning(false);
    playStampSound(STAMP_IMPACT_S);
    playLaughSound(STAMP_IMPACT_S + 0.1);
    draw.revealNext();
    if (!reduceMotion) {
      // The flapper's last, lazy wobble as the wheel comes to rest on it.
      animate(flapperRotate, [FLAPPER_KICK_DEG * 0.6, 7, -3, 0], { duration: 0.6 });
    }
    if (!caughtUid) return;
    shakeStage();
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, uid: caughtUid });
    flashTimeoutRef.current = setTimeout(() => setFlash(null), CATCH_FLASH_HOLD_MS);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const lastLoserUid = draw.revealedLosers[draw.revealedLosers.length - 1];
  // The verdict waits for the last catch's takeover to clear, as the
  // lottery's does — otherwise its bloom and rise play out hidden behind it.
  const showVerdict = draw.gameOver && flash === null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        x-clipped: the impact shake jolts the play area sideways, and without
        this the scrim and cards would briefly overhang the scroll box and
        flash a horizontal scrollbar.
      */}
      <DialogContent className="overflow-x-hidden sm:max-w-md">
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
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {spinning
                ? t("expenses.wheelSpinningLabel")
                : !showVerdict && lastLoserUid
                  ? t("expenses.wheelRoundResult", {
                      name: members[lastLoserUid].displayName,
                    })
                  : ""}
            </p>

            {showVerdict ? (
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

            {/*
              A printed paper wheel on a card mount, not a roulette table:
              flat wedges in each person's color, cream divider lines with a
              peg at each rim, cream name chips printed in the person's own
              ink, and a hub that shows whoever the wheel last caught.
            */}
            <div className="relative mx-auto flex items-center justify-center pt-5 pb-2">
              <motion.svg
                aria-hidden="true"
                viewBox="0 0 24 36"
                className="absolute top-0 left-1/2 z-10 h-9 w-6 -translate-x-1/2 drop-shadow-[0_2px_2px_color-mix(in_oklch,var(--foreground)_30%,transparent)]"
                style={{ rotate: flapperRotate, transformOrigin: "50% 10px" }}
              >
                <path d="M12 35 L4.5 14 A8.5 8.5 0 1 1 19.5 14 Z" fill="var(--primary)" />
                <circle cx="12" cy="10" r="3" fill="var(--primary-foreground)" />
              </motion.svg>
              <div
                className="bg-card shadow-e2 ring-foreground/10 relative rounded-full p-1.5 ring-1"
                style={{ width: WHEEL_SIZE + 12, height: WHEEL_SIZE + 12 }}
              >
                <motion.div
                  className="absolute inset-1.5 overflow-hidden rounded-full"
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
                  onUpdate={handleSpinUpdate}
                  onAnimationComplete={handleSpinComplete}
                >
                  {remaining.length > 1 &&
                    remaining.map((uid, index) => (
                      <div
                        key={`divider-${uid}`}
                        aria-hidden="true"
                        className="absolute inset-0 flex justify-center"
                        style={{ transform: `rotate(${index * segAngle}deg)` }}
                      >
                        <span className="bg-card/85 relative h-1/2 w-0.5">
                          <span className="bg-card ring-foreground/20 shadow-e1 absolute top-1 left-1/2 size-2.5 -translate-x-1/2 rounded-full ring-1" />
                        </span>
                      </div>
                    ))}
                  {remaining.map((uid, index) => {
                    const mid = (index + 0.5) * segAngle;
                    const name = members[uid].displayName;
                    return (
                      <div
                        key={uid}
                        aria-hidden="true"
                        className="absolute inset-0 flex justify-center"
                        style={{ transform: `rotate(${mid}deg)` }}
                      >
                        <span
                          className="bg-card shadow-e1 mt-4 flex size-7 items-center justify-center rounded-full text-xs font-bold"
                          style={{ color: memberInk(name) }}
                        >
                          {name.charAt(0).toUpperCase() || "?"}
                        </span>
                      </div>
                    );
                  })}
                </motion.div>
                <div
                  aria-hidden="true"
                  className="bg-card shadow-e2 ring-foreground/10 absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full ring-1"
                >
                  {lastLoserUid && !spinning ? (
                    <span key={lastLoserUid} className="animate-laugh-land block rounded-full">
                      <GameAvatar
                        name={members[lastLoserUid].displayName}
                        className="size-9 text-sm"
                      />
                    </span>
                  ) : (
                    <span className="bg-primary size-2.5 rounded-full" />
                  )}
                </div>
              </div>
            </div>

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.gameCaughtStamp")}
                  finale={draw.gameOver}
                  caption={
                    <span className="text-muted-foreground text-sm font-medium">
                      {t("expenses.wheelProgress", {
                        found: draw.revealedCount,
                        target: draw.losers.length,
                      })}
                    </span>
                  }
                />
              )}
            </AnimatePresence>
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
