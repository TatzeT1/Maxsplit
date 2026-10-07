"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
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
  duckMarkers,
  duckProgressAt,
  duckRaceCues,
  duckRaceLosers,
  maxDuckLoserCount,
  photoFinishFocus,
  planDuckRace,
  photoZoomAt,
  warpToRace,
  type DuckMarkers,
  type DuckPlan,
  type DuckRace,
  type DuckRaceCues,
} from "@/lib/games/duck-race";
import { HAPTIC_SHUTTER, vibrate } from "@/lib/games/haptics";
import { memberColor } from "@/lib/games/member-colors";
import { stakeShares, type GameStake } from "@/lib/games/payers";
import { secureShuffle } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { springs } from "@/lib/motion";
import {
  playAppliedSound,
  playDrumrollSound,
  playFuseTickSound,
  playGoSound,
  playQuackSound,
  playShutterSound,
  playSplashSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { DuckFigure } from "@/components/groups/split-game/duck-figure";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import {
  PRINT_DUCK_WIDTH,
  PhotoFinishPrint,
} from "@/components/groups/split-game/photo-finish-print";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";
type Phase = "ready" | "countdown" | "racing" | "done";

/**
 * The water's height: the stage's board budget (`--game-board-h`, less a row
 * for the finishing order), never below the old fixed 300 px nor so tall on
 * a desktop that a duck crawls. The ducks' travel is measured from the result.
 */
const COURSE_HEIGHT = "clamp(300px, calc(var(--game-board-h, 300px) - 40px), 520px)";
const MIN_COURSE_HEIGHT = 300;
/** The checkered finish band along the bottom of the course. */
const FINISH_BAND = 26;
/** Room above the ducks on the start line for a 🏮 or 👑 over the tail. */
const START_PAD = 14;
/** How far a finished duck's beak reaches into the finish band, in px. */
const FINISH_OVERLAP = 6;
/** One beat of "3 – 2 – 1", and how long "Platsch!" stays over the water once they're off. */
const COUNTDOWN_BEAT_MS = 620;
const SPLASH_HOLD_MS = 650;
/** From the last duck home to the first slip: long enough for the photo to drop and develop. */
const PHOTO_BEAT_MS = 1500;
/** Closest two quacks may sound, so a packed finish is a chorus rather than a buzz. */
const MIN_QUACK_GAP_MS = 140;
/** 🏮 and 👑 follow the picture about eight times a second — enough to hop, not enough to flicker. */
const MARKER_EVERY_MS = 125;
/** …and only once the field has spread out: on the start line "who's last" is noise. */
const MARKERS_FROM_SEC = 0.6;
/** The swim waggle, either way, in degrees. */
const WAGGLE_DEG = 7;

const NO_MARKERS: DuckMarkers = { leader: null, lanterns: [] };

function markersKey(markers: DuckMarkers): string {
  return `${markers.leader ?? ""}|${markers.lanterns.join(",")}`;
}

/** Duck width in px: smaller as the field grows, so a full table still fits across the water. */
function duckWidth(count: number): number {
  if (count <= 6) return 44;
  if (count <= 10) return 34;
  if (count <= 16) return 26;
  return 20;
}

/**
 * The swim waggle, on the race clock: it slows with the slow motion, eases in
 * off the start line and settles as the beak touches the finish.
 */
function waggleAt(plan: DuckPlan, lane: number, raceSec: number): number {
  if (raceSec <= 0 || raceSec >= plan.finishSec) return 0;
  const period = 0.7 + (lane % 3) * 0.12;
  const envelope = Math.min(1, raceSec / 0.4, (plan.finishSec - raceSec) / 0.3);
  return WAGGLE_DEG * envelope * Math.sin((2 * Math.PI * raceSec) / period + lane);
}

interface Staged {
  race: DuckRace;
  /** Everyone, first place to last. Decided before the race starts. */
  order: string[];
  /** Left-to-right lane of each duck — unrelated to how it finishes. */
  lanes: string[];
  losers: string[];
  /** The race's beats on the screen clock. */
  cues: DuckRaceCues;
  /** Where the finish camera zooms for the photo. */
  focus: { scale: number; originX: number };
}

/**
 * One duck in its lane. Its position and waggle are pure functions of the
 * shared race clock, so the whole field — slow motion included — moves off one
 * number and can't drift from the timers that quack the crossings.
 */
function RacingDuck({
  plan,
  clock,
  travel,
  lane,
  laneCount,
  width,
  name,
  marker,
  onQuack,
}: {
  plan: DuckPlan;
  clock: MotionValue<number>;
  travel: number;
  lane: number;
  laneCount: number;
  width: number;
  name: string;
  marker: "lantern" | "leader" | null;
  onQuack: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const y = useTransform(clock, (raceSec: number) => duckProgressAt(plan, raceSec) * travel);
  const rotate = useTransform(clock, (raceSec: number) => waggleAt(plan, lane, raceSec));
  const markerSize = Math.round(Math.min(Math.max(width * 0.5, 13), 20));

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${((lane + 0.5) / laneCount) * 100}%`,
        top: START_PAD,
        width,
        marginLeft: -width / 2,
        y,
        rotate,
      }}
    >
      <motion.button
        type="button"
        tabIndex={-1}
        onClick={onQuack}
        whileTap={{ scale: 1.3, rotate: 10 }}
        className="block touch-manipulation"
      >
        <DuckFigure
          color={memberColor(name)}
          initial={name.charAt(0).toUpperCase() || "?"}
          size={width}
        />
      </motion.button>
      <AnimatePresence>
        {marker && (
          <motion.span
            key={marker}
            className="pointer-events-none absolute left-1/2 block text-center leading-none"
            style={{
              top: -markerSize * 0.6,
              width: markerSize,
              marginLeft: -markerSize / 2,
              fontSize: markerSize,
            }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.4, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={
              reduceMotion
                ? { opacity: 0, transition: { duration: 0 } }
                : { opacity: 0, scale: 0.4, y: -8, transition: { duration: 0.15 } }
            }
            transition={reduceMotion ? { duration: 0 } : springs.snappy}
          >
            {marker === "lantern" ? "🏮" : "👑"}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Entenrennen ("the last duck pays"): everyone is a rubber duck in their own
 * colour, everyone watches the same phone. The finishing order is drawn with
 * `secureShuffle` before the gun goes off and the race only plays it out
 * (`lib/games/duck-race.ts` stages the overtakes), so cheering — tapping a
 * duck makes it quack — is pure fun and can't change who pays.
 *
 * The staging: "3 – 2 – 1 – Platsch!", then a 🏮 over whoever would pay if
 * the race ended now and a 👑 over the leader, both following the picture;
 * the last safe duck and the first payer come in neck and neck, the clock
 * drops into slow motion and the camera zooms in on them, a flash and a
 * shutter take the "Fotofinish", which stays on the water as a print, and
 * then every payer gets their slip. Every beat — the timers below and the
 * frame loop that moves the ducks — reads the same plan on the same warped
 * clock (`duckRaceCues`), so the quacks land on the crossings.
 */
export function SplitDuckRaceDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  groupId,
  stake,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Keys the setup remembered on this device (`game-memory.ts`). */
  groupId?: string;
  /** The bill being played for — each payer's share goes on their slip and in the verdict. */
  stake?: GameStake | null;
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
  /** 3, 2, 1 — then 0 for "Platsch!"; `null` when nothing is counting. */
  const [countdown, setCountdown] = useState<number | null>(null);
  const [markers, setMarkers] = useState<DuckMarkers>(NO_MARKERS);
  const [slowMotion, setSlowMotion] = useState(false);
  /** Counts the camera's flashes: keys the white-out, 0 before the photo. */
  const [flashes, setFlashes] = useState(0);
  const [printed, setPrinted] = useState(false);
  /** When the gun went, for the frame loop; `null` while nothing swims. */
  const [run, setRun] = useState<{ startedAt: number } | null>(null);
  const [courseHeight, setCourseHeight] = useState(MIN_COURSE_HEIGHT);
  const raceClock = useMotionValue(0);
  const zoom = useMotionValue(0);
  const zoomScale = useTransform(
    zoom,
    (amount: number) => 1 + ((staged?.focus.scale ?? 1) - 1) * amount,
  );
  const lastQuackRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, catches] = useCatchFlashes();

  useEffect(() => {
    // The same array for the component's whole lifetime — pushed to and
    // emptied in place, never replaced, so this cleanup sees every timer.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  // The frame loop: the race clock (warped — slow motion is just the clock
  // running slower), the camera's zoom and, about eight times a second, the
  // 🏮/👑. It runs from the gun until the camera has pulled back out; the
  // markers stop at the finish. Resetting the race clears `run`, which ends it.
  useEffect(() => {
    if (!run || !staged) return;
    const { race, cues, lanes, losers } = staged;
    let frame = 0;
    let markersAt = -Infinity;
    let shown = markersKey(NO_MARKERS);
    const tick = (now: number) => {
      const realSec = Math.max(now - run.startedAt, 0) / 1000;
      const raceSec = Math.min(warpToRace(race.warp, realSec), race.totalSec);
      raceClock.set(raceSec);
      zoom.set(photoZoomAt(cues, realSec));
      if (raceSec < race.totalSec && now - markersAt >= MARKER_EVERY_MS) {
        markersAt = now;
        const next =
          raceSec >= MARKERS_FROM_SEC
            ? duckMarkers(race, raceSec, lanes, losers.length)
            : NO_MARKERS;
        const key = markersKey(next);
        if (key !== shown) {
          shown = key;
          setMarkers(next);
        }
      }
      if (realSec < cues.settledSec) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, staged, raceClock, zoom]);

  /** The course's real height, so the ducks swim all the way down on a tall phone. */
  const measureCourse = useCallback((node: HTMLDivElement | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setCourseHeight(Math.max(Math.round(entry.contentRect.height), MIN_COURSE_HEIGHT));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
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
    setCountdown(null);
    setMarkers(NO_MARKERS);
    setSlowMotion(false);
    setFlashes(0);
    setPrinted(false);
    setRun(null);
    raceClock.set(0);
    zoom.set(0);
    catches.cancel();
  }

  function startGame() {
    startRound();
    setup.remember();
    // Decide first, animate after: the order is fixed before anything moves.
    const order = secureShuffle(setup.poolUids);
    const losers = duckRaceLosers(order, setup.loserCount);
    const lanes = secureShuffle(setup.poolUids);
    const race = planDuckRace(order, Math.random, losers.length);
    const focus = race.photo
      ? photoFinishFocus(
          lanes.length,
          lanes.indexOf(race.photo.safeUid),
          lanes.indexOf(race.photo.payerUid),
        )
      : { scale: 1, originX: 0.5 };
    setStaged({ order, lanes, losers, race, cues: duckRaceCues(race), focus });
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

  /**
   * Every payer gets a slip of their own, in the order they crossed the line,
   * so the last duck — the one everybody was watching — comes last, as the
   * finale. (`losers` runs last place first, hence the reverse.) The photo
   * goes first: the slips wait for the print to develop.
   */
  function finishRace(plan: Staged) {
    raceClock.set(plan.race.totalSec);
    setFinished(plan.order);
    setMarkers(duckMarkers(plan.race, plan.race.totalSec, plan.lanes, plan.losers.length));
    setPhase("done");
    setPrinted(true);
    catches.catchEach([...plan.losers].reverse(), { delayMs: PHOTO_BEAT_MS });
  }

  /** "Platsch!": the gun. Everything after it is scheduled off the plan's screen clock. */
  function go(plan: Staged) {
    const { cues } = plan;
    setCountdown(0);
    later(SPLASH_HOLD_MS, () => setCountdown(null));
    playSplashSound();
    playGoSound();
    setPhase("racing");
    setRun({ startedAt: performance.now() });
    for (const { uid, atSec } of cues.finishes) {
      later(atSec * 1000, () => {
        setFinished((current) => [...current, uid]);
        quack();
      });
    }
    const photo = cues.photo;
    if (photo) {
      later(photo.slowFromSec * 1000, () => {
        setSlowMotion(true);
        playDrumrollSound(photo.flashSec - photo.slowFromSec - 0.05);
      });
      later(photo.flashSec * 1000, () => {
        setFlashes((count) => count + 1);
        playShutterSound();
        vibrate(HAPTIC_SHUTTER);
      });
      later(photo.slowToSec * 1000, () => setSlowMotion(false));
    }
    later(cues.endSec * 1000 + 50, () => finishRace(plan));
  }

  function startRace() {
    if (!staged || phase !== "ready") return;
    if (reduceMotion) {
      // No countdown, no swimming, no slow motion: the result and the photo
      // are already on the board — the shutter still says a photo was taken.
      playShutterSound();
      finishRace(staged);
      return;
    }
    // The first beat inside the tap, so iOS lets the audio start.
    setPhase("countdown");
    setCountdown(3);
    playFuseTickSound(3);
    later(COUNTDOWN_BEAT_MS, () => {
      setCountdown(2);
      playFuseTickSound(2);
    });
    later(COUNTDOWN_BEAT_MS * 2, () => {
      setCountdown(1);
      playFuseTickSound(1);
    });
    const plan = staged;
    later(COUNTDOWN_BEAT_MS * 3, () => go(plan));
  }

  function applyResult() {
    if (!staged) return;
    playAppliedSound();
    onResolve(staged.losers, setup.poolUids);
    handleOpenChange(false);
  }

  const done = phase === "done";
  // The verdict waits for the last payer's slip to clear, as the wheel's does.
  const showVerdict = done && !catches.active && staged !== null;
  const flash = catches.flash;
  const shares = staged ? stakeShares(stake, staged.losers) : null;
  const count = staged?.order.length ?? 0;
  const width = duckWidth(count);
  const duckHeight = (width * 60) / 48;
  // The beak ends up a few px over the checkered band, so "crossed the line" reads as a crossing.
  const travel = courseHeight - FINISH_BAND - START_PAD - duckHeight + FINISH_OVERLAP;
  const photo = staged?.race.photo ?? null;
  const nameOf = (uid: string) => members[uid].displayName;
  // The payer's distance from the line in the frame, scaled to the print — never less than the eye needs.
  const printGap = photo
    ? Math.min(Math.max((1 - photo.payerProgress) * travel * (PRINT_DUCK_WIDTH / width), 6), 20)
    : 0;
  const showSlowMotion = slowMotion && phase === "racing";

  let liveText = "";
  if (done && flash) {
    liveText = flash.finale
      ? t("expenses.duckRaceLastLabel", { name: nameOf(flash.uid) })
      : t("expenses.gameCaughtLabel", { name: nameOf(flash.uid) });
  } else if (photo && (flashes > 0 || printed) && (phase === "racing" || catches.active)) {
    liveText = t("expenses.duckRacePhotoLabel", {
      safe: nameOf(photo.safeUid),
      payer: nameOf(photo.payerUid),
    });
  } else if (phase === "racing") {
    liveText = t("expenses.duckRaceRunningLabel");
  } else if (phase === "countdown") {
    liveText = t("expenses.duckRaceCountdownLabel");
  }

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
              {liveText}
            </p>

            {showVerdict && (
              <GameResultBanner loserUids={staged.losers} members={members} stake={stake} />
            )}

            <div
              ref={measureCourse}
              aria-hidden="true"
              className="relative overflow-hidden rounded-xl border border-sky-700/30 bg-sky-400"
              style={{ height: COURSE_HEIGHT }}
            >
              {/* The water itself is what the finish camera zooms — never the stage, or the slips' fixed layers would be trapped under a transform. */}
              <motion.div
                className="absolute inset-0 bg-linear-to-b from-sky-300 to-sky-500"
                style={{
                  scale: zoomScale,
                  transformOrigin: `${staged.focus.originX * 100}% ${courseHeight - FINISH_BAND}px`,
                }}
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
                {staged.race.ducks.map((plan) => (
                  <RacingDuck
                    key={plan.uid}
                    plan={plan}
                    clock={raceClock}
                    travel={travel}
                    lane={staged.lanes.indexOf(plan.uid)}
                    laneCount={count}
                    width={width}
                    name={nameOf(plan.uid)}
                    marker={
                      markers.lanterns.includes(plan.uid)
                        ? "lantern"
                        : markers.leader === plan.uid
                          ? "leader"
                          : null
                    }
                    onQuack={quack}
                  />
                ))}
              </motion.div>

              {/* Slow motion: the finish camera's viewfinder over the water. */}
              <AnimatePresence>
                {showSlowMotion && (
                  <motion.div
                    className="pointer-events-none absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%,transparent_50%,oklch(0.2_0.05_250/0.45)_100%)]" />
                    <span className="absolute top-2.5 left-2.5 size-5 border-t-2 border-l-2 border-white/85" />
                    <span className="absolute top-2.5 right-2.5 size-5 border-t-2 border-r-2 border-white/85" />
                    <span className="absolute bottom-2.5 left-2.5 size-5 border-b-2 border-l-2 border-white/85" />
                    <span className="absolute right-2.5 bottom-2.5 size-5 border-r-2 border-b-2 border-white/85" />
                    <span className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-white uppercase">
                      <span className="size-2 animate-pulse rounded-full bg-red-500" />
                      {t("expenses.duckRaceSlowMotion")}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 3 – 2 – 1 – Platsch! */}
              <AnimatePresence>
                {countdown !== null && (
                  <motion.span
                    key={countdown}
                    className={cn(
                      "font-heading pointer-events-none absolute inset-0 flex items-center justify-center font-black text-white",
                      countdown > 0 ? "text-8xl" : "text-5xl",
                    )}
                    style={{
                      textShadow: "0 3px 0 rgb(12 74 110 / 0.6), 0 0 22px rgb(12 74 110 / 0.35)",
                    }}
                    initial={{ opacity: 0, scale: 1.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.14 } }}
                    transition={{ duration: 0.3, ease: [0.2, 0.9, 0.3, 1] }}
                  >
                    {countdown === 0 && (
                      <span className="animate-settle-ring absolute size-44 rounded-full border-4 border-white/80" />
                    )}
                    {countdown > 0 ? countdown : t("expenses.duckRaceSplash")}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* The camera's flash: one white-out, fading. */}
              {flashes > 0 && (
                <motion.span
                  key={flashes}
                  className="pointer-events-none absolute inset-0 bg-white"
                  initial={{ opacity: 0.95 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              )}

              {printed && photo && (
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <PhotoFinishPrint
                    safeName={nameOf(photo.safeUid)}
                    payerName={nameOf(photo.payerUid)}
                    gapPx={printGap}
                    payerOnLeft={
                      staged.lanes.indexOf(photo.payerUid) < staged.lanes.indexOf(photo.safeUid)
                    }
                  />
                </div>
              )}
            </div>

            {finished.length > 0 ? (
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
                      <GameAvatar name={nameOf(uid)} className="size-5 text-[10px]" />
                      <span className="max-w-[7rem] truncate">{nameOf(uid)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {t("expenses.duckRaceLegend")}
              </p>
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={nameOf(flash.uid)}
                  stampLabel={
                    flash.finale ? t("expenses.duckRaceLastStamp") : t("expenses.gameCaughtStamp")
                  }
                  finale={flash.finale}
                  caption={
                    <CatchCaption
                      share={shares?.[flash.uid]}
                      stake={stake}
                      detail={
                        flash.finale
                          ? t("expenses.duckRaceLastCaption", { place: staged.order.length })
                          : t("expenses.duckRacePlaceCaption", {
                              place: staged.order.indexOf(flash.uid) + 1,
                              count: staged.order.length,
                            })
                      }
                    />
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
              disabled={phase !== "ready"}
              onClick={startRace}
            >
              {phase === "countdown"
                ? t("expenses.duckRaceCountdown")
                : phase === "racing"
                  ? t("expenses.duckRaceRunning")
                  : t("expenses.duckRaceStart")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
