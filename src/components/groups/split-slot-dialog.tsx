"use client";

import { useRef, useState } from "react";
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
  playCoinSound,
  playLeverSound,
  playMissSound,
} from "@/lib/sound/game-sounds";
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
const HOLD_MS = 900;

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

function ReelSymbol({ name }: { name: string }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-lg font-bold text-white"
      style={{ height: ROW_HEIGHT, backgroundColor: memberColor(name) }}
    >
      {name.charAt(0).toUpperCase() || "?"}
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
          <span className="tabular-money shrink-0 font-medium">
            {formatMoney(amount, currency)}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface FlashState {
  id: number;
  amount: number;
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
    if (index < 2) {
      playMissSound();
      return;
    }

    // Last reel: settle the pending spin into the tallies.
    playCoinSound();
    setPulling(false);
    const pending = pendingSpinRef.current;
    pendingSpinRef.current = null;
    if (!pending) return;
    setTallies((current) => ({
      ...current,
      [pending.uid]: (current[pending.uid] ?? 0) + pending.amount,
    }));
    setLastSpin(pending);

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashIdRef.current += 1;
    setFlash({ id: flashIdRef.current, amount: pending.amount });
    flashTimeoutRef.current = setTimeout(() => setFlash(null), HOLD_MS);
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
      <DialogContent className="sm:max-w-md">
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
          <div className="flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {liveText}
            </p>

            {!done && (
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

            <div className="bg-muted/40 flex items-center justify-between gap-2 rounded-xl border p-3 text-sm">
              <span className="text-muted-foreground">
                {done
                  ? t("expenses.slotFullyAllocated")
                  : t("expenses.slotRemaining", {
                      amount: formatMoney(remaining, currency),
                      total: formatMoney(amountMinor, currency),
                    })}
              </span>
              <span className="font-heading tabular-money text-lg font-medium">
                {formatMoney(allocated, currency)}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
              </span>
              <TallyList tallies={tallies} members={members} currency={currency} />
            </div>

            <div className="flex items-center justify-center gap-3 py-1">
              <div className="relative">
                <div
                  aria-hidden="true"
                  className="bg-foreground/90 shadow-e2 relative flex gap-1.5 rounded-xl p-2"
                >
                  {[0, 1, 2].map((reelIndex) => (
                    <div
                      key={reelIndex}
                      className="relative overflow-hidden rounded-md bg-black/20"
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
                          y: reels[reelIndex].length > 0 ? [0, TARGET_Y - OVERSHOOT, TARGET_Y] : 0,
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
                          <ReelSymbol key={rowIndex} name={members[uid]?.displayName ?? "?"} />
                        ))}
                      </motion.div>
                      {/* Payline: the middle row is the one that counts. */}
                      <div
                        aria-hidden="true"
                        className={cn(
                          "border-primary/70 pointer-events-none absolute inset-x-0 border-y-2 transition-[box-shadow] duration-300",
                          "shadow-[0_0_0_9999px_rgba(0,0,0,0.15)]",
                          !pulling && lastSpin && "animate-settle-ring",
                        )}
                        style={{ top: ROW_HEIGHT, height: ROW_HEIGHT }}
                      />
                    </div>
                  ))}
                </div>

                <AnimatePresence>
                  {flash && (
                    <motion.div
                      key={flash.id}
                      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 0, scale: 0.7 }}
                      animate={
                        reduceMotion ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: -48, scale: 1 }
                      }
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.4 : 1.1, times: [0, 0.15, 0.75, 1] }}
                      className="text-destructive pointer-events-none absolute inset-x-0 top-1/2 z-20 text-center text-xl font-bold drop-shadow"
                    >
                      +{formatMoney(flash.amount, currency)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Decorative lever — purely a visual echo of the pull, not its own control. */}
              <div
                aria-hidden="true"
                className="flex h-full flex-col items-center justify-center gap-0.5"
              >
                <span className="bg-foreground/20 h-16 w-1.5 rounded-full" />
                <motion.span
                  className="bg-destructive ring-popover shadow-e1 -mt-[4.6rem] size-5 rounded-full ring-2"
                  animate={{ y: pulling ? 44 : 0 }}
                  transition={reduceMotion ? { duration: 0 } : springs.snappy}
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
