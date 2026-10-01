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
  SLOT_SPINS_PER_TURN,
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
  playBigWinSound,
  playBombSound,
  playCoinSound,
  playDrumrollSound,
  playFreeSpinsIntroSound,
  playGiggleSound,
  playJackpotSound,
  playLeverSound,
  playReelStopSound,
  playRollupSound,
  playSourSound,
  playStampSound,
  playStarSound,
  playWinLineSound,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import {
  AmbientBubbles,
  BombFlash,
  BulbRow,
  EmojiShower,
  FloatingBubbles,
  LOSS_RED,
  LedPanel,
  RollupMoney,
  SlotSymbolFace,
  SlotWinBanner,
  WIN_GOLD,
  WinLine,
  type BulbMode,
  type FloatBubble,
  type WinTier,
} from "@/components/groups/split-game/slot-fx";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import type { GroupMember } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translate";

type Step = "setup" | "playing";
type StakeChoice = SlotDuration | "custom";

const DURATIONS: SlotDuration[] = ["short", "normal", "long"];

/** Row height in px, and how many rows the window shows — the classic 3-symbol payline. */
const ROW_HEIGHT = 64;
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
/** A three-of-a-kind shows its lit line and pulsing symbols this long before the takeover. */
const LINE_SHOW_MS = 750;
/** How long amount bubbles float before the list is cleared. */
const BUBBLE_HOLD_MS = 2600;
/** How long each kind of win banner holds, unless tapped away. */
const BANNER_HOLD_MS: Record<WinTier, number> = {
  win: 2400,
  freeSpins: 2600,
  big: 3200,
  mega: 3600,
  jackpot: 5200,
};
/** How long the amount on a win banner takes to roll up. */
const ROLLUP_S = 1.6;
/** What the reels show before the first pull: a row of sevens on the payline, as bait. */
const IDLE_STRIPS: SlotSymbol[][] = [
  ["bell", "seven", "cherry"],
  ["lemon", "seven", "star"],
  ["cherry", "seven", "bomb"],
];
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

/** Combinations that are good news for the person at the machine. */
const GOOD_KINDS: ReadonlySet<SlotOutcomeKind> = new Set([
  "pair",
  "cherries",
  "bells",
  "stars",
  "jackpot",
]);

/** The good three-of-a-kinds get a casino win banner, in these tiers. */
const BANNER_TIER: Partial<Record<SlotOutcomeKind, WinTier>> = {
  cherries: "freeSpins",
  bells: "big",
  stars: "mega",
  jackpot: "jackpot",
};

const BANNER_LABEL: Record<WinTier, TranslationKey> = {
  win: "expenses.slotWinBig",
  freeSpins: "expenses.slotWinFreeSpins",
  big: "expenses.slotWinBig",
  mega: "expenses.slotWinMega",
  jackpot: "expenses.slotWinJackpot",
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

/** Short, shouty versions for the stamp and the LED panel. */
const OUTCOME_SHORT: Record<SlotOutcomeKind, TranslationKey> = {
  miss: "expenses.slotStampMiss",
  pair: "expenses.slotStampPair",
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
  cherries: ["🍒", "🍒", "✨", "🪙"],
  bells: ["🔔", "🪙", "🪙", "🎵"],
  stars: ["⭐", "🌟", "🪙", "🪙", "🍻"],
  bombs: ["💥", "🔥", "💨"],
  jackpot: ["🪙", "🪙", "💶", "💎"],
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

/** Which reels make up the combination: all three for a triple, the matching two for a pair. */
function winningReels(faces: readonly SlotSymbol[], kind: SlotOutcomeKind): number[] {
  if (kind === "miss") return [];
  if (kind !== "pair") return [0, 1, 2];
  const matched = faces[0] === faces[1] || faces[0] === faces[2] ? faces[0] : faces[1];
  return [0, 1, 2].filter((reel) => faces[reel] === matched);
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

type SymbolState = "idle" | "win" | "dim";

/**
 * One reel row. A symbol that is part of a combination pulses and glows, the
 * way a slot animates the symbols on the line that paid; the others dim so
 * the combination reads at a glance.
 */
function ReelSymbol({
  symbol,
  state,
  glow,
}: {
  symbol: SlotSymbol;
  state: SymbolState;
  glow: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="flex shrink-0 items-center justify-center" style={{ height: ROW_HEIGHT }}>
      <motion.span
        className="block"
        style={{ filter: state === "win" ? `drop-shadow(0 0 8px ${glow})` : undefined }}
        animate={
          state === "win" && !reduceMotion
            ? { scale: [1, 1.28, 1.08, 1.22, 1.1], rotate: [0, -6, 4, -2, 0] }
            : { scale: 1, rotate: 0, opacity: state === "dim" ? 0.3 : 1 }
        }
        transition={
          state === "win" && !reduceMotion
            ? { duration: 1.1, ease: "easeInOut", repeat: 2, repeatType: "mirror" }
            : { duration: 0.25 }
        }
      >
        <SlotSymbolFace symbol={symbol} className="text-[40px]" />
      </motion.span>
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

interface Takeover {
  id: number;
  result: SlotSpinResult;
  /** The rubber-stamp slip for a costly result, or the casino banner for a win. */
  style: "slip" | "banner";
  /** This spin used up the rest of the bill. */
  finale: boolean;
}

/**
 * Spielautomat, played the way an online slot is: everyone takes turns at
 * one machine, three pulls in a row each, and the combination on the payline
 * decides what happens to the bill — see `slot-machine.ts` for the paytable
 * and the rules. Each pull is drawn crypto-randomly by the game module
 * first; the reels only animate toward a result that is already settled.
 *
 * The presentation borrows from real slots: an LED panel on the cabinet,
 * the winning symbols pulsing on a lit line, amounts floating up as bubbles,
 * win banners in tiers on a sunburst with the amount rolling up, coins
 * fountaining out, and a free-spins mode with its own gold cabinet. A plain
 * no-win, the most common pull by far, stays small: three pulls in a row
 * with a takeover on each would wear thin fast.
 *
 * The game always finishes exactly on the expense's total, so `onResolve`
 * hands back the per-person amounts actually owed, not an equal split.
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
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [bubbles, setBubbles] = useState<FloatBubble[]>([]);
  const pendingSpinRef = useRef<SlotSpinResult | null>(null);
  const takeoverIdRef = useRef(0);
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
  const inFreeSpins = game !== null && !done && game.freeSpinsLeft > 0;
  const spinNumber = game ? SLOT_SPINS_PER_TURN - game.turnSpinsLeft + 1 : 1;
  const upNext =
    game && spinner && game.seats.length - game.out.length > 1
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
    setTakeover(null);
    setBubbles([]);
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

  function dismissTakeover() {
    clearTimers();
    setTakeover(null);
  }

  function pull() {
    if (!game || pulling || done) return;
    // Pulling again mid-celebration clears it at once, so the new spin is
    // never hidden behind the previous one's takeover.
    clearTimers();
    setTakeover(null);
    setBubbles([]);
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

  const name = (uid: string) => members[uid]?.displayName ?? "?";

  /** The amounts that float up off the machine after a pull. */
  function bubblesFor(result: SlotSpinResult, id: number): FloatBubble[] {
    const list: FloatBubble[] = result.charges.map((charge, index) => ({
      id: `${id}-${index}`,
      tone: charge.amountMinor < 0 ? "win" : "loss",
      label: `${charge.amountMinor < 0 ? "−" : "+"}${formatMoney(Math.abs(charge.amountMinor), currency)} · ${name(charge.uid)}`,
    }));
    if (result.kind === "pair") {
      list.push({
        id: `${id}-pair`,
        tone: "win",
        label: `🪙 ${t("expenses.slotBubbleStakeBack")}`,
      });
    } else if (result.kind === "miss" && result.freeSpin) {
      list.push({ id: `${id}-free`, tone: "win", label: `🍒 ${t("expenses.slotBubbleFreeMiss")}` });
    } else if (result.freeSpinsAwarded > 0) {
      list.push({
        id: `${id}-fs`,
        tone: "win",
        label: t("expenses.slotFreeSpinsAwarded", { count: result.freeSpinsAwarded }),
      });
    }
    return list;
  }

  function showTakeover(result: SlotSpinResult, id: number, finale: boolean) {
    const tier = BANNER_TIER[result.kind];
    const charged = result.charges.filter((charge) => charge.amountMinor > 0);
    if (tier) {
      switch (result.kind) {
        case "cherries":
          playFreeSpinsIntroSound();
          break;
        case "bells":
          playBellSound();
          playBigWinSound(0.35);
          playRollupSound(ROLLUP_S, 0.7);
          break;
        case "stars":
          playStarSound();
          playBigWinSound(0.25);
          playRollupSound(ROLLUP_S, 0.7);
          break;
        case "jackpot":
          playJackpotSound();
          if (result.charges.some((charge) => charge.amountMinor < 0)) {
            playRollupSound(ROLLUP_S, 0.9);
          }
          break;
      }
      shakeStage(result.kind === "jackpot" ? 1.6 : 0.8, 0.1);
      setTakeover({ id, result, style: "banner", finale });
      later(BANNER_HOLD_MS[tier] + (finale ? 600 : 0), () => setTakeover(null));
      return;
    }

    // A costly result: the till slip with a stamp, for whoever got charged.
    if (charged.length === 0) return;
    if (result.kind === "bombs") {
      playBombSound();
    } else {
      playStampSound(STAMP_IMPACT_S);
      if (result.kind === "lemons") playSourSound(STAMP_IMPACT_S + 0.08);
      else playGiggleSound(STAMP_IMPACT_S + 0.12);
    }
    shakeStage(result.kind === "bombs" ? 2.4 : finale ? 1.4 : 1);
    setTakeover({ id, result, style: "slip", finale });
    later(CATCH_FLASH_HOLD_MS + (result.kind === "bombs" ? 1200 : 300) + (finale ? 500 : 0), () =>
      setTakeover(null),
    );
  }

  function celebrate(result: SlotSpinResult) {
    takeoverIdRef.current += 1;
    const id = takeoverIdRef.current;
    const finale = isSlotGameOver(result.state);
    const combo = result.kind !== "miss";

    setBubbles(bubblesFor(result, id));
    later(BUBBLE_HOLD_MS, () => setBubbles([]));

    if (combo && GOOD_KINDS.has(result.kind)) playWinLineSound();

    const takesOver =
      result.kind === "lemons" || result.kind === "bombs" || BANNER_TIER[result.kind] || finale;
    if (!takesOver) {
      // The everyday pulls stay on the machine: a coin clink for a pair or a
      // free no-win, a dry thump for a paid no-win.
      if (result.kind === "pair" || result.charges.length === 0) playCoinSound();
      else playStampSound();
      return;
    }
    later(combo ? LINE_SHOW_MS : 0, () => showTakeover(result, id, finale));
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
    celebrate(pending);
  }

  function applyResult() {
    if (!game) return;
    playAppliedSound();
    onResolve({ ...game.tallies });
    handleOpenChange(false);
  }

  const liveText = pulling
    ? t("expenses.slotSpinningLabel")
    : lastResult
      ? t("expenses.slotSpinResult", {
          name: name(lastResult.spinner),
          outcome: t(OUTCOME_TITLE[lastResult.kind]),
          detail: t(OUTCOME_DETAIL[lastResult.kind]),
        })
      : "";

  const landed = lastResult !== null && !pulling && reels[0].length > 0 ? lastResult : null;
  const landedGood = landed !== null && GOOD_KINDS.has(landed.kind);
  const winReels = landed ? winningReels(landed.faces, landed.kind) : [];
  const lineColor = landedGood ? WIN_GOLD : LOSS_RED;
  const bulbMode: BulbMode = pulling
    ? "chase"
    : takeover?.style === "banner" || (landed && winReels.length === 3 && landedGood)
      ? "party"
      : inFreeSpins
        ? "chase"
        : "idle";

  function slipCaption(result: SlotSpinResult, finale: boolean): ReactNode {
    const charged = result.charges.filter((charge) => charge.amountMinor > 0);
    const amount = charged.reduce((sum, charge) => sum + charge.amountMinor, 0);
    return (
      <span className="flex flex-col items-center gap-1.5">
        <FacesRow faces={result.faces} />
        <span className="font-heading text-lg leading-tight font-semibold">
          {t(OUTCOME_TITLE[result.kind])}
        </span>
        {amount > 0 && (
          <span
            className={cn(
              "font-heading leading-none font-semibold whitespace-nowrap",
              stakeSizeClass(formatMoney(amount, currency)),
            )}
          >
            +<AnimatedMoney amountMinor={amount} currency={currency} countOnMount />
          </span>
        )}
        {finale && (
          <span className="text-muted-foreground text-xs font-medium">
            {t("expenses.slotFullyAllocated")}
          </span>
        )}
      </span>
    );
  }

  function bannerBody(result: SlotSpinResult, finale: boolean): ReactNode {
    const charged = result.charges.filter((charge) => charge.amountMinor > 0);
    const refund = result.charges.find((charge) => charge.amountMinor < 0);
    const bigGold =
      "font-heading text-4xl leading-none font-bold text-[oklch(0.9_0.14_88)] drop-shadow-[0_0_12px_oklch(0.85_0.17_85/0.8)]";
    return (
      <>
        <span className="text-sm font-semibold text-white/85">{t(OUTCOME_TITLE[result.kind])}</span>
        {result.kind === "cherries" && (
          <>
            <motion.span
              className={bigGold}
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: [0, 1.4, 1] }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              +{result.freeSpinsAwarded}
            </motion.span>
            <span className="text-xs text-white/75">{t("expenses.slotFreeSpinsDetail")}</span>
          </>
        )}
        {result.kind === "bells" && charged[0] && (
          <>
            <RollupMoney
              amountMinor={charged[0].amountMinor}
              currency={currency}
              duration={ROLLUP_S}
              delay={0.7}
              prefix="+"
              className={bigGold}
            />
            <span className="flex items-center gap-1.5 text-xs text-white/80">
              <GameAvatar name={name(charged[0].uid)} className="size-5 text-[10px]" />
              {t("expenses.slotBellsPays", { name: name(charged[0].uid) })}
            </span>
          </>
        )}
        {result.kind === "stars" && (
          <span className="flex w-full flex-col gap-1">
            {charged.map((charge, index) => (
              <span
                key={charge.uid}
                className="flex items-center justify-between gap-2 rounded-full bg-black/30 px-3 py-1 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <GameAvatar name={name(charge.uid)} className="size-5 text-[10px]" />
                  <span className="truncate">{name(charge.uid)}</span>
                </span>
                <RollupMoney
                  amountMinor={charge.amountMinor}
                  currency={currency}
                  duration={ROLLUP_S}
                  delay={0.7 + index * 0.15}
                  prefix="+"
                  className="font-bold text-[oklch(0.9_0.14_88)]"
                />
              </span>
            ))}
          </span>
        )}
        {result.kind === "jackpot" && (
          <>
            {refund ? (
              <>
                <RollupMoney
                  amountMinor={-refund.amountMinor}
                  currency={currency}
                  duration={ROLLUP_S}
                  delay={0.9}
                  prefix="−"
                  className={bigGold}
                />
                <span className="text-xs text-white/80">
                  {t("expenses.slotJackpotRefund", {
                    amount: formatMoney(-refund.amountMinor, currency),
                  })}
                </span>
              </>
            ) : (
              <span className="text-sm text-white/85">{t("expenses.slotJackpotOut")}</span>
            )}
            {result.lastPayer && charged[0] && (
              <span className="text-xs font-medium text-white/90">
                {t("expenses.slotLastPays", {
                  name: name(result.lastPayer),
                  amount: formatMoney(charged[0].amountMinor, currency),
                })}
              </span>
            )}
          </>
        )}
        {finale && (
          <span className="text-xs font-medium text-white/75">
            {t("expenses.slotFullyAllocated")}
          </span>
        )}
      </>
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
                      spins: SLOT_DURATION_ROUNDS[stakeChoice] * SLOT_SPINS_PER_TURN,
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
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-[border-color,background-color] duration-(--duration-base)",
                    inFreeSpins && "border-[oklch(0.84_0.16_85)] bg-[oklch(0.84_0.16_85/0.08)]",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <motion.span
                      key={spinner}
                      initial={reduceMotion ? false : { scale: 0.5, rotate: -14 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 380, damping: 12 }}
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
                    {inFreeSpins ? (
                      <motion.span
                        key={game.freeSpinsLeft}
                        initial={reduceMotion ? false : { scale: 1.4 }}
                        animate={{ scale: 1 }}
                        className="rounded-full bg-[linear-gradient(180deg,oklch(0.9_0.13_90),oklch(0.75_0.16_70))] px-2 py-0.5 text-xs font-bold text-[oklch(0.3_0.07_60)] shadow-[0_0_10px_oklch(0.84_0.16_85/0.6)]"
                      >
                        🍒 {t("expenses.slotFreeSpinsBadge", { count: game.freeSpinsLeft })}
                      </motion.span>
                    ) : (
                      <span
                        className="flex items-center gap-1"
                        aria-label={t("expenses.slotSpinCount", {
                          current: spinNumber,
                          total: SLOT_SPINS_PER_TURN,
                        })}
                      >
                        {Array.from({ length: SLOT_SPINS_PER_TURN }, (_, index) => (
                          <span
                            key={index}
                            className={cn(
                              "block size-2.5 rounded-full border transition-colors duration-(--duration-base)",
                              index < spinNumber - 1
                                ? "border-primary bg-primary"
                                : index === spinNumber - 1
                                  ? "border-primary bg-primary/30"
                                  : "border-border",
                            )}
                          />
                        ))}
                      </span>
                    )}
                    {upNext && (
                      <span className="text-muted-foreground max-w-32 truncate text-xs">
                        {t("expenses.slotNextUp", { name: name(upNext) })}
                      </span>
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
            </div>

            <div className="relative flex items-center justify-center py-1">
              {/*
                The cabinet: a paper card like every other surface in the app,
                with marquee bulbs along its top and bottom, an LED panel like
                a real machine's BET / WIN meters, and the reels in pressed-in
                wells. During free spins it turns gold and fizzes.
              */}
              <motion.div
                aria-hidden="true"
                className={cn(
                  "bg-card shadow-e2 relative flex flex-col gap-1.5 rounded-2xl px-3.5 py-2 ring-1 transition-shadow duration-(--duration-slow)",
                  inFreeSpins
                    ? "shadow-[0_0_24px_oklch(0.84_0.16_85/0.55)] ring-2 ring-[oklch(0.84_0.16_85)]"
                    : "ring-foreground/10",
                )}
              >
                <span className="bg-paper-texture pointer-events-none absolute inset-0 rounded-2xl opacity-70" />
                {inFreeSpins && (
                  <>
                    <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[oklch(0.84_0.16_85/0.12)]" />
                    <AmbientBubbles count={14} className="absolute inset-0 rounded-2xl" />
                  </>
                )}
                <BulbRow count={10} mode={bulbMode} />
                <LedPanel
                  cells={[
                    {
                      label: t("expenses.slotLedStake"),
                      value: formatMoney(game.stakeMinor, currency),
                    },
                    inFreeSpins
                      ? {
                          label: t("expenses.slotLedFreeSpins"),
                          value: String(game.freeSpinsLeft),
                          blink: true,
                        }
                      : {
                          label: t("expenses.slotLedSpin"),
                          value: done ? "–" : `${spinNumber}/${SLOT_SPINS_PER_TURN}`,
                        },
                    {
                      label: t("expenses.slotLedLast"),
                      value: landed ? t(OUTCOME_SHORT[landed.kind]) : "–",
                      blink: landedGood,
                      tone: landed && !landedGood && landed.charges.length > 0 ? "loss" : "win",
                    },
                  ]}
                />
                <span className="border-l-primary absolute top-[58%] left-1 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent" />
                <span className="border-r-primary absolute top-[58%] right-1 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent" />
                <div ref={reelsRef} className="relative flex gap-1.5">
                  {[0, 1, 2].map((reelIndex) => {
                    const spun = reels[reelIndex].length > 0;
                    const strip = spun ? reels[reelIndex] : IDLE_STRIPS[reelIndex];
                    const winnerIndex = strip.length - 3;
                    const targetY = -(winnerIndex - 1) * ROW_HEIGHT;
                    const teased = reelIndex === 2 && strip.length > STRIP_LENGTH;
                    const inCombo = winReels.includes(reelIndex);
                    return (
                      <div
                        key={reelIndex}
                        className={cn(
                          "bg-muted shadow-pressed relative overflow-hidden rounded-lg transition-shadow duration-(--duration-base)",
                          reelIndex === 2 &&
                            teasing &&
                            "ring-primary shadow-[0_0_18px_var(--primary)] ring-2",
                          inFreeSpins && "bg-[oklch(0.84_0.16_85/0.14)]",
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
                              glow={lineColor}
                              state={
                                !landed || winReels.length === 0
                                  ? "idle"
                                  : rowIndex === winnerIndex && inCombo
                                    ? "win"
                                    : "dim"
                              }
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
                            inCombo ? "border-transparent" : "border-primary/45",
                          )}
                          style={{
                            top: ROW_HEIGHT,
                            height: ROW_HEIGHT,
                            backgroundColor: inCombo
                              ? `color-mix(in oklch, ${lineColor} 18%, transparent)`
                              : undefined,
                          }}
                        />
                      </div>
                    );
                  })}
                  {landed && winReels.length > 0 && (
                    <WinLine
                      key={pullId}
                      rowTop={ROW_HEIGHT}
                      rowHeight={ROW_HEIGHT}
                      color={lineColor}
                    />
                  )}
                </div>
                <BulbRow count={10} mode={bulbMode} />
              </motion.div>

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

              <FloatingBubbles bubbles={bubbles} />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
              </span>
              <TallyList game={game} members={members} currency={currency} />
            </div>

            <Paytable />

            {/* The takeovers: a stamped slip for what costs, a casino banner for a win. */}
            <AnimatePresence>
              {takeover?.result.kind === "bombs" && <BombFlash key={`bomb-${takeover.id}`} />}
            </AnimatePresence>
            <AnimatePresence>
              {takeover?.style === "slip" && (
                <CatchFlash
                  key={takeover.id}
                  seed={takeover.result.state.spins}
                  name={name(
                    takeover.result.charges.find((charge) => charge.amountMinor > 0)?.uid ??
                      takeover.result.spinner,
                  )}
                  stampLabel={t(OUTCOME_SHORT[takeover.result.kind])}
                  finale={takeover.finale || takeover.result.kind === "bombs"}
                  caption={slipCaption(takeover.result, takeover.finale)}
                />
              )}
              {takeover?.style === "banner" && (
                <SlotWinBanner
                  key={takeover.id}
                  tier={BANNER_TIER[takeover.result.kind] ?? "win"}
                  tierLabel={t(BANNER_LABEL[BANNER_TIER[takeover.result.kind] ?? "win"])}
                  name={name(takeover.result.spinner)}
                  faces={takeover.result.faces}
                  onDismiss={dismissTakeover}
                >
                  {bannerBody(takeover.result, takeover.finale)}
                </SlotWinBanner>
              )}
            </AnimatePresence>
            {takeover && OUTCOME_GLYPHS[takeover.result.kind] && (
              <EmojiShower
                key={`shower-${takeover.id}`}
                anchorRef={reelsRef}
                seed={takeover.id * 7919}
                glyphs={OUTCOME_GLYPHS[takeover.result.kind] ?? []}
                mode={takeover.style === "banner" ? "fountain" : "burst"}
                count={takeover.style === "banner" ? 34 : 18}
              />
            )}
            {takeover?.result.kind === "jackpot" && (
              <EmojiShower
                key={`rain-${takeover.id}`}
                seed={takeover.id * 104729}
                glyphs={["🪙", "🪙", "🪙", "💶"]}
                mode="rain"
                count={56}
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
            <Button
              type="button"
              size="lg"
              className={cn(
                "flex-1 font-bold",
                inFreeSpins &&
                  "bg-[linear-gradient(180deg,oklch(0.9_0.13_90),oklch(0.72_0.16_65))] text-[oklch(0.28_0.07_55)] shadow-[0_0_16px_oklch(0.84_0.16_85/0.6)] hover:brightness-105",
              )}
              disabled={pulling}
              onClick={pull}
            >
              {inFreeSpins
                ? `🍒 ${t("expenses.slotPullFree")}`
                : `${t("expenses.slotPull")} · ${spinNumber}/${SLOT_SPINS_PER_TURN}`}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
