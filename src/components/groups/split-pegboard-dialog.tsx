"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { PEGBOARD_MAX_SLOTS, planBallPath } from "@/lib/games/pegboard";
import {
  BALL_RADIUS,
  BOARD_WIDTH,
  PEG_RADIUS,
  ballFlight,
  boardHeight,
  halfSlotX,
  pegPositions,
  pegY,
  slotTop,
  type BallFlight,
} from "@/lib/games/pegboard-layout";
import { secureShuffle } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import {
  playAppliedSound,
  playLaughSound,
  playReelStopSound,
  playStampSound,
  playTickSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** At least one person has to stay dry. */
function maxPegboardLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

interface Ball {
  id: number;
  flight: BallFlight;
  /** True once it has come to rest in its slot. */
  landed: boolean;
}

/** Avatar chip classes: smaller as the slots get narrower. */
function slotAvatarClass(slots: number): string {
  if (slots <= 6) return "size-8 text-xs";
  if (slots <= 9) return "size-6 text-[10px]";
  return "size-5 text-[9px]";
}

/**
 * Kugelfall ("ball drop"): every person has a slot at the bottom of a pegboard.
 * The ball is released at the top and bounces down through the pegs into a
 * slot; whoever's slot it lands in pays and their slot is plugged. Who it lands
 * on is decided first — `useSequentialDraw` draws the payers with crypto
 * randomness and the ball's path is invented backwards from that slot
 * (`lib/games/pegboard.ts`) — so the bounces are only staging and can't change
 * the result.
 */
export function SplitPegboardDialog({
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
  const setup = useGamePoolSetup(memberUids, maxPegboardLoserCount);
  const draw = useSequentialDraw();
  const [slotOrder, setSlotOrder] = useState<string[]>([]);
  const [ball, setBall] = useState<Ball | null>(null);
  const [flash, setFlash] = useState<{ id: number; uid: string } | null>(null);
  // Set once the last catch's takeover has come and gone — the verdict's cue.
  const [celebrated, setCelebrated] = useState(false);
  const idRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();

  useEffect(() => {
    // The same array for the component's whole lifetime — only ever pushed to.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function later(ms: number, action: () => void) {
    timersRef.current.push(setTimeout(action, ms));
  }

  function startGame() {
    clearTimers();
    // Who sits in which slot is shuffled, and independent of who gets caught.
    setSlotOrder(secureShuffle(setup.poolUids));
    draw.start(setup.poolUids, setup.loserCount);
    setBall(null);
    setFlash(null);
    setCelebrated(false);
    setStep("playing");
  }

  function goToSetup() {
    clearTimers();
    draw.reset();
    setSlotOrder([]);
    setBall(null);
    setFlash(null);
    setCelebrated(false);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) goToSetup();
    onOpenChange(nextOpen);
  }

  function land(caughtUid: string, droppedBall: Ball) {
    setBall({ ...droppedBall, landed: true });
    playReelStopSound();
    draw.revealNext();
    later(180, () => {
      playStampSound(STAMP_IMPACT_S);
      playLaughSound(STAMP_IMPACT_S + 0.1);
      shakeStage();
      idRef.current += 1;
      setFlash({ id: idRef.current, uid: caughtUid });
      later(CATCH_FLASH_HOLD_MS, () => {
        setFlash(null);
        setCelebrated(true);
      });
    });
  }

  function dropBall() {
    const caughtUid = draw.currentUid;
    if (!caughtUid || draw.gameOver || flash || (ball && !ball.landed)) return;
    const target = slotOrder.indexOf(caughtUid);
    if (target < 0) return;
    const path = planBallPath({ slots: slotOrder.length, target, random: Math.random });
    const flight = ballFlight(path, slotOrder.length);
    idRef.current += 1;
    const dropped: Ball = { id: idRef.current, flight, landed: false };
    setBall(dropped);
    if (reduceMotion) {
      land(caughtUid, dropped);
      return;
    }
    for (const seconds of flight.pegHitSec) later(seconds * 1000, playTickSound);
    later(flight.landSec * 1000 + 40, () => land(caughtUid, dropped));
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers);
    handleOpenChange(false);
  }

  const slots = slotOrder.length;
  const dropping = ball !== null && !ball.landed;
  const showVerdict = draw.gameOver && celebrated;
  const lastCaughtUid = draw.revealedLosers[draw.revealedLosers.length - 1];
  const tooMany = setup.poolUids.length > PEGBOARD_MAX_SLOTS;
  const height = slots > 0 ? boardHeight(slots) : 0;
  const avatarClass = slotAvatarClass(slots);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎱</span>
            {t("expenses.pegboardTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.pegboardIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-3">
            <GamePoolSetupStep
              memberUids={memberUids}
              members={members}
              poolUids={setup.poolUids}
              onTogglePoolMember={setup.togglePoolMember}
              loserCount={setup.loserCount}
              maxLoserCount={setup.maxLoserCount}
              onStepLoserCount={setup.stepLoserCount}
              stepperDirection={setup.stepperDirection}
              countHint={t("expenses.pegboardCountHint")}
              countIcon="🎱"
            />
            {tooMany && (
              <p role="alert" className="text-destructive text-sm">
                {t("expenses.pegboardTooMany", { max: PEGBOARD_MAX_SLOTS })}
              </p>
            )}
          </div>
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {dropping
                ? t("expenses.pegboardDroppingLabel")
                : !showVerdict && lastCaughtUid
                  ? t("expenses.pegboardRoundResult", {
                      name: members[lastCaughtUid].displayName,
                    })
                  : ""}
            </p>

            {showVerdict && <GameResultBanner loserUids={draw.losers} members={members} />}

            <GameProgressPips
              revealedCount={draw.revealedCount}
              target={draw.losers.length}
              progressLabel={t("expenses.pegboardProgress", {
                found: draw.revealedCount,
                target: draw.losers.length,
              })}
            />

            <div
              aria-hidden="true"
              className="relative mx-auto w-full max-w-[320px] rounded-2xl border-[6px] border-[#8a5a2b] bg-linear-to-b from-[#fff6df] to-[#f4dba8] shadow-[inset_0_2px_8px_rgb(80_40_0/0.3)]"
              style={{ aspectRatio: `${BOARD_WIDTH} / ${height}` }}
            >
              <svg viewBox={`0 0 ${BOARD_WIDTH} ${height}`} className="absolute inset-0 size-full">
                {pegPositions(slots).map((peg) => (
                  <circle
                    key={`${peg.row}-${peg.half}`}
                    cx={halfSlotX(peg.half, slots)}
                    cy={pegY(peg.row)}
                    r={PEG_RADIUS}
                    fill="#b8791f"
                  />
                ))}
                {Array.from({ length: slots + 1 }, (_, index) => (
                  <line
                    key={index}
                    x1={(index * BOARD_WIDTH) / slots}
                    x2={(index * BOARD_WIDTH) / slots}
                    y1={slotTop(slots)}
                    y2={height}
                    stroke="#8a5a2b"
                    strokeWidth={index === 0 || index === slots ? 0 : 3}
                  />
                ))}
                {slotOrder.map((uid, index) => {
                  const caught = draw.revealedLosers.includes(uid);
                  return caught ? (
                    <rect
                      key={uid}
                      x={(index * BOARD_WIDTH) / slots + 1.5}
                      y={slotTop(slots)}
                      width={BOARD_WIDTH / slots - 3}
                      height={height - slotTop(slots)}
                      fill="#b23a2a"
                      fillOpacity={0.22}
                    />
                  ) : null;
                })}
                {ball && (
                  <g key={ball.id}>
                    <motion.circle
                      r={BALL_RADIUS}
                      fill="#e0362c"
                      stroke="#7d1a12"
                      strokeWidth={1.5}
                      initial={{ cx: ball.flight.cx[0], cy: ball.flight.cy[0] }}
                      animate={
                        ball.landed || reduceMotion
                          ? {
                              cx: ball.flight.cx[ball.flight.cx.length - 1],
                              cy: ball.flight.cy[ball.flight.cy.length - 1],
                            }
                          : { cx: ball.flight.cx, cy: ball.flight.cy }
                      }
                      transition={
                        ball.landed || reduceMotion
                          ? { duration: 0 }
                          : {
                              cx: {
                                duration: ball.flight.durationSec,
                                times: ball.flight.times,
                                ease: "linear",
                              },
                              cy: {
                                duration: ball.flight.durationSec,
                                times: ball.flight.times,
                                ease: ball.flight.ease,
                              },
                            }
                      }
                    />
                  </g>
                )}
              </svg>
              {/* The slots' labels: a face per person, dimmed once they have been caught. */}
              <div
                className="absolute inset-x-0 bottom-0 flex"
                style={{ height: `${((height - slotTop(slots)) / height) * 100}%` }}
              >
                {slotOrder.map((uid) => {
                  const caught = draw.revealedLosers.includes(uid);
                  return (
                    <div
                      key={uid}
                      className="flex flex-1 flex-col items-center justify-end gap-0.5 pb-1.5"
                    >
                      <GameAvatar
                        name={members[uid].displayName}
                        className={cn(
                          avatarClass,
                          "transition-all duration-(--duration-base)",
                          caught && "opacity-50 grayscale",
                        )}
                      />
                      {caught && (
                        <span className="text-destructive text-[9px] leading-none font-bold">
                          {t("expenses.pegboardPaysTag")}
                        </span>
                      )}
                    </div>
                  );
                })}
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
                      {t("expenses.pegboardProgress", {
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
              disabled={setup.poolUids.length < 2 || tooMany}
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
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={!showVerdict}
                onClick={applyResult}
              >
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={dropping || flash !== null}
              onClick={dropBall}
            >
              {draw.revealedCount > 0
                ? t("expenses.pegboardDropAgain")
                : t("expenses.pegboardDrop")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
