"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useGameRound } from "@/components/groups/split-game/game-round";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { useT } from "@/components/locale-provider";
import {
  DUCK_PROGRESS_STEPS,
  duckRaceLosers,
  maxDuckLoserCount,
  planDuckRace,
  type DuckRace,
} from "@/lib/games/duck-race";
import { memberColor } from "@/lib/games/member-colors";
import { secureShuffle } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import {
  playAppliedSound,
  playGoSound,
  playLaughSound,
  playQuackSound,
  playSplashSound,
  playStampSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { DuckFigure } from "@/components/groups/split-game/duck-figure";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";
type Phase = "ready" | "racing" | "done";

/** Height of the water, in px — the ducks' travel is computed from it. */
const COURSE_HEIGHT = 300;
/** The checkered finish band along the bottom of the course. */
const FINISH_BAND = 26;
const START_PAD = 8;
/** How far a finished duck's beak reaches into the finish band, in px. */
const FINISH_OVERLAP = 6;
/** A beat between the last duck crossing the line and the "caught" takeover. */
const FINISH_BEAT_MS = 700;
/** Closest two quacks may sound, so a packed finish is a chorus rather than a buzz. */
const MIN_QUACK_GAP_MS = 140;

/** Duck width in px: smaller as the field grows, so a full table still fits across the water. */
function duckWidth(count: number): number {
  if (count <= 6) return 44;
  if (count <= 10) return 34;
  if (count <= 16) return 26;
  return 20;
}

interface Staged {
  race: DuckRace;
  /** Everyone, first place to last. Decided before the race starts. */
  order: string[];
  /** Left-to-right lane of each duck — unrelated to how it finishes. */
  lanes: string[];
  losers: string[];
}

/**
 * Entenrennen ("the last duck pays"): everyone is a rubber duck in their own
 * colour, everyone watches the same phone. The finishing order is drawn with
 * `secureShuffle` before the gun goes off and the race only plays it out
 * (`lib/games/duck-race.ts` stages the overtakes), so cheering — tapping a
 * duck makes it quack — is pure fun and can't change who pays.
 */
export function SplitDuckRaceDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  groupId,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Keys the setup remembered on this device (`game-memory.ts`). */
  groupId?: string;
  /** Who pays, and everyone who played (stored on the expense). */
  onResolve: (loserUids: string[], playerUids: string[]) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const setup = useGamePoolSetup(memberUids, maxDuckLoserCount, groupId);
  const { startRound } = useGameRound();
  const [staged, setStaged] = useState<Staged | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [finished, setFinished] = useState<string[]>([]);
  const [flash, setFlash] = useState<{ id: number; uid: string } | null>(null);
  // Set once the last-place takeover has come and gone — the verdict's cue.
  const [celebrated, setCelebrated] = useState(false);
  const idRef = useRef(0);
  const lastQuackRef = useRef(0);
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

  function quack() {
    const now = performance.now();
    if (now - lastQuackRef.current < MIN_QUACK_GAP_MS) return;
    lastQuackRef.current = now;
    playQuackSound();
  }

  function resetRace() {
    clearTimers();
    setPhase("ready");
    setFinished([]);
    setFlash(null);
    setCelebrated(false);
  }

  function startGame() {
    startRound();
    setup.remember();
    // Decide first, animate after: the order is fixed before anything moves.
    const order = secureShuffle(setup.poolUids);
    const losers = duckRaceLosers(order, setup.loserCount);
    setStaged({
      order,
      lanes: secureShuffle(setup.poolUids),
      losers,
      race: planDuckRace(order, Math.random),
    });
    resetRace();
    setStep("playing");
  }

  function goToSetup() {
    resetRace();
    setStaged(null);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetRace();
      setStaged(null);
      setStep("setup");
    }
    onOpenChange(nextOpen);
  }

  function celebrateLastPlace(plan: Staged) {
    later(FINISH_BEAT_MS, () => {
      playStampSound(STAMP_IMPACT_S);
      playLaughSound(STAMP_IMPACT_S + 0.1);
      shakeStage();
      idRef.current += 1;
      setFlash({ id: idRef.current, uid: plan.losers[0] });
      later(CATCH_FLASH_HOLD_MS, () => {
        setFlash(null);
        setCelebrated(true);
      });
    });
  }

  function startRace() {
    if (!staged || phase !== "ready") return;
    if (reduceMotion) {
      // No swimming to watch: the result is already on the board.
      setFinished(staged.order);
      setPhase("done");
      celebrateLastPlace(staged);
      return;
    }
    playSplashSound();
    playGoSound();
    setPhase("racing");
    for (const duck of staged.race.ducks) {
      later(duck.finishSec * 1000, () => {
        setFinished((current) => [...current, duck.uid]);
        quack();
      });
    }
    later(staged.race.totalSec * 1000 + 50, () => {
      setPhase("done");
      celebrateLastPlace(staged);
    });
  }

  function applyResult() {
    if (!staged) return;
    playAppliedSound();
    onResolve(staged.losers, setup.poolUids);
    handleOpenChange(false);
  }

  const done = phase === "done";
  // The verdict waits for the takeover to clear, as the wheel's does.
  const showVerdict = done && celebrated && staged !== null;
  const count = staged?.order.length ?? 0;
  const width = duckWidth(count);
  // The beak ends up a few px over the checkered band, so "crossed the line" reads as a crossing.
  const travel = COURSE_HEIGHT - FINISH_BAND - START_PAD - (width * 60) / 48 + FINISH_OVERLAP;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🦆</span>
            {t("expenses.duckRaceTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.duckRaceIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" || !staged ? (
          <GamePoolSetupStep
            memberUids={memberUids}
            members={members}
            poolUids={setup.poolUids}
            onTogglePoolMember={setup.togglePoolMember}
            loserCount={setup.loserCount}
            maxLoserCount={setup.maxLoserCount}
            onStepLoserCount={setup.stepLoserCount}
            stepperDirection={setup.stepperDirection}
            countHint={t("expenses.duckRaceCountHint")}
            countIcon="🦆"
          />
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {done && flash
                ? t("expenses.duckRaceLastLabel", {
                    name: members[staged.losers[0]].displayName,
                  })
                : phase === "racing"
                  ? t("expenses.duckRaceRunningLabel")
                  : ""}
            </p>

            {showVerdict && <GameResultBanner loserUids={staged.losers} members={members} />}

            <div
              aria-hidden="true"
              className="relative overflow-hidden rounded-xl border border-sky-700/30 bg-linear-to-b from-sky-300 to-sky-500"
              style={{ height: COURSE_HEIGHT }}
            >
              {/* ripples */}
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(ellipse 14px 4px at 14px 10px, #fff 99%, transparent 100%), radial-gradient(ellipse 14px 4px at 42px 34px, #fff 99%, transparent 100%)",
                  backgroundSize: "56px 48px",
                }}
              />
              {/* the finish line */}
              <div
                className="absolute inset-x-0 bottom-0 border-t-2 border-black/70"
                style={{
                  height: FINISH_BAND,
                  backgroundImage: "repeating-conic-gradient(#14110f 0% 25%, #ffffff 0% 50%)",
                  backgroundSize: "16px 16px",
                }}
              />
              {staged.race.ducks.map((plan) => {
                const name = members[plan.uid].displayName;
                const lane = staged.lanes.indexOf(plan.uid);
                const swimming = phase === "racing" && !finished.includes(plan.uid);
                return (
                  <motion.div
                    key={plan.uid}
                    className="absolute"
                    style={{
                      left: `${((lane + 0.5) / count) * 100}%`,
                      top: START_PAD,
                      width,
                      marginLeft: -width / 2,
                    }}
                    initial={{ y: 0 }}
                    animate={{
                      y:
                        phase === "ready"
                          ? 0
                          : reduceMotion || done
                            ? travel
                            : plan.progress.map((progress) => progress * travel),
                    }}
                    transition={
                      phase === "racing" && !reduceMotion
                        ? {
                            duration: plan.finishSec,
                            ease: "linear",
                            times: Array.from(
                              { length: DUCK_PROGRESS_STEPS + 1 },
                              (_, index) => index / DUCK_PROGRESS_STEPS,
                            ),
                          }
                        : { duration: 0 }
                    }
                  >
                    <motion.button
                      type="button"
                      tabIndex={-1}
                      onClick={quack}
                      whileTap={{ scale: 1.3, rotate: 10 }}
                      animate={swimming ? { rotate: [-7, 7, -7] } : { rotate: 0 }}
                      transition={
                        swimming
                          ? {
                              repeat: Infinity,
                              duration: 0.7 + (lane % 3) * 0.12,
                              ease: "easeInOut",
                            }
                          : { duration: 0.2 }
                      }
                      className="block touch-manipulation"
                    >
                      <DuckFigure
                        color={memberColor(name)}
                        initial={name.charAt(0).toUpperCase() || "?"}
                        size={width}
                      />
                    </motion.button>
                  </motion.div>
                );
              })}
            </div>

            {finished.length > 0 && (
              <ol
                aria-label={t("expenses.duckRaceRanking")}
                className="flex flex-wrap items-center gap-1.5"
              >
                {finished.map((uid, index) => {
                  const pays = done && staged.losers.includes(uid);
                  return (
                    <li
                      key={uid}
                      className={cn(
                        "animate-rise inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-1 text-xs font-medium",
                        pays
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "bg-muted/40",
                      )}
                    >
                      <span className="text-muted-foreground tabular-money min-w-4 text-center">
                        {index + 1}
                      </span>
                      <GameAvatar name={members[uid].displayName} className="size-5 text-[10px]" />
                      <span className="max-w-[7rem] truncate">{members[uid].displayName}</span>
                    </li>
                  );
                })}
              </ol>
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.duckRaceLastStamp")}
                  finale
                  caption={
                    <span className="text-muted-foreground text-sm font-medium">
                      {t("expenses.duckRaceLastCaption", { place: staged.order.length })}
                    </span>
                  }
                />
              )}
            </AnimatePresence>
          </div>
        )}

        <DialogFooter>
          {step === "setup" || !staged ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={setup.poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.gameStart")}
            </Button>
          ) : done ? (
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
              disabled={phase === "racing"}
              onClick={startRace}
            >
              {phase === "racing" ? t("expenses.duckRaceRunning") : t("expenses.duckRaceStart")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
