"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { AnimatedMoney } from "@/components/ui/animated-money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatMoney, moneyToInput, parseMoneyInput } from "@/lib/format/money";
import { randomInt, secureShuffle } from "@/lib/games/random";
import {
  SLOT_DURATION_ROUNDS,
  SLOT_PAYTABLE,
  SLOT_SYMBOLS,
  SLOT_TOTAL_WEIGHT,
  isSlotGameOver,
  nextSlotPlayer,
  slotAllocated,
  slotRemaining,
  slotSpinner,
  slotStakeForDuration,
  spinSlot,
  startSlotGame,
  type SlotDuration,
  type SlotGameState,
  type SlotOutcomeKind,
  type SlotRandom,
  type SlotSpinResult,
  type SlotSymbol,
} from "@/lib/games/slot-machine";
import {
  playAppliedSound,
  playBellSound,
  playBombSound,
  playCoinSound,
  playDrumrollSound,
  playFreeSpinSound,
  playGiggleSound,
  playJackpotSound,
  playLeverSound,
  playReelStopSound,
  playSourSound,
  playStampSound,
  playStarSound,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import {
  BombFlash,
  BulbRow,
  EmojiShower,
  SlotSymbolFace,
  type BulbMode,
} from "@/components/groups/split-game/slot-fx";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import type { GroupMember } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translate";

type Step = "setup" | "playing";
type StakeChoice = SlotDuration | "custom";

const DURATIONS: SlotDuration[] = ["short", "normal", "long"];

/** Row height in px, and how many rows the window shows — the classic 3-symbol payline. */
const ROW_HEIGHT = 56;
const VISIBLE_ROWS = 3;
const STRIP_LENGTH = 22;
/** The teased third reel travels further, so it can keep spinning fast while the drum rolls. */
const TEASE_STRIP_LENGTH = 46;
/** Reels stop one at a time, left to right, each holding a little longer than the last. */
const REEL_DURATIONS = [1.3, 1.8, 2.3];
/** When the first two reels match, the third keeps everyone waiting. */
const TEASE_DURATION = 4;
/** How far a reel overshoots its landing spot before snapping back — a real reel doesn't stop dead. */
const OVERSHOOT = ROW_HEIGHT * 0.22;
/** What the reels show before the first pull: a row of sevens on the payline, as bait. */
const IDLE_STRIPS: SlotSymbol[][] = [
  ["bell", "seven", "cherry"],
  ["lemon", "seven", "star"],
  ["cherry", "seven", "bomb"],
];
/** How long the inline "stake back" note stays up after a pair. */
const PAIR_NOTE_HOLD_MS = 1600;
/**
 * The lever's resting and pulled angles. It pivots from the housing like the
 * handle of a desk stamp or a hole punch, swinging down through an arc, rather
 * than sliding down a track the way a one-armed bandit's does.
 */
const LEVER_REST_DEG = -34;
const LEVER_PULLED_DEG = 32;
/** A loose spring for the lever snapping back up: it should visibly bounce, like a real return spring. */
const LEVER_RETURN_SPRING = { type: "spring", stiffness: 320, damping: 11, mass: 0.8 } as const;

/** Crypto-backed randomness for the game module: who pays must not be predictable. */
const cryptoRandom: SlotRandom = {
  int: randomInt,
  shuffle: (items) => secureShuffle([...items]),
};

/** How loud each combination gets, which decides its effects and how long the slip holds. */
const OUTCOME_TIER: Record<SlotOutcomeKind, "small" | "normal" | "big" | "epic"> = {
  pair: "small",
  miss: "normal",
  lemons: "big",
  cherries: "big",
  bells: "big",
  stars: "big",
  bombs: "epic",
  jackpot: "epic",
};

const OUTCOME_TITLE: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotOutcomeMiss",
  pair: "expenses.slotOutcomePair",
  lemons: "expenses.slotOutcomeLemons",
  cherries: "expenses.slotOutcomeCherries",
  bells: "expenses.slotOutcomeBells",
  stars: "expenses.slotOutcomeStars",
  bombs: "expenses.slotOutcomeBombs",
  jackpot: "expenses.slotOutcomeJackpot",
};

const OUTCOME_DETAIL: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotOutcomeMissDetail",
  pair: "expenses.slotOutcomePairDetail",
  lemons: "expenses.slotOutcomeLemonsDetail",
  cherries: "expenses.slotOutcomeCherriesDetail",
  bells: "expenses.slotOutcomeBellsDetail",
  stars: "expenses.slotOutcomeStarsDetail",
  bombs: "expenses.slotOutcomeBombsDetail",
  jackpot: "expenses.slotOutcomeJackpotDetail",
};

const OUTCOME_STAMP: Record<Exclude<SlotOutcomeKind, "pair">, TranslationKey> = {
  miss: "expenses.slotStampMiss",
  lemons: "expenses.slotStampLemons",
  cherries: "expenses.slotStampCherries",
  bells: "expenses.slotStampBells",
  stars: "expenses.slotStampStars",
  bombs: "expenses.slotStampBombs",
  jackpot: "expenses.slotStampJackpot",
};

/** What flies out of the reels for the three-of-a-kind combinations. */
const OUTCOME_GLYPHS: Partial<Record<SlotOutcomeKind, string[]>> = {
  lemons: ["🍋", "🍋", "💦"],
  cherries: ["🍒", "🍒", "✨"],
  bells: ["🔔", "🔔", "🎵"],
  stars: ["⭐", "🌟", "✨", "🍻"],
  bombs: ["💥", "🔥", "💨"],
  jackpot: ["🪙", "🪙", "💶", "7️⃣"],
};

function durationLabelKey(duration: SlotDuration): TranslationKey {
  if (duration === "short") return "expenses.slotDurationShort";
  if (duration === "long") return "expenses.slotDurationLong";
  return "expenses.slotDurationNormal";
}

/**
 * The amount on the till slip is the headline, so it's set as large as the
 * slip allows. It steps down for long amounts: at 390px wide the slip has
 * about 200px for "+1.234,56 €", which only fits in Fraunces at 24px.
 */
function stakeSizeClass(formatted: string): string {
  if (formatted.length <= 7) return "text-4xl";
  if (formatted.length <= 9) return "text-3xl";
  return "text-2xl";
}

/**
 * Filler symbols above and below the landing row are purely decorative — the
 * combination itself came from the game module's crypto-random draw, so
 * `Math.random` here can't affect who actually pays.
 */
function buildReelStrip(face: SlotSymbol, length: number): SlotSymbol[] {
  return Array.from({ length }, (_, i) =>
    i === length - 3 ? face : SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)],
  );
}

function ReelSymbol({ symbol, landed }: { symbol: SlotSymbol; landed: boolean }) {
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ height: ROW_HEIGHT }}>
      <span className={cn("block", landed && "animate-laugh-land")}>
        <SlotSymbolFace symbol={symbol} className="text-[34px]" />
      </span>
    </span>
  );
}

function FacesRow({ faces, className }: { faces: readonly SlotSymbol[]; className?: string }) {
  return (
    <span className={cn("flex items-center justify-center gap-1", className)}>
      {faces.map((face, index) => (
        <SlotSymbolFace key={index} symbol={face} className="text-xl" />
      ))}
    </span>
  );
}

/** The combinations and what they do, with their real odds — nothing about this machine is hidden. */
function Paytable({ className }: { className?: string }) {
  const t = useT();
  const rows = [...SLOT_PAYTABLE].reverse();
  return (
    <details className={cn("group rounded-xl border", className)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-2.5 text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">📜</span>
          {t("expenses.slotPaytableTitle")}
        </span>
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform duration-(--duration-fast) group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <ul className="flex flex-col gap-1 px-2.5 pb-2.5">
        {rows.map((entry) => (
          <li key={entry.kind} className="flex items-center gap-2.5 text-xs">
            <span aria-hidden="true" className="flex w-16 shrink-0 justify-center">
              {entry.symbol ? (
                <FacesRow faces={[entry.symbol, entry.symbol, entry.symbol]} />
              ) : entry.kind === "pair" ? (
                <FacesRow faces={["cherry", "cherry"]} className="opacity-80" />
              ) : (
                <span className="text-muted-foreground text-base">—</span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{t(OUTCOME_TITLE[entry.kind])}</span>{" "}
              <span className="text-muted-foreground">{t(OUTCOME_DETAIL[entry.kind])}</span>
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {Math.round((entry.weight / SLOT_TOTAL_WEIGHT) * 100)} %
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Running "who owes how much so far" breakdown — both the live mid-game state and the final result use this. */
function TallyList({
  game,
  members,
  currency,
}: {
  game: SlotGameState;
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();
  const entries = Object.entries(game.tallies)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  if (entries.length === 0 && game.out.length === 0) {
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
      {game.out.map((uid) => (
        <li
          key={uid}
          className="animate-rise border-primary/30 bg-primary/5 flex items-center justify-between gap-2 rounded-lg border border-dashed p-2 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <GameAvatar name={members[uid].displayName} className="size-7 shrink-0 text-xs" />
            <span className="truncate">{members[uid].displayName}</span>
          </span>
          <span className="text-primary shrink-0 text-xs font-semibold">
            {t("expenses.slotOutBadge")}
          </span>
        </li>
      ))}
    </ul>
  );
}

interface FlashState {
  id: number;
  result: SlotSpinResult;
  /** This spin used up the rest of the bill. */
  finale: boolean;
}

/**
 * Spielautomat, played the way a real slot machine is: everyone takes turns
 * at one machine, and the combination on the payline decides what happens
 * to the bill — see `slot-machine.ts` for the paytable and the rules. Each
 * pull is drawn crypto-randomly by the game module first; the reels only
 * animate toward a result that is already settled. The game always finishes
 * exactly on the expense's total, so `onResolve` hands back the per-person
 * amounts actually owed, not an equal split.
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
  const [stakeChoice, setStakeChoice] = useState<StakeChoice>("normal");
  const [customStakeInput, setCustomStakeInput] = useState("1,00");
  const [game, setGame] = useState<SlotGameState | null>(null);
  const [pullId, setPullId] = useState(0);
  const [reels, setReels] = useState<SlotSymbol[][]>([[], [], []]);
  const [reelStopped, setReelStopped] = useState([true, true, true]);
  const [teasing, setTeasing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [lastResult, setLastResult] = useState<SlotSpinResult | null>(null);
  const [flash, setFlash] = useState<FlashState | null>(null);
  const [pairNoteId, setPairNoteId] = useState<number | null>(null);
  const [partyUntilId, setPartyUntilId] = useState<number | null>(null);
  const pendingSpinRef = useRef<SlotSpinResult | null>(null);
  const flashIdRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reelsRef = useRef<HTMLDivElement | null>(null);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();

  function clearTimers() {
    for (const timeout of timeoutsRef.current) clearTimeout(timeout);
    timeoutsRef.current = [];
  }

  function later(ms: number, run: () => void) {
    timeoutsRef.current.push(setTimeout(run, ms));
  }

  useEffect(() => clearTimers, []);

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  const setupStake =
    stakeChoice === "custom"
      ? Math.min(parseMoneyInput(customStakeInput) ?? 0, amountMinor)
      : slotStakeForDuration(amountMinor, poolUids.length, stakeChoice);

  const allocated = game ? slotAllocated(game) : 0;
  const remaining = game ? slotRemaining(game) : amountMinor;
  const done = game !== null && isSlotGameOver(game);
  const spinner = game && !done ? slotSpinner(game) : null;
  const upNext =
    game && spinner && !game.freeSpin && game.seats.length - game.out.length > 1
      ? nextSlotPlayer(game, spinner)
      : null;

  function resetPlay() {
    clearTimers();
    pendingSpinRef.current = null;
    setGame(null);
    setLastResult(null);
    setReels([[], [], []]);
    setReelStopped([true, true, true]);
    setTeasing(false);
    setPulling(false);
    setFlash(null);
    setPairNoteId(null);
    setPartyUntilId(null);
  }

  function startGame() {
    resetPlay();
    setGame(startSlotGame(poolUids, amountMinor, setupStake, cryptoRandom));
    setStep("playing");
  }

  function goToSetup() {
    resetPlay();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetPlay();
      setStep("setup");
    }
    onOpenChange(nextOpen);
  }

  function pull() {
    if (!game || pulling || done) return;
    // Pulling again mid-celebration clears the slip at once, so the new spin
    // is never hidden behind the previous one's scrim.
    clearTimers();
    setFlash(null);
    setPairNoteId(null);
    setPartyUntilId(null);
    const result = spinSlot(game, cryptoRandom);
    pendingSpinRef.current = result;
    const tease = result.faces[0] === result.faces[1];
    setTeasing(false);
    setReels(
      result.faces.map((face, index) =>
        buildReelStrip(face, index === 2 && tease ? TEASE_STRIP_LENGTH : STRIP_LENGTH),
      ),
    );
    setReelStopped([false, false, false]);
    setPulling(true);
    playLeverSound();
    setPullId((id) => id + 1);
  }

  function celebrate(result: SlotSpinResult, finale: boolean) {
    const tier = OUTCOME_TIER[result.kind];
    flashIdRef.current += 1;
    const id = flashIdRef.current;

    if (tier === "small") {
      playCoinSound();
      setPairNoteId(id);
      later(PAIR_NOTE_HOLD_MS, () => setPairNoteId(null));
      return;
    }

    switch (result.kind) {
      case "miss":
        playStampSound(STAMP_IMPACT_S);
        playGiggleSound(STAMP_IMPACT_S + 0.12);
        break;
      case "lemons":
        playStampSound(STAMP_IMPACT_S);
        playSourSound(STAMP_IMPACT_S + 0.08);
        break;
      case "cherries":
        playFreeSpinSound();
        break;
      case "bells":
        playBellSound();
        playStampSound(STAMP_IMPACT_S);
        break;
      case "stars":
        playStarSound();
        playStampSound(STAMP_IMPACT_S);
        break;
      case "bombs":
        playBombSound();
        break;
      case "jackpot":
        playJackpotSound();
        playStampSound(STAMP_IMPACT_S);
        break;
    }

    shakeStage(result.kind === "bombs" ? 2.4 : tier === "epic" ? 1.6 : finale ? 1.4 : 1);
    if (tier !== "normal") setPartyUntilId(id);
    setFlash({ id, result, finale });
    const hold =
      CATCH_FLASH_HOLD_MS +
      (tier === "big" ? 500 : 0) +
      (tier === "epic" ? 1500 : 0) +
      (finale ? 400 : 0);
    later(hold, () => {
      setFlash(null);
      setPartyUntilId(null);
    });
  }

  function handleReelStop(index: number) {
    if (!pulling) return;
    setReelStopped((current) => {
      const next = [...current];
      next[index] = true;
      return next;
    });
    playReelStopSound();
    const pending = pendingSpinRef.current;
    if (index === 1 && pending && pending.faces[0] === pending.faces[1]) {
      setTeasing(true);
      if (!reduceMotion) playDrumrollSound(TEASE_DURATION - REEL_DURATIONS[1] - 0.1);
    }
    if (index < 2) return;

    // Last reel: settle the pending spin into the game.
    setPulling(false);
    setTeasing(false);
    pendingSpinRef.current = null;
    if (!pending) return;
    setGame(pending.state);
    setLastResult(pending);
    celebrate(pending, isSlotGameOver(pending.state));
  }

  function applyResult() {
    if (!game) return;
    playAppliedSound();
    onResolve({ ...game.tallies });
    handleOpenChange(false);
  }

  const name = (uid: string) => members[uid]?.displayName ?? "?";

  const liveText = pulling
    ? t("expenses.slotSpinningLabel")
    : lastResult
      ? t("expenses.slotSpinResult", {
          name: name(lastResult.spinner),
          outcome: t(OUTCOME_TITLE[lastResult.kind]),
          detail: t(OUTCOME_DETAIL[lastResult.kind]),
        })
      : "";

  const landedKind = lastResult && !pulling && reels[0].length > 0 ? lastResult.kind : null;
  const bulbMode: BulbMode = pulling
    ? "chase"
    : partyUntilId !== null && flash?.id === partyUntilId
      ? "party"
      : "idle";

  function flashCaption(result: SlotSpinResult, finale: boolean): ReactNode {
    const charged = result.charges.filter((charge) => charge.amountMinor > 0);
    const refund = result.charges.find((charge) => charge.amountMinor < 0);
    const bigAmount = (amount: number, sign: "+" | "−") => (
      <span
        className={cn(
          "font-heading leading-none font-semibold whitespace-nowrap",
          stakeSizeClass(formatMoney(amount, currency)),
        )}
      >
        {sign}
        <AnimatedMoney amountMinor={amount} currency={currency} countOnMount />
      </span>
    );

    return (
      <span className="flex flex-col items-center gap-1.5">
        <FacesRow faces={result.faces} />
        <span className="font-heading text-lg leading-tight font-semibold">
          {t(OUTCOME_TITLE[result.kind])}
        </span>
        {(result.kind === "miss" || result.kind === "lemons" || result.kind === "bombs") &&
          charged[0] &&
          bigAmount(charged[0].amountMinor, "+")}
        {result.kind === "bells" && charged[0] && (
          <>
            {bigAmount(charged[0].amountMinor, "+")}
            <span className="text-muted-foreground text-xs">
              {t("expenses.slotBellsFrom", { name: name(result.spinner) })}
            </span>
          </>
        )}
        {result.kind === "cherries" && (
          <span className="text-muted-foreground text-xs">
            {t("expenses.slotOutcomeCherriesDetail")}
          </span>
        )}
        {result.kind === "stars" && (
          <span className="flex w-full flex-col gap-0.5 text-sm">
            {charged.map((charge) => (
              <span key={charge.uid} className="flex items-center justify-between gap-2">
                <span className="truncate">{name(charge.uid)}</span>
                <span className="font-semibold whitespace-nowrap">
                  +{formatMoney(charge.amountMinor, currency)}
                </span>
              </span>
            ))}
          </span>
        )}
        {result.kind === "jackpot" && (
          <>
            {refund ? (
              <>
                {bigAmount(-refund.amountMinor, "−")}
                <span className="text-muted-foreground text-xs">
                  {t("expenses.slotJackpotRefund", {
                    amount: formatMoney(-refund.amountMinor, currency),
                  })}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground text-xs">{t("expenses.slotJackpotOut")}</span>
            )}
            {result.lastPayer && charged[0] && (
              <span className="text-xs font-medium">
                {t("expenses.slotLastPays", {
                  name: name(result.lastPayer),
                  amount: formatMoney(charged[0].amountMinor, currency),
                })}
              </span>
            )}
          </>
        )}
        {finale && (
          <span className="text-muted-foreground text-xs font-medium">
            {t("expenses.slotFullyAllocated")}
          </span>
        )}
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎰</span>
            {t("expenses.slotTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.slotIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" || !game ? (
          <div className="flex flex-col gap-4">
            <GamePoolChecklist
              memberUids={memberUids}
              members={members}
              poolUids={poolUids}
              onTogglePoolMember={togglePoolMember}
            />
            {amountMinor <= 0 ? (
              <p className="text-muted-foreground text-xs">{t("expenses.slotNoAmountHint")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                <Label id="slot-duration-label">{t("expenses.slotDurationLabel")}</Label>
                <div
                  role="radiogroup"
                  aria-labelledby="slot-duration-label"
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {[...DURATIONS, "custom" as const].map((choice) => {
                    const selected = stakeChoice === choice;
                    return (
                      <button
                        key={choice}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => {
                          if (choice === "custom" && stakeChoice !== "custom") {
                            setCustomStakeInput(moneyToInput(Math.max(setupStake, 1)));
                          }
                          setStakeChoice(choice);
                        }}
                        className={cn(
                          "ease-spring rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-(--duration-fast) active:scale-95",
                          selected
                            ? "border-primary bg-primary text-primary-foreground shadow-e1"
                            : "border-border bg-background hover:bg-muted",
                        )}
                      >
                        {choice === "custom"
                          ? t("expenses.slotDurationCustom")
                          : t(durationLabelKey(choice))}
                      </button>
                    );
                  })}
                </div>
                {stakeChoice === "custom" ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={customStakeInput}
                        onChange={(event) => setCustomStakeInput(event.target.value)}
                        placeholder={`0,00 ${currency}`}
                        inputMode="decimal"
                        aria-label={t("expenses.slotStakeLabel")}
                        className="h-9 w-28 shrink-0"
                      />
                      <span className="text-muted-foreground text-xs">
                        {t("expenses.slotStakeLabel")}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs">{t("expenses.slotStakeHint")}</p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    {t("expenses.slotDurationHint", {
                      rounds: SLOT_DURATION_ROUNDS[stakeChoice],
                      amount: formatMoney(setupStake, currency),
                    })}
                  </p>
                )}
              </div>
            )}
            <Paytable />
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
              spinner && (
                <div className="flex items-center justify-between gap-2 rounded-xl border p-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <motion.span
                      key={`${spinner}-${game.spins}`}
                      initial={reduceMotion ? false : { scale: 0.6, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={springs.snappy}
                      className="block shrink-0 rounded-full"
                    >
                      <GameAvatar name={name(spinner)} className="shadow-e1 size-10 text-base" />
                    </motion.span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                        {t("expenses.slotAtMachine")}
                      </span>
                      <span className="font-heading truncate text-lg leading-tight font-semibold">
                        {name(spinner)}
                      </span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {game.freeSpin ? (
                      <span className="bg-primary text-primary-foreground animate-rise rounded-full px-2 py-0.5 text-xs font-semibold">
                        🍒 {t("expenses.slotFreeSpinBadge")}
                      </span>
                    ) : (
                      upNext && (
                        <span className="text-muted-foreground max-w-32 truncate text-xs">
                          {t("expenses.slotNextUp", { name: name(upNext) })}
                        </span>
                      )
                    )}
                  </span>
                </div>
              )
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
              <span className="text-muted-foreground text-center text-xs">
                {t("expenses.slotStakeChip", { amount: formatMoney(game.stakeMinor, currency) })}
              </span>
            </div>

            <div className="relative flex items-center justify-center py-1">
              {/*
                The housing is a paper card like every other surface in the
                app, not a black cabinet: reels sit in pressed-in wells, fade
                toward their top and bottom edges the way a drum curves away,
                and the payline is marked with two small notches in the app's
                primary ink. Marquee bulbs run along its top and bottom edge.
              */}
              <div
                aria-hidden="true"
                className="bg-card shadow-e2 ring-foreground/10 relative flex flex-col gap-1.5 rounded-2xl px-3.5 py-2 ring-1"
              >
                <span className="bg-paper-texture pointer-events-none absolute inset-0 rounded-2xl opacity-70" />
                <BulbRow count={9} mode={bulbMode} />
                <span className="border-l-primary absolute top-1/2 left-1 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent" />
                <span className="border-r-primary absolute top-1/2 right-1 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent" />
                <div ref={reelsRef} className="relative flex gap-1.5">
                  {[0, 1, 2].map((reelIndex) => {
                    const spun = reels[reelIndex].length > 0;
                    const strip = spun ? reels[reelIndex] : IDLE_STRIPS[reelIndex];
                    const winnerIndex = strip.length - 3;
                    const targetY = -(winnerIndex - 1) * ROW_HEIGHT;
                    const stopped = reelStopped[reelIndex] && spun;
                    const teased = reelIndex === 2 && strip.length > STRIP_LENGTH;
                    const matched =
                      stopped &&
                      landedKind !== null &&
                      landedKind !== "miss" &&
                      lastResult !== null &&
                      lastResult.faces.filter((face) => face === strip[winnerIndex]).length >= 2;
                    return (
                      <div
                        key={reelIndex}
                        className={cn(
                          "bg-muted shadow-pressed relative overflow-hidden rounded-lg transition-shadow duration-(--duration-base)",
                          reelIndex === 2 &&
                            teasing &&
                            "ring-primary shadow-[0_0_18px_var(--primary)] ring-2",
                        )}
                        style={{ width: ROW_HEIGHT, height: ROW_HEIGHT * VISIBLE_ROWS }}
                      >
                        <motion.div
                          key={`${pullId}-${reelIndex}`}
                          className={cn(
                            "flex flex-col transition-[filter] duration-150",
                            !reelStopped[reelIndex] && "blur-[2px]",
                          )}
                          initial={{ y: 0 }}
                          animate={{ y: spun ? [0, targetY - OVERSHOOT, targetY] : 0 }}
                          transition={
                            reduceMotion
                              ? { duration: 0 }
                              : {
                                  duration: teased ? TEASE_DURATION : REEL_DURATIONS[reelIndex],
                                  times: [0, teased ? 0.93 : 0.86, 1],
                                  ease: [
                                    teased ? [0.2, 0.45, 0.25, 1] : [0.12, 0.68, 0.12, 1],
                                    [0.34, 1.56, 0.64, 1],
                                  ],
                                }
                          }
                          onAnimationComplete={() => handleReelStop(reelIndex)}
                        >
                          {strip.map((symbol, rowIndex) => (
                            <ReelSymbol
                              key={rowIndex}
                              symbol={symbol}
                              landed={matched && rowIndex === winnerIndex}
                            />
                          ))}
                        </motion.div>
                        {/* The drum curving away: rows fade into the well toward its edges. */}
                        <span className="from-muted pointer-events-none absolute inset-x-0 top-0 h-9 bg-linear-to-b to-transparent" />
                        <span className="from-muted pointer-events-none absolute inset-x-0 bottom-0 h-9 bg-linear-to-t to-transparent" />
                        {/* Payline: the middle row is the one that counts. */}
                        <span
                          className={cn(
                            "pointer-events-none absolute inset-x-0 border-y transition-colors duration-(--duration-base)",
                            matched ? "border-primary bg-primary/10" : "border-primary/45",
                          )}
                          style={{ top: ROW_HEIGHT, height: ROW_HEIGHT }}
                        />
                        {matched && (
                          <span
                            key={pullId}
                            className="animate-settle-ring border-primary pointer-events-none absolute left-1/2 size-11 -translate-x-1/2 rounded-full border-2"
                            style={{ top: ROW_HEIGHT + (ROW_HEIGHT - 44) / 2 }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <BulbRow count={9} mode={bulbMode} />
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

              {/* Two of a kind: no takeover, just a coin-clink note over the reels. */}
              <AnimatePresence>
                {pairNoteId !== null && lastResult?.kind === "pair" && (
                  <motion.div
                    key={pairNoteId}
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={springs.snappy}
                    className="bg-card shadow-e2 ring-primary/40 pointer-events-none absolute -bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold whitespace-nowrap ring-1"
                  >
                    <span aria-hidden="true">🪙</span>
                    {t("expenses.slotOutcomePairDetail")}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
              </span>
              <TallyList game={game} members={members} currency={currency} />
            </div>

            <Paytable />

            {/*
              The catch: a till slip with the person and what the reels did to
              them, a rubber stamp in their ink, confetti in their colors, and
              the whole play area jolting on impact (see split-game/celebration).
              The bigger combinations add their own symbols flying out of the
              reels; the bomb flashes, and the jackpot rains coins.
            */}
            <AnimatePresence>
              {flash && flash.result.kind === "bombs" && <BombFlash key={`bomb-${flash.id}`} />}
            </AnimatePresence>
            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={game.spins}
                  name={name(
                    flash.result.kind === "bells"
                      ? (flash.result.charges[0]?.uid ?? flash.result.spinner)
                      : flash.result.spinner,
                  )}
                  stampLabel={t(OUTCOME_STAMP[flash.result.kind as keyof typeof OUTCOME_STAMP])}
                  finale={flash.finale || OUTCOME_TIER[flash.result.kind] === "epic"}
                  caption={flashCaption(flash.result, flash.finale)}
                />
              )}
            </AnimatePresence>
            {flash && OUTCOME_GLYPHS[flash.result.kind] && (
              <EmojiShower
                key={`shower-${flash.id}`}
                anchorRef={reelsRef}
                seed={flash.id * 7919}
                glyphs={OUTCOME_GLYPHS[flash.result.kind] ?? []}
                count={OUTCOME_TIER[flash.result.kind] === "epic" ? 26 : 16}
              />
            )}
            {flash && flash.result.kind === "jackpot" && (
              <EmojiShower
                key={`rain-${flash.id}`}
                seed={flash.id * 104729}
                glyphs={["🪙", "🪙", "🪙", "💶"]}
                mode="rain"
                count={48}
                delay={0.3}
              />
            )}
          </div>
        )}

        <DialogFooter>
          {step === "setup" || !game ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={poolUids.length < 2 || amountMinor <= 0 || setupStake <= 0}
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
            <Button type="button" size="lg" className="flex-1" disabled={pulling} onClick={pull}>
              {game.freeSpin ? t("expenses.slotPullFree") : t("expenses.slotPull")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
