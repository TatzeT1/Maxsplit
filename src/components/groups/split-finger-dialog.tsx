"use client";

import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
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
import { useLocale, useT } from "@/components/locale-provider";
import {
  FINGER_LIFT_TIMEOUT_MS,
  FINGER_MAX_DELAY_MS,
  FINGER_MIN_DELAY_MS,
  FINGER_REST_MS,
  FINGER_SETTLE_MS,
  allRestingSince,
  armFingerRound,
  closeFingerRound,
  falseStarters,
  falseStartsDecide,
  fingerCancel,
  fingerCatch,
  fingerDown,
  fingerPoolLimit,
  fingerRoundSettled,
  fingerSeats,
  fingerStandings,
  fingerUp,
  heldCircle,
  isFingerGameOver,
  liftMs,
  maxFingerLoserCount,
  nextFingerRound,
  recordFingerRound,
  signalFingerRound,
  startFingerGame,
  type FingerGame,
  type FingerRound,
  type FingerRoundRecord,
} from "@/lib/games/finger-race";
import { memberPalette } from "@/lib/games/member-colors";
import { stakeShareAt, type GameStake } from "@/lib/games/payers";
import { randomInt } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import type { Locale } from "@/lib/i18n/translate";
import { springs } from "@/lib/motion";
import {
  playAppliedSound,
  playBuzzerSound,
  playGoSound,
  playTickSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";
type Timer = ReturnType<typeof setTimeout>;

/** The round's times stay on the circles this long before the first slip drops. */
const REVEAL_MS = 900;
/** How long the full-screen „LOS!“ stands before it gives the field back, tinted green. */
const GO_FLASH_MS = 650;

const MS_FORMAT: Record<Locale, Intl.NumberFormat> = {
  de: new Intl.NumberFormat("de-DE"),
  en: new Intl.NumberFormat("en"),
};
const NAME_LIST: Record<Locale, Intl.ListFormat> = {
  de: new Intl.ListFormat("de-DE", { type: "conjunction" }),
  en: new Intl.ListFormat("en", { type: "conjunction" }),
};

/**
 * The clock every time in a round is on. Read only from handlers and timers;
 * a module function, so the component body holds no clock read of its own.
 */
function clock(): number {
  return performance.now();
}

/**
 * A pointer event's time on that clock. `event.timeStamp` is the same clock
 * in every modern engine; the fallback guards against an epoch-based value,
 * as the reaction duel does.
 */
function eventTime(event: { timeStamp: number }): number {
  return event.timeStamp > 1e12 ? clock() : event.timeStamp;
}

/** What one circle shows: the open round's touch state, or how the last closed round went for it. */
type CircleState = "open" | "held" | "falseStart" | "lifted" | "result" | "out";
type Outcome = "pays" | "safe" | "tied" | null;

/**
 * „Finger drauf!“: the phone lies flat on the table, everyone rests a finger
 * on their own circle, and after a random pause a full-screen „LOS!“ tells
 * them to lift. Lifting early is a false start and pays; otherwise the
 * slowest fingers pay. The one game the whole table plays at once — no phone
 * gets passed round, up to five fingers on one screen.
 *
 * The rules live in `lib/games/finger-race.ts`; this dialog only forwards
 * raw pointer events with their timestamps and stages what the module
 * decides. The pause before „LOS!“ is a crypto-random draw; who pays comes
 * from the fingers alone. Each finger belongs, by `pointerId`, to the circle
 * it came down on. Its lift and cancel are heard on `window`, so a finger
 * that slides off its circle is still that finger.
 */
export function SplitFingerDialog({
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
  /** The bill being played for — each payer's slip and the verdict show their share. Display only. */
  stake?: GameStake | null;
  /** Who pays, and everyone who played (stored on the expense). */
  onResolve: (loserUids: string[], playerUids: string[]) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const setup = useGamePoolSetup(memberUids, maxFingerLoserCount, groupId);
  const { startRound } = useGameRound();
  // How many touches this screen tracks — 0 without a touchscreen. The dialog
  // only ever mounts on the client, after a tap.
  const [touchPoints] = useState(() =>
    typeof navigator === "undefined" ? null : navigator.maxTouchPoints,
  );
  const [game, setGame] = useState<FingerGame | null>(null);
  const [round, setRound] = useState<FingerRound | null>(null);
  // Mirrors of the two above, written in the same breath: several fingers can
  // land or lift in one frame, and each handler has to see the touch the one
  // before it just recorded, not the last render's snapshot.
  const gameRef = useRef<FingerGame | null>(null);
  const roundRef = useRef<FingerRound | null>(null);
  const signalTimerRef = useRef<Timer | null>(null);
  const [goFlash, setGoFlash] = useState(false);
  // Set once the last slip has come and gone — the verdict's cue.
  const [celebrated, setCelebrated] = useState(false);
  const timersRef = useRef<Timer[]>([]);
  // A slip per payer, with the stamp, laugh, jolt and buzz every luck game's catch has.
  const [stageRef, catches] = useCatchFlashes();
  const flash = catches.flash;

  useEffect(() => {
    // The same array for the component's whole lifetime — pushed to and
    // emptied in place, never replaced, so this still sees every timer.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current.length = 0;
    signalTimerRef.current = null;
  }

  function later(ms: number, action: () => void): Timer {
    const timer = setTimeout(action, ms);
    timersRef.current.push(timer);
    return timer;
  }

  function updateRound(next: FingerRound | null) {
    roundRef.current = next;
    setRound(next);
  }

  function updateGame(next: FingerGame | null) {
    gameRef.current = next;
    setGame(next);
  }

  function resetPlay() {
    clearTimers();
    updateRound(null);
    updateGame(null);
    setGoFlash(false);
    catches.cancel();
    setCelebrated(false);
  }

  function startGame() {
    startRound();
    setup.remember();
    resetPlay();
    const fresh = startFingerGame(setup.poolUids, setup.loserCount);
    updateGame(fresh);
    updateRound(nextFingerRound(fresh));
    setStep("playing");
  }

  function goToSetup() {
    resetPlay();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) goToSetup();
    onOpenChange(nextOpen);
  }

  /** Every finger is down: check back once the last of them has rested long enough. */
  function scheduleArm(current: FingerRound) {
    const since = allRestingSince(current);
    if (since === null) return;
    later(Math.max(0, since + FINGER_REST_MS - clock()), tryArm);
  }

  function tryArm() {
    const current = roundRef.current;
    if (!current || current.phase !== "gather") return;
    const armed = armFingerRound(current, clock());
    if (armed === current) {
      // A finger moved since this check was set (its own check is pending),
      // or the timer ran a hair early: look again.
      scheduleArm(current);
      return;
    }
    updateRound(armed);
    signalTimerRef.current = later(randomInt(FINGER_MIN_DELAY_MS, FINGER_MAX_DELAY_MS), signal);
  }

  function signal() {
    signalTimerRef.current = null;
    const current = roundRef.current;
    if (!current || current.phase !== "steady") return;
    updateRound(signalFingerRound(current, clock()));
    playGoSound();
    setGoFlash(true);
    later(GO_FLASH_MS, () => setGoFlash(false));
    later(FINGER_LIFT_TIMEOUT_MS, () => {
      const pending = roundRef.current;
      if (pending?.phase === "go") closeRound(pending);
    });
  }

  function settleCheck() {
    const current = roundRef.current;
    if (current && fingerRoundSettled(current, clock())) closeRound(current);
  }

  /**
   * Judges the round and stages it: a beat with everyone's time on the
   * circles, one slip per person it made pay (the game's last one is the
   * finale), then either the verdict or the next round for the players who
   * must play again.
   */
  function closeRound(openRound: FingerRound) {
    clearTimers();
    setGoFlash(false);
    const current = gameRef.current;
    if (!current) return;
    const next = recordFingerRound(current, closeFingerRound(openRound));
    if (next === current) {
      // Not this game's round (can't happen); deal a fresh one rather than hang.
      updateRound(nextFingerRound(current));
      return;
    }
    updateRound(null);
    updateGame(next);
    const payers = next.rounds[next.rounds.length - 1].verdict.losers;
    const over = isFingerGameOver(next);
    later(REVEAL_MS, () =>
      catches.catchEach(payers, {
        // A round a replay follows keeps the finale for the game's last slip.
        finale: over,
        onDone: () => {
          if (over) setCelebrated(true);
          else updateRound(nextFingerRound(next));
        },
      }),
    );
  }

  function handlePointerDown(uid: string) {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const current = roundRef.current;
      if (!current) return;
      const next = fingerDown(current, event.pointerId, uid, eventTime(event));
      if (next === current) return;
      try {
        // Its up and cancel keep coming here even if it slides off the circle.
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer is already gone; its up/cancel still reach `window`.
      }
      playTickSound();
      updateRound(next);
      scheduleArm(next);
    };
  }

  const handleLift = useEffectEvent((event: PointerEvent) => {
    const current = roundRef.current;
    if (!current) return;
    const at = eventTime(event);
    const next = fingerUp(current, event.pointerId, at);
    if (next === current) return;
    updateRound(next);
    // Lifting while the fingers are still gathering is free.
    if (next.phase === "gather") return;
    if (next.signalAt === null || at < next.signalAt) playBuzzerSound();
    if (falseStartsDecide(next) && signalTimerRef.current !== null) {
      // Decided before „LOS!“ — the signal stays off.
      clearTimeout(signalTimerRef.current);
      signalTimerRef.current = null;
    }
    later(FINGER_SETTLE_MS, settleCheck);
  });

  const handleCancel = useEffectEvent((event: PointerEvent) => {
    const current = roundRef.current;
    if (!current) return;
    const next = fingerCancel(current, event.pointerId);
    if (next === current) return;
    if (next.phase === "closed") closeRound(next);
    else updateRound(next);
  });

  useEffect(() => {
    if (step !== "playing") return;
    // Capture phase on `window`: every lift and cancel, wherever it lands and
    // whatever stops it bubbling. The round itself ignores fingers it isn't
    // tracking (an extra finger, a palm, a finger outside the circles).
    const onUp = (event: PointerEvent) => handleLift(event);
    const onCancel = (event: PointerEvent) => handleCancel(event);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    return () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
    };
  }, [step]);

  function applyResult() {
    if (!game) return;
    playAppliedSound();
    onResolve(game.losers, setup.poolUids);
    handleOpenChange(false);
  }

  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";
  const formatMs = (ms: number) => t("expenses.fingerMs", { ms: MS_FORMAT[locale].format(ms) });
  const listNames = (uids: readonly string[]) => NAME_LIST[locale].format(uids.map(nameOf));

  const poolLimit = fingerPoolLimit(touchPoints);
  const tooMany = setup.poolUids.length > poolLimit;
  const over = game !== null && isFingerGameOver(game);
  const showVerdict = over && celebrated;
  // Settled payers plus the places still open among the players left.
  const payerTotal = game ? game.losers.length + game.slots : 0;
  // The last round that closed: what the circles show between rounds, and
  // why the open round is a replay.
  const record: FingerRoundRecord | null =
    game && game.rounds.length > 0 ? game.rounds[game.rounds.length - 1] : null;
  const replayNotice =
    round && record?.verdict.replay
      ? t(
          record.verdict.replay === "tooClose"
            ? "expenses.fingerReplayTooClose"
            : record.verdict.replay === "falseStarts"
              ? "expenses.fingerReplayFalseStarts"
              : "expenses.fingerReplayVoided",
          { names: listNames(round.contenders) },
        )
      : null;
  const missing =
    round?.phase === "gather" ? round.contenders.filter((uid) => !heldCircle(round, uid)) : [];
  const lastFalseStart = round ? falseStarters(round).at(-1) : undefined;
  const seats = fingerSeats(setup.poolUids.length);

  let liveText = "";
  if (flash) liveText = t("expenses.fingerPaysLabel", { name: nameOf(flash.uid) });
  else if (round?.phase === "go") liveText = t("expenses.fingerGoLabel");
  else if (round?.phase === "steady")
    liveText = lastFalseStart
      ? t("expenses.fingerFalseStartLabel", { name: nameOf(lastFalseStart) })
      : t("expenses.fingerSteady");
  else if (round?.phase === "gather") liveText = replayNotice ?? t("expenses.fingerGather");

  function circleView(uid: string): { state: CircleState; note: string | null; outcome: Outcome } {
    const settled: Outcome = game?.losers.includes(uid)
      ? "pays"
      : game?.safe.includes(uid)
        ? "safe"
        : null;
    const source = round ?? record;
    if (!source || !source.contenders.includes(uid)) {
      const note =
        settled === "pays"
          ? t("expenses.fingerPaysTag")
          : settled === "safe"
            ? t("expenses.fingerSafeTag")
            : null;
      return { state: "out", note, outcome: settled };
    }
    const lift = source.lifts[uid];
    const falseStart = lift !== undefined && (source.signalAt === null || lift < source.signalAt);
    const ms = liftMs(source, uid);
    if (!("verdict" in source)) {
      if (falseStart)
        return { state: "falseStart", note: t("expenses.fingerFalseStart"), outcome: null };
      if (ms !== null) return { state: "lifted", note: formatMs(ms), outcome: null };
      return heldCircle(source, uid)
        ? { state: "held", note: null, outcome: null }
        : { state: "open", note: t("expenses.fingerPlaceFinger"), outcome: null };
    }
    const { verdict } = source;
    const outcome: Outcome = verdict.losers.includes(uid)
      ? "pays"
      : verdict.safe.includes(uid)
        ? "safe"
        : verdict.tied.includes(uid)
          ? "tied"
          : null;
    const note = falseStart
      ? t("expenses.fingerFalseStart")
      : ms !== null
        ? formatMs(ms)
        : outcome === "tied"
          ? t("expenses.fingerTiedTag")
          : outcome === "pays" && source.signalAt !== null
            ? t("expenses.fingerNoLift")
            : null;
    return { state: "result", note, outcome };
  }

  /**
   * A payer's share, the moment they are caught. Payers are booked in the
   * order they are caught and the payer count is set at the start (a replay
   * only fills places still open), so it is already the booked amount.
   */
  function slipShare(uid: string): number | null {
    const index = game ? game.losers.indexOf(uid) : -1;
    return index < 0 ? null : stakeShareAt(stake, payerTotal, index);
  }

  function slipCaption(uid: string): string | null {
    const caught = game ? fingerCatch(game, uid) : null;
    if (!caught) return null;
    if (caught.kind === "falseStart") return t("expenses.fingerFalseStartCaption");
    return caught.ms === null
      ? t("expenses.fingerNoLiftCaption")
      : t("expenses.fingerSlowCaption", { ms: MS_FORMAT[locale].format(caught.ms) });
  }

  const phase = round?.phase ?? null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">☝️</span>
            {t("expenses.fingerTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.fingerIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" || !game ? (
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
              countHint={t("expenses.fingerCountHint")}
              countIcon="☝️"
            />
            {tooMany && (
              <p role="alert" className="text-destructive text-sm">
                {t("expenses.fingerTooMany", { max: poolLimit })}
              </p>
            )}
            {touchPoints === 0 && (
              <p className="text-muted-foreground text-sm">{t("expenses.fingerNoTouch")}</p>
            )}
          </div>
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {liveText}
            </p>

            {showVerdict ? (
              <>
                <GameResultBanner loserUids={game.losers} members={members} stake={stake} />
                <section className="flex flex-col gap-2" aria-labelledby="finger-standings">
                  <span
                    id="finger-standings"
                    className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase"
                  >
                    {t("expenses.fingerStandingsTitle")}
                  </span>
                  <ol className="flex flex-col gap-1.5">
                    {fingerStandings(game).map((standing, index) => (
                      <li
                        key={standing.uid}
                        className={cn(
                          "animate-rise flex items-center gap-3 rounded-xl border p-2",
                          standing.pays
                            ? "border-destructive/40 bg-destructive/5"
                            : "bg-background",
                        )}
                        style={{ "--stagger": index } as CSSProperties}
                      >
                        <span className="text-muted-foreground w-5 shrink-0 text-center text-xs font-semibold tabular-nums">
                          {index + 1}.
                        </span>
                        <GameAvatar name={nameOf(standing.uid)} className="size-8 text-xs" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {nameOf(standing.uid)}
                          </span>
                          {game.rounds.length > 1 && standing.round > 0 && (
                            <span className="text-muted-foreground block text-xs">
                              {t("expenses.fingerRoundTag", { count: standing.round + 1 })}
                            </span>
                          )}
                        </span>
                        <span className="tabular-money shrink-0 text-right text-sm font-medium">
                          {standing.falseStart
                            ? t("expenses.fingerFalseStart")
                            : standing.ms !== null
                              ? formatMs(standing.ms)
                              : standing.pays
                                ? t("expenses.fingerNoLift")
                                : "—"}
                        </span>
                        <span
                          className={cn(
                            "w-12 shrink-0 text-right text-xs font-semibold",
                            standing.pays ? "text-destructive" : "text-success",
                          )}
                        >
                          {standing.pays
                            ? t("expenses.fingerPaysTag")
                            : t("expenses.fingerSafeTag")}
                        </span>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            ) : (
              <>
                {replayNotice && (
                  <div className="border-border bg-muted/60 animate-rise rounded-xl border border-dashed p-2.5 text-center text-sm font-medium">
                    {replayNotice}
                  </div>
                )}

                {/* A minimum height, so the field below doesn't jump as this line changes. */}
                <div className="flex min-h-12 flex-col items-center justify-center text-center">
                  {phase === "gather" &&
                    (missing.length > 0 ? (
                      <>
                        <span className="font-heading text-base font-medium">
                          {t("expenses.fingerGather")}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {t("expenses.fingerMissing", { names: listNames(missing) })}
                        </span>
                      </>
                    ) : (
                      <span className="font-heading text-base font-medium">
                        {t("expenses.fingerHold")}
                      </span>
                    ))}
                  {phase === "steady" && (
                    <span className="font-heading text-lg font-semibold">
                      {t("expenses.fingerSteady")}
                    </span>
                  )}
                  {phase === "go" && (
                    <span className="font-heading text-success text-2xl font-black">
                      {t("expenses.fingerGo")}
                    </span>
                  )}
                </div>

                {/*
                 * The play field: a definite height (never padding — AGENTS.md),
                 * and nothing a resting finger could start — no scroll, no
                 * pinch zoom, no text selection, no long-press menu.
                 */}
                <div
                  aria-hidden="true"
                  data-phase={phase ?? "idle"}
                  onContextMenu={(event) => event.preventDefault()}
                  className={cn(
                    "relative h-[clamp(20rem,var(--game-board-h,26rem),34rem)] w-full touch-none overflow-hidden overscroll-none rounded-3xl border select-none [-webkit-touch-callout:none] [-webkit-user-select:none]",
                    "transition-colors duration-(--duration-base)",
                    phase === "steady"
                      ? "border-transparent bg-[#2a241d]"
                      : phase === "go"
                        ? "bg-success/30 border-success"
                        : "bg-muted/50",
                  )}
                >
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-5xl">
                    {phase === "gather" && (
                      <span className={cn(!reduceMotion && "animate-breathe")}>☝️</span>
                    )}
                    {phase === "steady" && <span>🤫</span>}
                  </span>
                  {setup.poolUids.map((uid, index) => {
                    const seat = seats[index];
                    const name = nameOf(uid);
                    const [from, to] = memberPalette(name);
                    const view = circleView(uid);
                    const filled = view.state === "held";
                    return (
                      <div
                        key={uid}
                        data-finger-circle={uid}
                        onPointerDown={handlePointerDown(uid)}
                        className="absolute aspect-square w-[min(6.5rem,30%)] -translate-x-1/2 -translate-y-1/2"
                        style={{ left: `${seat.x * 100}%`, top: `${seat.y * 100}%` }}
                      >
                        {view.state === "open" && !reduceMotion && (
                          <span
                            className="animate-breathe pointer-events-none absolute inset-2 rounded-full border-2"
                            style={{ borderColor: from }}
                          />
                        )}
                        <motion.div
                          animate={{
                            scale: filled ? 1.06 : view.state === "out" ? 0.9 : 1,
                          }}
                          transition={reduceMotion ? { duration: 0 } : springs.snappy}
                          style={{
                            rotate: seat.rotate,
                            borderColor:
                              view.outcome === "pays" || view.state === "falseStart"
                                ? "var(--destructive)"
                                : view.outcome === "safe"
                                  ? "var(--success)"
                                  : from,
                            backgroundImage: filled
                              ? `linear-gradient(135deg, ${from}, ${to})`
                              : undefined,
                          }}
                          className={cn(
                            "relative flex size-full flex-col items-center justify-center gap-0.5 rounded-full border-[3px] p-1.5 text-center transition-[background-color,opacity,filter] duration-(--duration-fast)",
                            view.state === "open" && "bg-card border-dashed",
                            filled && "text-white shadow-lg",
                            view.state === "falseStart" && "bg-destructive text-white",
                            (view.state === "lifted" || view.state === "result") && "bg-card",
                            view.outcome === "tied" && "border-dashed",
                            view.state === "out" && "bg-card opacity-45 grayscale",
                          )}
                        >
                          <GameAvatar
                            name={name}
                            className={cn("size-10 text-base", filled && "ring-2 ring-white/80")}
                          />
                          <span className="max-w-full truncate px-1 text-xs leading-tight font-semibold">
                            {name}
                          </span>
                          {view.note && (
                            <span
                              className={cn(
                                "max-w-full truncate text-[11px] leading-none font-bold",
                                view.state === "lifted" || view.state === "result"
                                  ? "tabular-money"
                                  : null,
                                view.outcome === "pays" && "text-destructive",
                                view.outcome === "safe" && "text-success",
                                view.state === "open" && "text-muted-foreground font-medium",
                              )}
                            >
                              {view.note}
                            </span>
                          )}
                        </motion.div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={nameOf(flash.uid)}
                  stampLabel={
                    game && fingerCatch(game, flash.uid)?.kind === "falseStart"
                      ? t("expenses.fingerFalseStartStamp")
                      : t("expenses.fingerSlowStamp")
                  }
                  finale={flash.finale}
                  caption={
                    <CatchCaption
                      share={slipShare(flash.uid)}
                      stake={stake}
                      detail={slipCaption(flash.uid)}
                    />
                  }
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {/* The signal: the whole screen, since the fingers cover the field. */}
        <AnimatePresence>
          {goFlash && (
            <motion.div
              key="go"
              aria-hidden="true"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: reduceMotion ? 0 : 0.35 } }}
              className="bg-success text-success-foreground pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
            >
              <motion.span
                initial={reduceMotion ? false : { scale: 0.55 }}
                animate={{ scale: 1 }}
                transition={reduceMotion ? { duration: 0 } : springs.snappy}
                className="font-heading text-8xl font-black tracking-tight"
              >
                {t("expenses.fingerGo")}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter>
          {step === "setup" || !game ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={setup.poolUids.length < 2 || tooMany}
              onClick={startGame}
            >
              {t("expenses.gameStart")}
            </Button>
          ) : showVerdict ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={goToSetup}
              >
                {t("expenses.duelRestart")}
              </Button>
              <Button type="button" size="lg" className="flex-1" onClick={applyResult}>
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            // No button while the fingers are on the glass: lifting a stray
            // finger off one would press it. ✕ still leaves the game.
            <div className="flex-1">
              <GameProgressPips
                revealedCount={game.losers.length}
                target={payerTotal}
                progressLabel={t("expenses.duelProgress", {
                  found: game.losers.length,
                  target: payerTotal,
                })}
              />
            </div>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
