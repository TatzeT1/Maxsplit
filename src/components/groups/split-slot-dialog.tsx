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
import { AnimatedMoney } from "@/components/ui/animated-money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatMoney, moneyToInput, parseMoneyInput } from "@/lib/format/money";
import { memberColor } from "@/lib/games/member-colors";
import { drawOne } from "@/lib/games/random";
import {
  playAppliedSound,
  playGiggleSound,
  playLeverSound,
  playReelStopSound,
  playStampSound,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** Row height in px, and how many rows the window shows — the classic 3-symbol payline. */
const ROW_HEIGHT = 56;
const VISIBLE_ROWS = 3;
const STRIP_LENGTH = 22;
/** Where the winner sits in every strip, with a couple of buffer rows after it. */
const WINNER_INDEX = STRIP_LENGTH - 3;
/** Reels stop one at a time, left to right, each holding a little longer than the last. */
const REEL_DURATIONS = [1.3, 1.8, 2.3];
/** How far a reel overshoots its landing spot before snapping back — a real reel doesn't stop dead. */
const OVERSHOOT = ROW_HEIGHT * 0.22;
const TARGET_Y = -(WINNER_INDEX - 1) * ROW_HEIGHT;
/** Common stake sizes offered as one-tap presets, in minor units. Filtered down to whatever the bill can afford. */
const STAKE_PRESETS_MINOR = [10, 50, 100, 500, 1000];
/** The last spin of a round holds a beat longer, so its bigger confetti burst gets to land. */
const FINALE_EXTRA_HOLD_MS = 400;
/**
 * The lever's resting and pulled angles. It pivots from the housing like the
 * handle of a desk stamp or a hole punch, swinging down through an arc, rather
 * than sliding down a track the way a one-armed bandit's does.
 */
const LEVER_REST_DEG = -34;
const LEVER_PULLED_DEG = 32;
/** A loose spring for the lever snapping back up: it should visibly bounce, like a real return spring. */
const LEVER_RETURN_SPRING = { type: "spring", stiffness: 320, damping: 11, mass: 0.8 } as const;

/**
 * The stake on the till slip is the headline, so it's set as large as the
 * slip allows. It steps down for long amounts: at 390px wide the slip has
 * about 200px for "+1.234,56 €", which only fits in Fraunces at 24px.
 */
function stakeSizeClass(formatted: string): string {
  if (formatted.length <= 7) return "text-4xl";
  if (formatted.length <= 9) return "text-3xl";
  return "text-2xl";
}

/**
 * Filler symbols above and below the winner are purely decorative — the
 * winner itself came from `drawOne`'s crypto-random draw, so `Math.random`
 * here can't affect who actually pays.
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

/**
 * One reel row: the person's ordinary avatar chip, the same gradient they
 * wear everywhere else in the app, rather than a slot-machine symbol. The
 * winner's chip does the lottery's "caught" wobble as its reel locks in.
 */
function ReelSymbol({ name, landed }: { name: string; landed: boolean }) {
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ height: ROW_HEIGHT }}>
      <span className={cn("block rounded-full", landed && "animate-laugh-land")}>
        <GameAvatar name={name} className="shadow-e1 size-10 text-base" />
      </span>
    </span>
  );
}

/** Running "who owes how much so far" breakdown — both the live mid-game state and the final result use this. */
function TallyList({
  tallies,
  members,
  currency,
}: {
  tallies: Record<string, number>;
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();
  const entries = Object.entries(tallies)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-center text-xs">{t("expenses.slotTallyEmpty")}</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([uid, amount]) => (
        <li
          key={uid}
          className="animate-rise flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GameAvatar name={members[uid].displayName} className="size-7 shrink-0 text-xs" />
            <span className="truncate">{members[uid].displayName}</span>
          </span>
          <AnimatedMoney
            amountMinor={amount}
            currency={currency}
            className="shrink-0 text-base font-semibold"
          />
        </li>
      ))}
    </ul>
  );
}

interface FlashState {
  id: number;
  amount: number;
  uid: string;
  /** This spin used up the rest of the bill. */
  finale: boolean;
}

/**
 * Spielautomat, played the way a real slot machine is: pick a stake, pull
 * the lever, whoever the reels land on owes that stake — then do it again.
 * Every spin draws a fresh, independent winner with replacement
 * (`drawOne`), so the same person can lose several spins in a row, exactly
 * like a real one-armed bandit rather than a fixed, fair-by-construction
 * draw. The stake is capped to whatever's left of the bill, so the round
 * always finishes exactly on the expense's total — `onResolve` hands back
 * the per-person amounts actually owed, not an equal split.
 */
export function SplitSlotDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  amountMinor,
  currency,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  amountMinor: number;
  currency: string;
  onResolve: (amountsByUid: Record<string, number>) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [stakeInput, setStakeInput] = useState("1,00");
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [pullId, setPullId] = useState(0);
  const [reels, setReels] = useState<string[][]>([[], [], []]);
  const [reelStopped, setReelStopped] = useState([true, true, true]);
  const [pulling, setPulling] = useState(false);
  const [lastSpin, setLastSpin] = useState<{ uid: string; amount: number } | null>(null);
  const [flash, setFlash] = useState<FlashState | null>(null);
  const pendingSpinRef = useRef<{ uid: string; amount: number } | null>(null);
  const flashIdRef = useRef(0);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  const allocated = Object.values(tallies).reduce((sum, amount) => sum + amount, 0);
  const remaining = Math.max(amountMinor - allocated, 0);
  const done = amountMinor > 0 && remaining === 0;

  const stakeValue = parseMoneyInput(stakeInput) ?? 0;
  const effectiveStake = Math.min(stakeValue, remaining);
  const stakePresets = STAKE_PRESETS_MINOR.filter((preset) => preset <= amountMinor);
  if (stakePresets.length === 0 && amountMinor > 0) stakePresets.push(amountMinor);

  function startGame() {
    setTallies({});
    setLastSpin(null);
    setReels([[], [], []]);
    setReelStopped([true, true, true]);
    setStakeInput(moneyToInput(Math.min(100, amountMinor)));
    setStep("playing");
  }

  function goToSetup() {
    setTallies({});
    setLastSpin(null);
    setReels([[], [], []]);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setTallies({});
      setLastSpin(null);
      setReels([[], [], []]);
      setPulling(false);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlash(null);
    }
    onOpenChange(nextOpen);
  }

  function pull() {
    if (pulling || done || effectiveStake <= 0 || poolUids.length === 0) return;
    // Pulling again mid-celebration clears the slip at once, so the new spin
    // is never hidden behind the previous one's scrim.
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlash(null);
    const winner = drawOne(poolUids);
    pendingSpinRef.current = { uid: winner, amount: effectiveStake };
    setReels([
      buildReelStrip(winner, poolUids),
      buildReelStrip(winner, poolUids),
      buildReelStrip(winner, poolUids),
    ]);
    setReelStopped([false, false, false]);
    setPulling(true);
    playLeverSound();
    setPullId((id) => id + 1);
  }

  function handleReelStop(index: number) {
    if (!pulling) return;
    setReelStopped((current) => {
      const next = [...current];
      next[index] = true;
      return next;
    });
    playReelStopSound();
    if (index < 2) return;

    // Last reel: settle the pending spin into the tallies.
    setPulling(false);
    const pending = pendingSpinRef.current;
    pendingSpinRef.current = null;
    if (!pending) return;
    setTallies((current) => ({
      ...current,
      [pending.uid]: (current[pending.uid] ?? 0) + pending.amount,
    }));
    setLastSpin(pending);

    // Presentation only, read after the tally update above is already queued:
    // does this spin close out the bill? If so it gets the bigger finale.
    const finale = pending.amount >= remaining;
    playStampSound(STAMP_IMPACT_S);
    playGiggleSound(STAMP_IMPACT_S + 0.12);
    shakeStage(finale ? 1.4 : 1);
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, amount: pending.amount, uid: pending.uid, finale });
    flashTimeoutRef.current = setTimeout(
      () => setFlash(null),
      CATCH_FLASH_HOLD_MS + (finale ? FINALE_EXTRA_HOLD_MS : 0),
    );
  }

  function applyResult() {
    playAppliedSound();
    onResolve(tallies);
    handleOpenChange(false);
  }

  const liveText = pulling
    ? t("expenses.slotSpinningLabel")
    : lastSpin
      ? t("expenses.slotRoundResult", {
          name: members[lastSpin.uid].displayName,
          amount: formatMoney(lastSpin.amount, currency),
        })
      : "";

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
            <span aria-hidden="true">🎰</span>
            {t("expenses.slotTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.slotIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-4">
            <GamePoolChecklist
              memberUids={memberUids}
              members={members}
              poolUids={poolUids}
              onTogglePoolMember={togglePoolMember}
            />
            {amountMinor <= 0 && (
              <p className="text-muted-foreground text-xs">{t("expenses.slotNoAmountHint")}</p>
            )}
          </div>
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {liveText}
            </p>

            {done ? (
              <div className="border-primary/30 bg-primary/5 animate-rise flex items-center justify-center gap-1.5 rounded-xl border p-2 text-sm font-medium">
                <span aria-hidden="true">✓</span>
                {t("expenses.slotFullyAllocated")}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label id="slot-stake-label">{t("expenses.slotStakeLabel")}</Label>
                <div
                  role="group"
                  aria-labelledby="slot-stake-label"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {stakePresets.map((preset) => {
                    const selected = stakeValue === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setStakeInput(moneyToInput(preset))}
                        className={cn(
                          "ease-spring rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-(--duration-fast) active:scale-95",
                          selected
                            ? "border-primary bg-primary text-primary-foreground shadow-e1"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {formatMoney(preset, currency)}
                      </button>
                    );
                  })}
                  <Input
                    value={stakeInput}
                    onChange={(event) => setStakeInput(event.target.value)}
                    placeholder={`0,00 ${currency}`}
                    inputMode="decimal"
                    aria-label={t("expenses.slotStakeLabel")}
                    className="h-9 w-24 shrink-0"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {effectiveStake < stakeValue
                    ? t("expenses.slotStakeClamped", {
                        amount: formatMoney(effectiveStake, currency),
                      })
                    : t("expenses.slotStakeHint")}
                </p>
              </div>
            )}

            <div className="bg-muted/40 flex flex-col gap-2.5 rounded-xl border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                    {t("expenses.slotRemainingLabel")}
                  </span>
                  <AnimatedMoney
                    amountMinor={remaining}
                    currency={currency}
                    className="font-heading text-2xl leading-none font-semibold"
                  />
                </div>
                <div className="flex flex-col items-end gap-0.5 text-right">
                  <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                    {t("expenses.slotAllocatedLabel")}
                  </span>
                  <AnimatedMoney
                    amountMinor={allocated}
                    currency={currency}
                    className="font-heading text-2xl leading-none font-semibold"
                  />
                </div>
              </div>
              <div className="bg-border relative h-1.5 overflow-hidden rounded-full">
                <motion.div
                  className="bg-primary absolute inset-y-0 left-0 rounded-full"
                  animate={{
                    width:
                      amountMinor > 0 ? `${Math.min((allocated / amountMinor) * 100, 100)}%` : "0%",
                  }}
                  transition={reduceMotion ? { duration: 0 } : springs.weighted}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
              </span>
              <TallyList tallies={tallies} members={members} currency={currency} />
            </div>

            <div className="flex items-center justify-center py-1">
              {/*
                The housing is a paper card like every other surface in the
                app, not a black cabinet: reels sit in pressed-in wells, fade
                toward their top and bottom edges the way a drum curves away,
                and the payline is marked with two small notches in the app's
                primary ink.
              */}
              <div
                aria-hidden="true"
                className="bg-card shadow-e2 ring-foreground/10 relative rounded-2xl px-3.5 py-2 ring-1"
              >
                <span className="bg-paper-texture pointer-events-none absolute inset-0 rounded-2xl opacity-70" />
                <span className="border-l-primary absolute top-1/2 left-1 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent" />
                <span className="border-r-primary absolute top-1/2 right-1 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent" />
                <div className="relative flex gap-1.5">
                  {[0, 1, 2].map((reelIndex) => {
                    const stopped = reelStopped[reelIndex] && reels[reelIndex].length > 0;
                    const landedUid = stopped ? reels[reelIndex][WINNER_INDEX] : null;
                    return (
                      <div
                        key={reelIndex}
                        className="bg-muted shadow-pressed relative overflow-hidden rounded-lg"
                        style={{ width: ROW_HEIGHT, height: ROW_HEIGHT * VISIBLE_ROWS }}
                      >
                        <motion.div
                          key={`${pullId}-${reelIndex}`}
                          className={cn(
                            "flex flex-col transition-[filter] duration-150",
                            !reelStopped[reelIndex] && "blur-[2px]",
                          )}
                          initial={{ y: 0 }}
                          animate={{
                            y:
                              reels[reelIndex].length > 0 ? [0, TARGET_Y - OVERSHOOT, TARGET_Y] : 0,
                          }}
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : {
                                  duration: REEL_DURATIONS[reelIndex],
                                  times: [0, 0.86, 1],
                                  ease: [
                                    [0.12, 0.68, 0.12, 1],
                                    [0.34, 1.56, 0.64, 1],
                                  ],
                                }
                          }
                          onAnimationComplete={() => handleReelStop(reelIndex)}
                        >
                          {reels[reelIndex].map((uid, rowIndex) => (
                            <ReelSymbol
                              key={rowIndex}
                              name={members[uid]?.displayName ?? "?"}
                              landed={stopped && rowIndex === WINNER_INDEX}
                            />
                          ))}
                        </motion.div>
                        {/* The drum curving away: rows fade into the well toward its edges. */}
                        <span className="from-muted pointer-events-none absolute inset-x-0 top-0 h-9 bg-linear-to-b to-transparent" />
                        <span className="from-muted pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-linear-to-t to-transparent" />
                        {/* Payline: the middle row is the one that counts. */}
                        <span
                          className="border-primary/45 pointer-events-none absolute inset-x-0 border-y"
                          style={{ top: ROW_HEIGHT, height: ROW_HEIGHT }}
                        />
                        {landedUid && (
                          <span
                            key={pullId}
                            className="animate-settle-ring pointer-events-none absolute left-1/2 size-11 -translate-x-1/2 rounded-full border-2"
                            style={{
                              top: ROW_HEIGHT + (ROW_HEIGHT - 44) / 2,
                              borderColor: memberColor(members[landedUid]?.displayName ?? "?"),
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/*
                Decorative lever: purely a visual echo of the pull, not its own
                control. It pivots from the housing's flank and swings through
                an arc, like the handle of a desk stamp, then bounces back up
                on a loose spring when the reels land.
              */}
              <div aria-hidden="true" className="relative h-24 w-14 shrink-0">
                <span className="bg-card ring-foreground/10 shadow-e1 absolute top-1/2 left-0 h-12 w-3.5 -translate-y-1/2 rounded-r-lg ring-1" />
                <motion.span
                  className="absolute top-1/2 left-1.5 block h-2 w-11 origin-left -translate-y-1/2"
                  initial={false}
                  animate={{ rotate: pulling ? LEVER_PULLED_DEG : LEVER_REST_DEG }}
                  transition={
                    reduceMotion ? { duration: 0 } : pulling ? springs.snappy : LEVER_RETURN_SPRING
                  }
                >
                  <span className="bg-foreground/25 absolute inset-y-0 right-2 left-0 rounded-full" />
                  <span className="bg-primary ring-card shadow-e1 absolute top-1/2 right-0 h-7 w-4 -translate-y-1/2 rounded-full ring-2" />
                </motion.span>
                <span className="bg-card ring-foreground/20 shadow-e1 absolute top-1/2 left-0.5 size-3.5 -translate-y-1/2 rounded-full ring-1" />
              </div>
            </div>

            {/*
              The catch: a till slip with the person and the stake on it, a
              rubber stamp in their ink, confetti in their colors, and the
              whole play area jolting on impact (see split-game/celebration).
              The paper scrim over the *whole* play area keeps the amount
              legible whatever colors happen to be behind it.
            */}
            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.gameCaughtStamp")}
                  finale={flash.finale}
                  caption={
                    <span className="flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          "font-heading leading-none font-semibold whitespace-nowrap",
                          stakeSizeClass(formatMoney(flash.amount, currency)),
                        )}
                      >
                        +
                        <AnimatedMoney
                          amountMinor={flash.amount}
                          currency={currency}
                          countOnMount
                        />
                      </span>
                      {flash.finale && (
                        <span className="text-muted-foreground text-xs font-medium">
                          {t("expenses.slotFullyAllocated")}
                        </span>
                      )}
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
              disabled={poolUids.length < 2 || amountMinor <= 0}
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
              <Button type="button" size="lg" className="flex-1" onClick={applyResult}>
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={pulling || effectiveStake <= 0}
              onClick={pull}
            >
              {Object.keys(tallies).length > 0
                ? t("expenses.slotPullAgain")
                : t("expenses.slotPull")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
