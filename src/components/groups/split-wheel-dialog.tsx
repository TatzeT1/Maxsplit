"use client";

import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
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
import { GameDialogContent, StageScale } from "@/components/groups/split-game/game-stage";
import { useT } from "@/components/locale-provider";
import { memberColor, memberInk } from "@/lib/games/member-colors";
import { maxPayerCount, stakeShares, type GameStake } from "@/lib/games/payers";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import {
  NAIL_BITER_CHANCE,
  WHEEL_NAME_MAX_WEDGES,
  buttonSwing,
  classifyRelease,
  firstName,
  flapperLeanAt,
  flickVelocity,
  angleDelta,
  originAfterLeaving,
  pegIndexAt,
  planWheelSpin,
  pointerAngle,
  wedgeNameWidth,
  wedgeUnderNeedle,
  wheelFace,
  wheelRotationAt,
  type FlickSample,
  type LeavingWedge,
  type WheelLayout,
  type WheelSpinPlan,
} from "@/lib/games/wheel-plan";
import {
  playAppliedSound,
  playDrumrollSound,
  playMissSound,
  playTickSound,
  primeGameSounds,
} from "@/lib/sound/game-sounds";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import type { GroupMember } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "setup" | "playing";
type Timer = ReturnType<typeof setTimeout>;

/** Wheel diameter in px. */
const WHEEL_SIZE = 240;
const WHEEL_RADIUS = WHEEL_SIZE / 2;
/** The rim pegs' centres, this far from the hub (the boundary pegs sit at the dividers' rim ends). */
const PEG_RADIUS = WHEEL_RADIUS - 9;
/** Where a name chip's inner edge sits: 16px in from the rim, 24px tall. */
const NAME_INNER_RADIUS = WHEEL_RADIUS - 16 - 24;
/** How far the flapper kicks back when a peg flicks past it, in degrees. Negative: pegs travel left-to-right across the top on a clockwise turn. */
const FLAPPER_KICK_DEG = -24;
/** Closest two peg clicks may sound, so a fast spin reads as a ratchet rather than a buzz. */
const MIN_TICK_GAP_MS = 45;
/** Nearer the hub than this share of the radius, a finger's angle jumps about too much to steer by. */
const GRAB_MIN_RADIUS_SHARE = 0.25;
/** How long the caught wedge takes to close up once its slip has cleared. */
const SHRINK_SEC = 0.55;
/** How long "Zu lasch!" stays up after a weak flick. */
const TOO_WEAK_MS = 1600;

/** The click throttle's clock. Read from pointer events and the frame loop, never while rendering. */
function nowMs(): number {
  return performance.now();
}

/** A finger (or mouse) turning the wheel. */
interface Drag {
  pointerId: number;
  centreX: number;
  centreY: number;
  minRadius: number;
  /** The pointer's last usable angle; `null` while it is over the hub. */
  lastAngle: number | null;
  /** The rotation the drag began at. */
  start: number;
  /** Degrees turned so far, signed. */
  dragged: number;
  samples: FlickSample[];
}

/** The caught wedge, still on the disc until it has closed up; with the face it is leaving. */
interface Leaving extends LeavingWedge {
  uids: string[];
  origin: number;
}

/**
 * Glücksrad ("who pays" wheel): one spin per draw, landing on a member of
 * whoever's still left in the wheel. The draw order is fixed up front by
 * `useSequentialDraw` (same engine the scratch cards use) — the spin only
 * reveals it, it never decides it, so a flick, the button and a skipped
 * animation (`prefers-reduced-motion`) all end on the same person.
 *
 * The wheel is thrown by hand: a drag turns it, a flick spins it, and the
 * swing sets how long and how far it goes (`lib/games/wheel-plan.ts` plans
 * the spin so it still ends in the drawn wedge). A ring of rim pegs ratchets
 * past the flapper, about one spin in four hangs on the peg before the drawn
 * wedge, and the caught wedge closes up under the needle.
 */
export function SplitWheelDialog({
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
  const { startRound } = useGameRound();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  // Everyone but one at most: with everyone paying, the last spin would have
  // a single wedge and nothing left to decide.
  const setup = useGamePoolSetup(memberUids, maxPayerCount, groupId);
  const poolUids = setup.poolUids;
  const rotation = useMotionValue(0);
  const flapperRotate = useMotionValue(0);
  const [spinning, setSpinning] = useState(false);
  /** Where the settled wedges start on the disc: moves when a caught wedge closes up. */
  const [origin, setOrigin] = useState(0);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  /** Keys "Zu lasch!" (0 when it isn't up), so a second weak flick shakes it again. */
  const [tooWeak, setTooWeak] = useState(0);
  // Refs: read and written from pointer events and the frame loop.
  const spinningRef = useRef(false);
  const frameRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const wobbleRef = useRef<AnimationPlaybackControls | null>(null);
  const shrinkRef = useRef<AnimationPlaybackControls | null>(null);
  const stopDrumrollRef = useRef<(() => void) | null>(null);
  const timersRef = useRef<Timer[]>([]);
  /** The rotation the wheel last came to rest at: a weak flick wobbles back to it. */
  const restRef = useRef(0);
  /** The peg ring the flapper is listening to, and which peg it last clicked past. */
  const pegLayoutRef = useRef<WheelLayout>({ count: 1, origin: 0 });
  const lastPegRef = useRef(0);
  const lastTickAtRef = useRef(0);
  const [stageRef, catches] = useCatchFlashes();
  const draw = useSequentialDraw();

  useEffect(() => {
    // The same array for the component's whole lifetime — pushed to and
    // emptied in place, never replaced, so this cleanup sees every timer.
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frameRef.current);
      wobbleRef.current?.stop();
      shrinkRef.current?.stop();
      stopDrumrollRef.current?.();
    };
  }, []);

  // Members still in the wheel: the pool minus whoever's draw already landed.
  const remaining = poolUids.filter((uid) => !draw.revealedLosers.includes(uid));
  const canFlick = step === "playing" && !reduceMotion && !draw.gameOver && !!draw.currentUid;

  function later(ms: number, action: () => void) {
    timersRef.current.push(setTimeout(action, ms));
  }

  /** Stops everything in motion and puts the wheel back to a fresh, upright print. */
  function resetWheel() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    spinningRef.current = false;
    dragRef.current = null;
    wobbleRef.current?.stop();
    wobbleRef.current = null;
    shrinkRef.current?.stop();
    shrinkRef.current = null;
    stopDrumrollRef.current?.();
    stopDrumrollRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
    rotation.stop();
    rotation.set(0);
    flapperRotate.stop();
    flapperRotate.set(0);
    restRef.current = 0;
    setSpinning(false);
    setOrigin(0);
    setLeaving(null);
    setTooWeak(0);
    catches.cancel();
  }

  function startGame() {
    primeGameSounds();
    startRound();
    setup.remember();
    draw.start(poolUids, setup.loserCount);
    resetWheel();
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    resetWheel();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      resetWheel();
    }
    onOpenChange(nextOpen);
  }

  /**
   * The settled wheel, for a spin or a drag about to start: a caught wedge
   * still closing up (or still waiting under its slip) is closed at once.
   */
  function settleLayout(): WheelLayout {
    let settledOrigin = origin;
    if (leaving) {
      shrinkRef.current?.stop();
      shrinkRef.current = null;
      settledOrigin = originAfterLeaving(leaving.uids, leaving.origin, leaving);
      setOrigin(settledOrigin);
      setLeaving(null);
    }
    return { count: remaining.length, origin: settledOrigin };
  }

  /** Points the flapper at this peg ring, starting from wherever the wheel is now. */
  function listenToPegs(layout: WheelLayout) {
    pegLayoutRef.current = layout;
    lastPegRef.current = pegIndexAt(rotation.get(), layout);
  }

  /**
   * The flapper: every time a rim peg passes under it, the peg flicks it
   * sideways (the way the peg is travelling) and it springs back, with a dry
   * click. Fed every rotation the wheel takes — drag, spin, wobble — it
   * reads the rotation, never sets it.
   */
  function rattle(angle: number, kick: boolean) {
    const peg = pegIndexAt(angle, pegLayoutRef.current);
    if (peg === lastPegRef.current) return;
    const direction = peg > lastPegRef.current ? 1 : -1;
    lastPegRef.current = peg;
    if (kick) {
      animate(flapperRotate, [FLAPPER_KICK_DEG * direction, 0], {
        duration: 0.2,
        ease: [0.2, 0.9, 0.3, 1],
      });
    }
    const now = nowMs();
    if (now - lastTickAtRef.current >= MIN_TICK_GAP_MS) {
      lastTickAtRef.current = now;
      playTickSound();
    }
  }

  /** The caught wedge closes up under the needle; the others widen into its room. */
  function shrinkAway(gone: Leaving) {
    const settle = () => {
      shrinkRef.current = null;
      setOrigin(originAfterLeaving(gone.uids, gone.origin, gone));
      setLeaving(null);
    };
    if (reduceMotion) {
      settle();
      return;
    }
    shrinkRef.current = animate(0, 1, {
      duration: SHRINK_SEC,
      ease: [0.45, 0, 0.2, 1],
      onUpdate: (progress) => setLeaving({ ...gone, progress }),
      onComplete: settle,
    });
  }

  /**
   * The spin is over: the wheel rests in the drawn wedge, which stays on
   * the disc under the slip and closes up once the slip has cleared.
   */
  function land(
    plan: WheelSpinPlan,
    caught: { uid: string; finale: boolean; uids: string[]; layout: WheelLayout },
  ) {
    frameRef.current = 0;
    spinningRef.current = false;
    stopDrumrollRef.current = null;
    rotation.set(plan.to);
    restRef.current = plan.to;
    setSpinning(false);
    if (!reduceMotion) {
      rattle(plan.to, false);
      // The flapper's last, lazy wobble as the wheel comes to rest on it (a
      // nail-biter's flapper has already sprung back off its peg).
      if (!plan.nailBiter) {
        const d = plan.direction;
        animate(flapperRotate, [FLAPPER_KICK_DEG * 0.6 * d, 7 * d, -3 * d, 0], { duration: 0.6 });
      }
    }
    const gone: Leaving = {
      uid: caught.uid,
      progress: 0,
      anchor: wedgeUnderNeedle(plan.to, caught.layout).fraction,
      uids: caught.uids,
      origin: caught.layout.origin,
    };
    setLeaving(gone);
    draw.revealNext();
    catches.catchOne(caught.uid, { finale: caught.finale, onDone: () => shrinkAway(gone) });
  }

  /**
   * Spins the wheel with a swing of `velocity` °/s (signed: a flick can go
   * either way). The target is the draw's next payer; the swing only shapes
   * the way there. Under reduced motion the wheel is simply there.
   */
  function startSpin(velocity: number) {
    if (spinningRef.current || draw.gameOver || !draw.currentUid) return;
    const layout = settleLayout();
    const targetIndex = remaining.indexOf(draw.currentUid);
    if (targetIndex < 0) return;
    // Inside the tap or the release, so iOS lets the frame loop's clicks play.
    primeGameSounds();
    dragRef.current = null;
    wobbleRef.current?.stop();
    wobbleRef.current = null;
    rotation.stop();
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
    setTooWeak(0);
    catches.cancel();
    const plan = planWheelSpin({
      from: rotation.get(),
      layout,
      targetIndex,
      velocity,
      nailBiterChance: reduceMotion ? 0 : NAIL_BITER_CHANCE,
    });
    const caught = {
      uid: draw.currentUid,
      finale: draw.revealedCount + 1 >= draw.losers.length,
      uids: remaining,
      layout,
    };
    spinningRef.current = true;
    setSpinning(true);
    if (reduceMotion) {
      land(plan, caught);
      return;
    }

    listenToPegs(layout);
    const nailBiter = plan.nailBiter;
    let rolling = false;
    let released = false;
    // The clock starts on the first frame: that's when the wheel is first drawn moving.
    let startedAt: number | null = null;
    const tick = (now: number) => {
      startedAt ??= now;
      const sec = Math.max(now - startedAt, 0) / 1000;
      const angle = wheelRotationAt(plan, sec);
      rotation.set(angle);
      const hanging = nailBiter !== null && sec >= nailBiter.hangSec;
      // On the hang the peg holds the flapper: it bends, it doesn't kick.
      rattle(angle, !hanging);
      if (nailBiter && hanging) {
        if (!rolling) {
          rolling = true;
          stopDrumrollRef.current = playDrumrollSound(nailBiter.tipSec - nailBiter.hangSec + 0.12);
        }
        if (sec < nailBiter.tipSec) {
          flapperRotate.set(flapperLeanAt(plan, sec));
        } else if (!released) {
          // The peg slips past: the flapper snaps back and overshoots.
          released = true;
          const lean = flapperRotate.get();
          animate(flapperRotate, [lean, -0.4 * lean, 0.15 * lean, 0], { duration: 0.45 });
        }
      }
      if (sec >= plan.durationSec) {
        land(plan, caught);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  function spinByButton() {
    startSpin(buttonSwing());
  }

  /** A release without enough swing: back to where it rested, wobbling, with "Zu lasch!" if it was a real try. */
  function springBack(weak: boolean) {
    if (weak) {
      playMissSound();
      setTooWeak((key) => key + 1);
      timersRef.current.forEach(clearTimeout);
      timersRef.current.length = 0;
      later(TOO_WEAK_MS, () => setTooWeak(0));
    }
    wobbleRef.current = animate(rotation, restRef.current, {
      type: "spring",
      stiffness: 260,
      damping: 11,
      onUpdate: (angle) => rattle(angle, true),
      onComplete: () => {
        wobbleRef.current = null;
      },
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!canFlick || spinningRef.current || dragRef.current || catches.isActive()) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const layout = settleLayout();
    wobbleRef.current?.stop();
    wobbleRef.current = null;
    rotation.stop();
    // Measured on screen, so StageScale's transform is already in it.
    const box = event.currentTarget.getBoundingClientRect();
    const centreX = box.left + box.width / 2;
    const centreY = box.top + box.height / 2;
    const minRadius = (box.width / 2) * GRAB_MIN_RADIUS_SHARE;
    const reach = Math.hypot(event.clientX - centreX, event.clientY - centreY);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Not capturable (already lifted): the drag still follows while over the wheel.
    }
    const start = rotation.get();
    dragRef.current = {
      pointerId: event.pointerId,
      centreX,
      centreY,
      minRadius,
      lastAngle:
        reach >= minRadius ? pointerAngle(event.clientX, event.clientY, centreX, centreY) : null,
      start,
      dragged: 0,
      samples: [{ t: event.timeStamp, rotation: start }],
    };
    listenToPegs(layout);
    setTooWeak(0);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId || spinningRef.current) return;
    const { clientX, clientY } = event;
    if (Math.hypot(clientX - drag.centreX, clientY - drag.centreY) < drag.minRadius) {
      drag.lastAngle = null;
      return;
    }
    const angle = pointerAngle(clientX, clientY, drag.centreX, drag.centreY);
    if (drag.lastAngle !== null) drag.dragged += angleDelta(drag.lastAngle, angle);
    drag.lastAngle = angle;
    const next = drag.start + drag.dragged;
    rotation.set(next);
    rattle(next, true);
    drag.samples.push({ t: event.timeStamp, rotation: next });
    if (drag.samples.length > 32) drag.samples.splice(0, drag.samples.length - 32);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    const velocity = flickVelocity(drag.samples, event.timeStamp);
    const release = classifyRelease(velocity, drag.dragged);
    if (release === "spin") startSpin(velocity);
    else springBack(release === "weak");
  }

  function handlePointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    springBack(false);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers, poolUids);
    handleOpenChange(false);
  }

  const lastLoserUid = draw.revealedLosers[draw.revealedLosers.length - 1];
  // The verdict waits for the last catch's takeover to clear, as the
  // lottery's does — otherwise its bloom and rise play out hidden behind it.
  const showVerdict = draw.gameOver && !catches.active;
  const flash = catches.flash;
  // The whole draw is fixed at the start, so every slip's share is final.
  const shares = stakeShares(stake, draw.losers);

  // What the disc shows: the settled wedges, or the moment a caught one closes up.
  const face = leaving
    ? wheelFace(leaving.uids, leaving.origin, leaving)
    : wheelFace(remaining, origin);
  const settledCount = face.arcs.filter((arc) => !arc.leaving).length;
  const namesFit = settledCount <= WHEEL_NAME_MAX_WEDGES;
  const gradient = `conic-gradient(from ${face.origin}deg, ${face.arcs
    .map(
      (arc) =>
        `${memberColor(members[arc.uid].displayName)} ${arc.start}deg ${arc.start + arc.size}deg`,
    )
    .join(", ")})`;
  const rim = (angle: number, radius: number) => {
    const radians = ((face.origin + angle) * Math.PI) / 180;
    return { x: radius * Math.sin(radians), y: -radius * Math.cos(radians) };
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        x-clipped: the impact shake jolts the play area sideways, and without
        this the scrim and cards would briefly overhang the scroll box and
        flash a horizontal scrollbar.
      */}
      <GameDialogContent>
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
            onTogglePoolMember={setup.togglePoolMember}
            loserCount={setup.loserCount}
            maxLoserCount={setup.maxLoserCount}
            onStepLoserCount={setup.stepLoserCount}
            stepperDirection={setup.stepperDirection}
            countHint={t("expenses.wheelCountHint")}
            countIcon="🎡"
          />
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {spinning
                ? t("expenses.wheelSpinningLabel")
                : tooWeak > 0
                  ? t("expenses.wheelTooWeak")
                  : !showVerdict && lastLoserUid
                    ? t("expenses.wheelRoundResult", {
                        name: members[lastLoserUid].displayName,
                      })
                    : ""}
            </p>

            {showVerdict ? (
              <GameResultBanner loserUids={draw.losers} members={members} stake={stake} />
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
              flat wedges in each person's color, cream divider lines, a ring
              of rim pegs (the bigger ones on the boundaries), cream name
              chips printed in the person's own ink, and a hub that shows
              whoever the wheel last caught.
            */}
            {/* 252px wheel + 20px flapper room above + 8px below. */}
            <StageScale width={WHEEL_SIZE + 12} height={WHEEL_SIZE + 12 + 28}>
              <div className="relative mx-auto flex items-center justify-center pt-5 pb-2">
                <motion.svg
                  aria-hidden="true"
                  viewBox="0 0 24 36"
                  className="pointer-events-none absolute top-0 left-1/2 z-10 h-9 w-6 -translate-x-1/2 drop-shadow-[0_2px_2px_color-mix(in_oklch,var(--foreground)_30%,transparent)]"
                  style={{ rotate: flapperRotate, transformOrigin: "50% 10px" }}
                >
                  <path d="M12 35 L4.5 14 A8.5 8.5 0 1 1 19.5 14 Z" fill="var(--primary)" />
                  <circle cx="12" cy="10" r="3" fill="var(--primary-foreground)" />
                </motion.svg>
                {/*
                  The mount takes the drag: it doesn't turn, so its box is a
                  steady centre to measure the finger against. `touch-none`
                  keeps a swipe on the wheel from scrolling the stage.
                */}
                <div
                  className={cn(
                    "bg-card shadow-e2 ring-foreground/10 relative rounded-full p-1.5 ring-1",
                    step === "playing" &&
                      !reduceMotion &&
                      "touch-none select-none [-webkit-touch-callout:none]",
                    canFlick && !spinning && "cursor-grab active:cursor-grabbing",
                  )}
                  style={{ width: WHEEL_SIZE + 12, height: WHEEL_SIZE + 12 }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onLostPointerCapture={handlePointerCancel}
                >
                  <motion.div
                    className="absolute inset-1.5 overflow-hidden rounded-full will-change-transform"
                    style={{ background: gradient, rotate: rotation }}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox={`${-WHEEL_RADIUS} ${-WHEEL_RADIUS} ${WHEEL_SIZE} ${WHEEL_SIZE}`}
                      className="absolute inset-0 size-full drop-shadow-[0_1px_1px_color-mix(in_oklch,var(--foreground)_25%,transparent)]"
                    >
                      {face.arcs.length > 1 &&
                        face.arcs.map((arc) => {
                          const end = rim(arc.start, WHEEL_RADIUS);
                          return (
                            <line
                              key={arc.uid}
                              x1={0}
                              y1={0}
                              x2={end.x}
                              y2={end.y}
                              stroke="var(--card)"
                              strokeOpacity={0.85}
                              strokeWidth={2}
                            />
                          );
                        })}
                      {face.pegs.map((peg) => {
                        const at = rim(peg.angle, PEG_RADIUS);
                        return (
                          <circle
                            key={peg.key}
                            cx={at.x}
                            cy={at.y}
                            r={peg.boundary ? 4.5 : 2.75}
                            fill="var(--card)"
                            stroke="color-mix(in oklch, var(--foreground) 22%, transparent)"
                            strokeWidth={1}
                            opacity={peg.opacity}
                          />
                        );
                      })}
                    </svg>
                    {face.arcs.map((arc) => {
                      const name = members[arc.uid].displayName;
                      const mid = face.origin + arc.start + arc.size / 2;
                      // The leaving chip keeps its width and fades out, rather
                      // than flipping to an initial as its wedge narrows.
                      const nameWidth = namesFit
                        ? wedgeNameWidth(
                            arc.leaving ? 360 / face.arcs.length : arc.size,
                            NAME_INNER_RADIUS,
                          )
                        : null;
                      const fade = arc.leaving ? 1 - (leaving?.progress ?? 0) : 1;
                      return (
                        <div
                          key={arc.uid}
                          aria-hidden="true"
                          className="absolute inset-0 flex justify-center"
                          style={{ transform: `rotate(${mid}deg)`, opacity: fade }}
                        >
                          {nameWidth ? (
                            <span
                              className="bg-card shadow-e1 mt-4 h-6 truncate rounded-full px-2 text-[11px] leading-6 font-bold"
                              style={{
                                color: memberInk(name),
                                maxWidth: nameWidth,
                                transform: `scale(${0.6 + 0.4 * fade})`,
                              }}
                            >
                              {firstName(name)}
                            </span>
                          ) : (
                            <span
                              className="bg-card shadow-e1 mt-4 flex size-7 items-center justify-center rounded-full text-xs font-bold"
                              style={{
                                color: memberInk(name),
                                transform: `scale(${0.6 + 0.4 * fade})`,
                              }}
                            >
                              {name.charAt(0).toUpperCase() || "?"}
                            </span>
                          )}
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
            </StageScale>

            {/*
              One line under the wheel, always the same height: the hint while
              it waits for a swing, "Zu lasch!" after a weak one.
            */}
            {step === "playing" && !reduceMotion && !draw.gameOver && (
              <div aria-hidden="true" className="flex h-5 items-center justify-center text-center">
                {tooWeak > 0 ? (
                  <motion.span
                    key={tooWeak}
                    initial={{ opacity: 0, scale: 0.8, x: 0 }}
                    animate={{ opacity: 1, scale: 1, x: [0, -6, 5, -3, 0] }}
                    transition={{ duration: 0.4 }}
                    className="text-primary text-sm font-semibold"
                  >
                    {t("expenses.wheelTooWeak")}
                  </motion.span>
                ) : (
                  <span
                    className={cn(
                      "text-muted-foreground text-xs transition-opacity duration-300",
                      spinning && "opacity-0",
                    )}
                  >
                    {t("expenses.wheelFlickHint")}
                  </span>
                )}
              </div>
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.gameCaughtStamp")}
                  finale={flash.finale}
                  caption={
                    <CatchCaption
                      share={shares?.[flash.uid]}
                      stake={stake}
                      detail={t("expenses.wheelProgress", {
                        found: draw.revealedCount,
                        target: draw.losers.length,
                      })}
                    />
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
              {/* Waits for the last slip, like the verdict: it's the same moment. */}
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
              disabled={spinning}
              onClick={spinByButton}
            >
              {draw.revealedCount > 0 ? t("expenses.wheelSpinAgain") : t("expenses.wheelSpin")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
