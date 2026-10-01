"use client";

import { type ReactNode, useEffect, useEffectEvent, useRef, useState } from "react";
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
  SLOT_GOOD_KINDS,
  SLOT_SPINS_PER_TURN,
  SLOT_SYMBOLS,
  SLOT_WHEEL_SEGMENTS,
  applySlotChoice,
  applySlotGamble,
  applySlotGiftPick,
  applySlotHold,
  drawSlotDuel,
  drawSlotGamble,
  drawSlotHold,
  isSlotGameOver,
  nextSlotPlayer,
  slotAllocated,
  slotChoiceCandidates,
  slotRemaining,
  slotSpinner,
  slotStakeForDuration,
  spinSlot,
  startSlotGame,
  type SlotCharge,
  type SlotDuelOutcome,
  type SlotDuration,
  type SlotGameState,
  type SlotOutcomeKind,
  type SlotPrizeOutcome,
  type SlotRandom,
  type SlotSpinResult,
  type SlotSymbol,
} from "@/lib/games/slot-machine";
import {
  playAppliedSound,
  playBellSound,
  playBigWinSound,
  playBombSound,
  playBuzzerSound,
  playCashRegisterSound,
  playCoinSound,
  playDrumrollSound,
  playFreeSpinsIntroSound,
  playGhostSound,
  playGiftOpenSound,
  playGiggleSound,
  playJackpotSound,
  playLeverSound,
  playMysterySound,
  playReelStopSound,
  playRollupSound,
  playSourSound,
  playStampSound,
  playStarSound,
  playSwordSound,
  playTickSound,
  playWinLineSound,
  setGameSoundsMuted,
} from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import {
  AmbientBubbles,
  BONUS_WHEEL_SPIN_MS,
  BombFlash,
  BonusWheel,
  BulbRow,
  CoinChip,
  DUEL_REVEAL_MS,
  DuelReveal,
  EmojiShower,
  FloatingBubbles,
  GambleFlip,
  GiftPicker,
  JackpotMarquee,
  LOSS_RED,
  LedPanel,
  RollupMoney,
  SlotWinBanner,
  WIN_GOLD,
  WinLine,
  type BulbMode,
  type FloatBubble,
  type WinTier,
} from "@/components/groups/split-game/slot-fx";
import {
  EMPTY_SLOT_STATS,
  FacesRow,
  OUTCOME_DETAIL,
  OUTCOME_SHORT,
  OUTCOME_TITLE,
  Paytable,
  PlayerBadges,
  ROW_HEIGHT,
  ReelSymbol,
  SlotAwards,
  TallyList,
  WildBadge,
  usePrizeFace,
  type SlotStats,
} from "@/components/groups/split-game/slot-parts";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolChecklist } from "@/components/groups/split-game/game-pool-checklist";
import type { GroupMember } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translate";

type Step = "setup" | "playing";
type StakeChoice = SlotDuration | "custom";

const DURATIONS: SlotDuration[] = ["short", "normal", "long"];

const VISIBLE_ROWS = 3;
const STRIP_LENGTH = 22;
/** The teased third reel travels further, so it can keep spinning fast while the drum rolls. */
const TEASE_STRIP_LENGTH = 46;
/** Reels stop one at a time, left to right, each holding a little longer than the last. */
const REEL_DURATIONS = [1.3, 1.8, 2.3];
/** When the first two reels match, the third keeps everyone waiting. */
const TEASE_DURATION = 4;
/** A held pair's respin: one reel, always teased. */
const RESPIN_DURATION = 2.6;
/** How far a reel overshoots its landing spot before snapping back — a real reel doesn't stop dead. */
const OVERSHOOT = ROW_HEIGHT * 0.22;
/** A three-of-a-kind shows its lit line and pulsing symbols this long before the takeover. */
const LINE_SHOW_MS = 750;
/** How long amount bubbles float before the list is cleared. */
const BUBBLE_HOLD_MS = 2600;
/** Coins sit on the reels this long before flying into the pot. */
const COIN_COLLECT_MS = 850;
/** Mystery symbols sit on the payline this long before turning over. */
const MYSTERY_REVEAL_MS = 700;
/** How long each kind of win banner holds, unless tapped away. */
const BANNER_HOLD_MS: Record<WinTier, number> = {
  win: 2400,
  freeSpins: 2600,
  big: 3200,
  mega: 3600,
  jackpot: 5200,
};
/** A banner that only announces a decision (clover, duel, gift) gets out of the way sooner. */
const ANNOUNCE_HOLD_MS = 1800;
/** How long the Risiko coin spins, and how long its verdict stays up. */
const GAMBLE_SPIN_MS = 1450;
const GAMBLE_HOLD_MS = 2400;
/** How long an opened gift box stays up before the game goes on. */
const GIFT_HOLD_MS = 2200;
/** How long the amount on a win banner takes to roll up. */
const ROLLUP_S = 1.6;
/** Turbo: everything runs at this share of its normal time. */
const TURBO_SPEED = 0.4;
/** The pause between auto-spin pulls. */
const AUTO_GAP_MS = 650;
/** Per-device settings, remembered in this browser only. */
const TURBO_KEY = "split:slot-turbo";
const SOUND_KEY = "split:game-sound-off";
/** What the reels show before the first pull: a row of sevens on the payline, as bait. */
const IDLE_STRIPS: SlotSymbol[][] = [
  ["bell", "seven", "wheel"],
  ["gift", "seven", "star"],
  ["swords", "seven", "clover"],
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

/** The three-of-a-kinds that get a casino banner, and its tier. The wheel gets its own wheel. */
const BANNER_TIER: Partial<Record<SlotOutcomeKind, WinTier>> = {
  cherries: "freeSpins",
  bells: "big",
  stars: "mega",
  clover: "big",
  receipt: "big",
  ghost: "big",
  gift: "big",
  duel: "big",
  jackpot: "jackpot",
};

const BANNER_LABEL: Partial<Record<SlotOutcomeKind, TranslationKey>> = {
  cherries: "expenses.slotWinFreeSpins",
  bells: "expenses.slotWinBig",
  stars: "expenses.slotWinMega",
  clover: "expenses.slotWinClover",
  receipt: "expenses.slotWinReceipt",
  ghost: "expenses.slotWinGhost",
  gift: "expenses.slotWinGift",
  duel: "expenses.slotWinDuel",
  jackpot: "expenses.slotWinJackpot",
};

/** What flies out of the reels for the three-of-a-kind combinations. */
const OUTCOME_GLYPHS: Partial<Record<SlotOutcomeKind, string[]>> = {
  lemons: ["🍋", "🍋", "💦"],
  cherries: ["🍒", "🍒", "✨", "🪙"],
  bells: ["🔔", "🪙", "🪙", "🎵"],
  stars: ["⭐", "🌟", "🪙", "🪙", "🍻"],
  clover: ["🍀", "🍀", "✨", "🪙"],
  receipt: ["🧾", "💸", "🧾"],
  gift: ["🎁", "🎀", "✨"],
  duel: ["⚔️", "🛡️", "✨"],
  ghost: ["👻", "👻", "💨"],
  bombs: ["💥", "🔥", "💨"],
  jackpot: ["🪙", "🪙", "💶", "💎"],
};

/**
 * One full-screen moment after a pull. Several can follow each other (a
 * three-of-a-kind, then the coin pot paying out), so they queue up.
 */
type Takeover =
  | {
      id: number;
      style: "slip";
      /** Who the slip is for, and what they were charged. */
      uid: string;
      amountMinor: number;
      kind: SlotOutcomeKind;
      faces: readonly SlotSymbol[];
      wild: boolean;
      finale: boolean;
    }
  | { id: number; style: "banner"; result: SlotSpinResult; finale: boolean }
  | { id: number; style: "wheel"; result: SlotSpinResult; finale: boolean }
  | { id: number; style: "pot"; result: SlotSpinResult; finale: boolean };

interface GambleFlipState {
  id: number;
  uid: string;
  won: boolean;
  stakeMinor: number;
  deltaMinor: number;
}

interface DuelShow {
  id: number;
  duel: SlotDuelOutcome;
  charge: SlotCharge | null;
}

interface GiftShow {
  picked: number;
  outcome: SlotPrizeOutcome;
  boxes: readonly SlotPrizeOutcome["prize"][];
}

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

/** The ghost is good news only if the spinner swapped down. */
function isGoodResult(result: SlotSpinResult): boolean {
  if (result.kind === "ghost") {
    return result.swap !== null && result.swap.otherBefore < result.swap.spinnerBefore;
  }
  return SLOT_GOOD_KINDS.has(result.kind);
}

/** Which reels make up the combination: all three for a triple, the matching two for a pair. */
function winningReels(faces: readonly SlotSymbol[], kind: SlotOutcomeKind): number[] {
  if (kind === "miss") return [];
  if (kind !== "pair") return [0, 1, 2];
  const matched = faces[0] === faces[1] || faces[0] === faces[2] ? faces[0] : faces[1];
  return [0, 1, 2].filter((reel) => faces[reel] === matched);
}

/** The first two reels already promise a combination: the third gets the drum roll. */
function teases(faces: readonly SlotSymbol[]): boolean {
  return faces[0] === faces[1] || faces[0] === "wild" || faces[1] === "wild";
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

/**
 * Which payline reels hide behind a ❓ until they turn over. Purely
 * presentation (the result is already drawn): some three-of-a-kinds hide two
 * or three of their symbols, and the odd no-win hides one to tease.
 */
function pickMysteryReels(result: SlotSpinResult): number[] {
  const roll = Math.random();
  if (result.kind !== "miss" && result.kind !== "pair" && roll < 0.3) {
    return roll < 0.12 ? [0, 1, 2] : [0, 2];
  }
  if (result.kind === "miss" && roll < 0.08) return [Math.floor(Math.random() * 3)];
  return [];
}

function readFlag(key: string): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Private mode or blocked storage: the setting just won't stick.
  }
}

/** A short buzz on phones that support it (Android). iOS ignores the Vibration API. */
function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    // Not supported: nothing to do.
  }
}

/**
 * Spielautomat, played the way an online slot is: everyone takes turns at
 * one machine, three pulls in a row each, and the combination on the payline
 * decides what happens to the bill — see `slot-machine.ts` for the paytable
 * and the rules. Each pull is drawn crypto-randomly by the game module
 * first; the reels only animate toward a result that is already settled.
 *
 * The presentation borrows from real slots: a progressive jackpot marquee
 * and an LED panel on the cabinet, the winning symbols pulsing on a lit
 * line, ❓ mystery symbols turning over, a 💎 wild, amounts floating up as
 * bubbles, win banners in tiers on a sunburst, a bonus wheel, gift boxes, a
 * duel, free spins whose coins fly into a pot at a rising multiplier, a
 * Halten button to respin the odd reel of a pair, and a Risiko button
 * (double or nothing on a loss) like a German pub machine's. Turbo,
 * auto-spin and a sound switch keep a long game moving, and an award show
 * closes it. A plain no-win, the most common pull by far, stays small.
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
  const prizeFace = usePrizeFace();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [stakeChoice, setStakeChoice] = useState<StakeChoice>("normal");
  const [customStakeInput, setCustomStakeInput] = useState("1,00");
  const [game, setGame] = useState<SlotGameState | null>(null);
  const [reelKeys, setReelKeys] = useState([0, 0, 0]);
  const [reels, setReels] = useState<SlotSymbol[][]>([[], [], []]);
  const [reelStopped, setReelStopped] = useState([true, true, true]);
  const [heldReels, setHeldReels] = useState<number[]>([]);
  const [mysteryReels, setMysteryReels] = useState<number[]>([]);
  const [mysteryRevealed, setMysteryRevealed] = useState(true);
  const [teasing, setTeasing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [lastResult, setLastResult] = useState<SlotSpinResult | null>(null);
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [bubbles, setBubbles] = useState<FloatBubble[]>([]);
  const [coinsFlying, setCoinsFlying] = useState(false);
  const [gambleFlip, setGambleFlip] = useState<GambleFlipState | null>(null);
  const [duelShow, setDuelShow] = useState<DuelShow | null>(null);
  const [giftShow, setGiftShow] = useState<GiftShow | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [stats, setStats] = useState<SlotStats>(EMPTY_SLOT_STATS);
  const [turbo, setTurbo] = useState(() => readFlag(TURBO_KEY));
  const [soundOff, setSoundOff] = useState(() => readFlag(SOUND_KEY));
  const [auto, setAuto] = useState<{ uid: string } | null>(null);
  const pendingSpinRef = useRef<SlotSpinResult | null>(null);
  /**
   * Which reels are spinning and which have stopped, kept in a ref rather
   * than state: with reduced motion every reel finishes in the same tick,
   * and each callback has to see the others' stops straight away.
   */
  const spinRef = useRef<{ reels: number[]; stopped: Set<number> }>({
    reels: [],
    stopped: new Set(),
  });
  const queueRef = useRef<Takeover[]>([]);
  const idRef = useRef(0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const reelsRef = useRef<HTMLDivElement | null>(null);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();
  const speed = turbo ? TURBO_SPEED : 1;
  const ms = (value: number) => Math.round(value * speed);

  function clearTimers() {
    for (const timeout of timeoutsRef.current) clearTimeout(timeout);
    timeoutsRef.current = [];
  }

  function later(delay: number, run: () => void) {
    timeoutsRef.current.push(setTimeout(run, delay));
  }

  function nextId() {
    idRef.current += 1;
    return idRef.current;
  }

  useEffect(() => clearTimers, []);
  useEffect(() => setGameSoundsMuted(soundOff), [soundOff]);

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
  const busy =
    pulling || gambleFlip !== null || duelShow !== null || giftShow !== null || announcing;
  const pending = game?.pending ?? null;
  const choosing = pending && pending.type !== "gift" && !busy && !takeover ? pending : null;
  const gifting = pending?.type === "gift" && !takeover && !pulling && !announcing ? pending : null;
  const gambleOffer = game?.gamble && !busy && !pending ? game.gamble : null;
  const holdOffer = game?.hold && !busy && !pending ? game.hold : null;

  function resetPlay() {
    clearTimers();
    pendingSpinRef.current = null;
    spinRef.current = { reels: [], stopped: new Set() };
    queueRef.current = [];
    setGame(null);
    setLastResult(null);
    setReels([[], [], []]);
    setReelStopped([true, true, true]);
    setHeldReels([]);
    setMysteryReels([]);
    setMysteryRevealed(true);
    setTeasing(false);
    setPulling(false);
    setTakeover(null);
    setBubbles([]);
    setCoinsFlying(false);
    setGambleFlip(null);
    setDuelShow(null);
    setGiftShow(null);
    setAnnouncing(false);
    setStats(EMPTY_SLOT_STATS);
    setAuto(null);
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

  function toggleTurbo() {
    writeFlag(TURBO_KEY, !turbo);
    setTurbo(!turbo);
  }

  function toggleSound() {
    writeFlag(SOUND_KEY, !soundOff);
    setSoundOff(!soundOff);
  }

  const name = (uid: string) => members[uid]?.displayName ?? "?";
  const money = (minor: number) => formatMoney(minor, currency);

  function chargeBubbles(charges: SlotCharge[], id: number | string): FloatBubble[] {
    return charges.map((charge, index) => ({
      id: `${id}-${index}`,
      tone: charge.amountMinor < 0 ? "win" : "loss",
      label: `${charge.amountMinor < 0 ? "−" : "+"}${money(Math.abs(charge.amountMinor))} · ${name(charge.uid)}`,
    }));
  }

  function showBubbles(list: FloatBubble[]) {
    setBubbles(list.slice(0, 5));
    later(ms(BUBBLE_HOLD_MS) + 600, () => setBubbles([]));
  }

  /** Keeps the award show's numbers: the hardest single hit, Risiko presses, jackpots. */
  function track(charges: SlotCharge[], extra?: { risk?: string; jackpot?: string }) {
    setStats((current) => {
      let biggestHit = current.biggestHit;
      for (const charge of charges) {
        if (charge.amountMinor > (biggestHit?.amountMinor ?? 0)) {
          biggestHit = { uid: charge.uid, amountMinor: charge.amountMinor };
        }
      }
      const risks = extra?.risk
        ? { ...current.risks, [extra.risk]: (current.risks[extra.risk] ?? 0) + 1 }
        : current.risks;
      const jackpots = extra?.jackpot ? [...current.jackpots, extra.jackpot] : current.jackpots;
      return { biggestHit, risks, jackpots };
    });
  }

  /** Sound, shake and buzz for a takeover as it comes up. */
  function playTakeover(next: Takeover) {
    if (next.style === "pot") {
      playBigWinSound();
      playRollupSound(ROLLUP_S * speed, 0.7);
      shakeStage(0.8, 0.1);
      vibrate([40, 40, 80]);
      return;
    }
    if (next.style === "wheel") {
      playStarSound();
      return;
    }
    if (next.style === "slip") {
      if (next.kind === "bombs") {
        playBombSound();
        vibrate([120, 60, 200]);
      } else {
        playStampSound(STAMP_IMPACT_S);
        if (next.kind === "lemons") playSourSound(STAMP_IMPACT_S + 0.08);
        else if (next.kind === "duel") playSwordSound();
        else playGiggleSound(STAMP_IMPACT_S + 0.12);
        vibrate(60);
      }
      shakeStage(next.kind === "bombs" ? 2.4 : next.finale ? 1.4 : 1);
      return;
    }
    const result = next.result;
    switch (result.kind) {
      case "cherries":
        playFreeSpinsIntroSound();
        break;
      case "bells":
        playBellSound();
        playBigWinSound(0.35);
        playRollupSound(ROLLUP_S * speed, 0.7);
        break;
      case "stars":
        playStarSound();
        playBigWinSound(0.25);
        playRollupSound(ROLLUP_S * speed, 0.7);
        break;
      case "clover":
      case "gift":
        playStarSound();
        playBigWinSound(0.2);
        break;
      case "duel":
        playSwordSound();
        break;
      case "receipt":
        playCashRegisterSound();
        playStampSound(0.35);
        break;
      case "ghost":
        playGhostSound();
        break;
      case "jackpot":
        playJackpotSound();
        if (result.charges.length > 0) playRollupSound(ROLLUP_S * speed, 0.9);
        vibrate([100, 50, 100, 50, 300]);
        break;
    }
    if (result.kind !== "duel" && result.kind !== "gift") vibrate([40, 40, 80]);
    shakeStage(result.kind === "jackpot" ? 1.6 : result.kind === "receipt" ? 1.2 : 0.8, 0.1);
  }

  function holdFor(next: Takeover): number {
    const finale = next.finale ? 600 : 0;
    if (next.style === "pot") return ms(BANNER_HOLD_MS.mega) + finale;
    if (next.style === "wheel") return BONUS_WHEEL_SPIN_MS + ms(2000) + finale;
    if (next.style === "slip") {
      return ms(CATCH_FLASH_HOLD_MS + (next.kind === "bombs" ? 1200 : 300)) + finale;
    }
    if (next.result.state.pending) return ms(ANNOUNCE_HOLD_MS);
    return ms(BANNER_HOLD_MS[BANNER_TIER[next.result.kind] ?? "win"]) + finale;
  }

  /** Shows the next queued takeover, or clears the stage when there is none. */
  function advance() {
    const next = queueRef.current.shift();
    if (!next) {
      setTakeover(null);
      return;
    }
    playTakeover(next);
    setTakeover(next);
    later(holdFor(next), advance);
  }

  function present(list: Takeover[]) {
    queueRef.current = list;
    advance();
  }

  function dismissTakeover() {
    clearTimers();
    advance();
  }

  /**
   * Sets the reels in `reelIndexes` spinning toward `result`. The others stay
   * exactly where they are, which is what a held pair's respin needs.
   */
  function animateReels(result: SlotSpinResult, reelIndexes: number[], respin = false) {
    pendingSpinRef.current = result;
    spinRef.current = { reels: reelIndexes, stopped: new Set() };
    const tease = !respin && teases(result.faces);
    setTeasing(respin);
    setReels((current) =>
      current.map((strip, index) =>
        reelIndexes.includes(index)
          ? buildReelStrip(
              result.faces[index],
              index === 2 && tease ? TEASE_STRIP_LENGTH : STRIP_LENGTH,
            )
          : strip,
      ),
    );
    setReelKeys((current) =>
      current.map((key, index) => (reelIndexes.includes(index) ? key + 1 : key)),
    );
    setReelStopped((current) =>
      current.map((stopped, index) => (reelIndexes.includes(index) ? false : stopped)),
    );
    const mystery = respin ? [] : pickMysteryReels(result);
    setMysteryReels(mystery);
    setMysteryRevealed(mystery.length === 0);
    setPulling(true);
    if (respin && !reduceMotion) playDrumrollSound(RESPIN_DURATION * speed - 0.1);
  }

  function clearStage() {
    clearTimers();
    queueRef.current = [];
    setTakeover(null);
    setBubbles([]);
    setCoinsFlying(false);
    setHeldReels([]);
  }

  function pull() {
    if (!game || busy || done || game.pending) return;
    // Pulling again mid-celebration clears it at once, so the new spin is
    // never hidden behind the previous one's takeover.
    clearStage();
    const result = spinSlot(game, cryptoRandom);
    playLeverSound();
    animateReels(result, [0, 1, 2]);
  }

  /** Halten: keep the pair, respin the odd reel once. */
  function holdAndRespin() {
    if (!game?.hold || busy) return;
    clearStage();
    const hold = game.hold;
    const result = applySlotHold(game, drawSlotHold(cryptoRandom), cryptoRandom);
    setHeldReels([0, 1, 2].filter((reel) => reel !== hold.reel));
    playLeverSound();
    animateReels(result, [hold.reel], true);
  }

  /** The bubbles that float up off the machine after a pull. */
  function bubblesFor(result: SlotSpinResult, id: number): FloatBubble[] {
    const list: FloatBubble[] = [];
    if (result.pity) {
      list.push({ id: `${id}-pity`, tone: "win", label: t("expenses.slotBubblePity") });
    }
    if (result.respin) {
      list.push({
        id: `${id}-hold`,
        tone: result.respin.completed ? "win" : "loss",
        label: result.respin.completed
          ? t("expenses.slotBubbleHoldHit")
          : t("expenses.slotBubbleHoldMiss"),
      });
    }
    if (result.wild) {
      list.push({ id: `${id}-wild`, tone: "win", label: t("expenses.slotWildBadge") });
    }
    if (result.boosted) {
      list.push({ id: `${id}-boost`, tone: "win", label: t("expenses.slotBubbleBoost") });
    }
    if (result.shieldUsed) {
      list.push({ id: `${id}-shield`, tone: "win", label: t("expenses.slotBubbleShield") });
    }
    list.push(...chargeBubbles(result.charges, id));
    if (result.kind === "pair" && !result.respin) {
      list.push({
        id: `${id}-pair`,
        tone: "win",
        label: `🪙 ${t("expenses.slotBubbleStakeBack")}`,
      });
    } else if (result.kind === "miss" && result.freeSpin) {
      list.push({
        id: `${id}-free`,
        tone: "win",
        label: `🍒 ${t("expenses.slotBubbleFreeMiss")}`,
      });
    } else if (result.freeSpinsAwarded > 0) {
      list.push({
        id: `${id}-fs`,
        tone: "win",
        label: t("expenses.slotFreeSpinsAwarded", { count: result.freeSpinsAwarded }),
      });
    }
    if (result.coinsCollectedMinor > 0) {
      list.push({
        id: `${id}-coins`,
        tone: "win",
        label: t("expenses.slotBubbleCoins", {
          amount: money(result.coinsCollectedMinor),
          multiplier: result.coinMultiplier,
        }),
      });
    }
    return list;
  }

  /** The takeovers a pull earns, in the order they play. */
  function takeoversFor(result: SlotSpinResult, finale: boolean): Takeover[] {
    const list: Takeover[] = [];
    const laterFinale = finale && result.potPayout !== null;
    if (result.wheel) {
      list.push({ id: nextId(), style: "wheel", result, finale: finale && !laterFinale });
    } else if (BANNER_TIER[result.kind]) {
      list.push({ id: nextId(), style: "banner", result, finale: finale && !laterFinale });
    } else if (result.kind === "lemons" || result.kind === "bombs" || (finale && !laterFinale)) {
      const charged = result.charges.filter((charge) => charge.amountMinor > 0);
      const last = charged[charged.length - 1];
      if (last) {
        const uid = result.kind === "lemons" || result.kind === "bombs" ? result.spinner : last.uid;
        list.push({
          id: nextId(),
          style: "slip",
          uid,
          amountMinor: charged
            .filter((charge) => charge.uid === uid)
            .reduce((sum, charge) => sum + charge.amountMinor, 0),
          kind: result.kind,
          faces: result.faces,
          wild: result.wild,
          finale,
        });
      }
    }
    if (result.potPayout) list.push({ id: nextId(), style: "pot", result, finale });
    return list;
  }

  function celebrate(result: SlotSpinResult) {
    const id = nextId();
    const finale = isSlotGameOver(result.state);
    const combo = result.kind !== "miss";

    showBubbles(bubblesFor(result, id));
    if (result.coins.length > 0) {
      later(COIN_COLLECT_MS, () => {
        setCoinsFlying(true);
        playCoinSound();
      });
    }
    if (combo && isGoodResult(result)) playWinLineSound();

    const list = takeoversFor(result, finale);
    if (list.length === 0) {
      // The everyday pulls stay on the machine: a coin clink for a pair or a
      // free no-win, a dry thump for a paid no-win.
      if (result.kind === "pair" || result.charges.length === 0) playCoinSound();
      else playStampSound();
      return;
    }
    const wait = combo ? ms(LINE_SHOW_MS) : result.coins.length > 0 ? COIN_COLLECT_MS + 400 : 0;
    // A decision (clover, duel, gift) waits for its banner before its panel opens.
    if (result.state.pending) {
      setAnnouncing(true);
      later(wait + ms(ANNOUNCE_HOLD_MS) + 200, () => setAnnouncing(false));
    }
    later(wait, () => present(list));
  }

  /** The reels have landed: settle the pull into the game and celebrate it. */
  function commit(result: SlotSpinResult) {
    setPulling(false);
    setTeasing(false);
    setGame(result.state);
    setLastResult(result);
    track(result.charges, { jackpot: result.kind === "jackpot" ? result.spinner : undefined });
    celebrate(result);
  }

  function handleReelStop(index: number) {
    const spin = spinRef.current;
    if (!spin.reels.includes(index) || spin.stopped.has(index)) return;
    spin.stopped.add(index);
    setReelStopped((current) => current.map((value, i) => (i === index ? true : value)));
    playReelStopSound();
    const result = pendingSpinRef.current;
    if (index === 1 && spin.reels.length === 3 && result && teases(result.faces)) {
      setTeasing(true);
      if (!reduceMotion) playDrumrollSound((TEASE_DURATION - REEL_DURATIONS[1]) * speed - 0.1);
    }
    if (spin.stopped.size < spin.reels.length) return;

    spinRef.current = { reels: [], stopped: new Set() };
    pendingSpinRef.current = null;
    if (!result) return;
    if (mysteryReels.length > 0) {
      // The ❓s turn over first; the result only counts once everyone has seen it.
      later(ms(MYSTERY_REVEAL_MS), () => {
        playMysterySound();
        setMysteryRevealed(true);
        later(ms(450), () => commit(result));
      });
      return;
    }
    commit(result);
  }

  /** Clover or duel: the person who pulled it points at someone. */
  function choose(target: string) {
    if (!game?.pending || game.pending.type === "gift") return;
    if (game.pending.type === "clover") {
      const { state, charge } = applySlotChoice(game, target);
      setGame(state);
      if (!charge) return;
      track([charge]);
      const id = nextId();
      showBubbles(chargeBubbles([charge], id));
      present([
        {
          id,
          style: "slip",
          uid: charge.uid,
          amountMinor: charge.amountMinor,
          kind: "clover",
          faces: lastResult?.faces ?? ["clover", "clover", "clover"],
          wild: lastResult?.wild ?? false,
          finale: isSlotGameOver(state),
        },
      ]);
      return;
    }
    const { state, charge, duel } = applySlotChoice(game, target, drawSlotDuel(cryptoRandom));
    if (!duel) return;
    const id = nextId();
    setDuelShow({ id, duel, charge });
    playSwordSound();
    later(DUEL_REVEAL_MS - 600, () => playReelStopSound());
    later(DUEL_REVEAL_MS - 100, () => {
      setGame(state);
      if (charge) {
        track([charge]);
        showBubbles(chargeBubbles([charge], id));
      }
      playStampSound();
      vibrate(80);
    });
    later(DUEL_REVEAL_MS + ms(1600), () => {
      setDuelShow(null);
      if (!charge) return;
      present([
        {
          id: nextId(),
          style: "slip",
          uid: charge.uid,
          amountMinor: charge.amountMinor,
          kind: "duel",
          faces: lastResult?.faces ?? ["swords", "swords", "swords"],
          wild: lastResult?.wild ?? false,
          finale: isSlotGameOver(state),
        },
      ]);
    });
  }

  /** Gift: the person who pulled it opens a box. */
  function openGift(index: number) {
    if (game?.pending?.type !== "gift" || giftShow) return;
    const boxes = game.pending.boxes;
    const { state, outcome } = applySlotGiftPick(game, index);
    setGiftShow({ picked: index, outcome, boxes });
    playGiftOpenSound();
    later(ms(GIFT_HOLD_MS) + 400, () => {
      setGiftShow(null);
      setGame(state);
      track(outcome.charges);
      const id = nextId();
      const face = prizeFace(outcome.prize);
      showBubbles([
        { id: `${id}-prize`, tone: "win", label: `${face.icon} ${face.label}` },
        ...chargeBubbles(outcome.charges, id),
      ]);
      if (outcome.prize === "freeSpins") playFreeSpinsIntroSound();
      else if (outcome.prize === "pay3") playStampSound();
      else playWinLineSound();
    });
  }

  /** Risiko: flip a coin on the loss just taken — struck off, or doubled. */
  function risk() {
    if (!game?.gamble || busy) return;
    clearStage();
    const gamble = game.gamble;
    const won = drawSlotGamble(cryptoRandom);
    const { state, charge } = applySlotGamble(game, won);
    const id = nextId();
    setGambleFlip({
      id,
      uid: gamble.uid,
      won,
      stakeMinor: gamble.amountMinor,
      deltaMinor: charge?.amountMinor ?? 0,
    });
    if (!reduceMotion) playDrumrollSound(GAMBLE_SPIN_MS / 1000 - 0.1);
    later(reduceMotion ? 0 : GAMBLE_SPIN_MS, () => {
      setGame(state);
      track(charge && charge.amountMinor > 0 ? [charge] : [], { risk: gamble.uid });
      if (won) {
        playWinLineSound();
        playCoinSound();
      } else {
        playBuzzerSound();
        shakeStage(1.2, 0);
        vibrate(120);
      }
      if (charge) showBubbles(chargeBubbles([charge], `${id}-risk`));
    });
    later((reduceMotion ? 0 : GAMBLE_SPIN_MS) + ms(GAMBLE_HOLD_MS), () => setGambleFlip(null));
  }

  /** Auto-spin: pulls the rest of the series by itself, pausing for anything that needs a person. */
  const autoStep = useEffectEvent(() => {
    if (!auto || !game) return;
    if (done || slotSpinner(game) !== auto.uid) {
      setAuto(null);
      return;
    }
    pull();
  });
  const autoReady = auto !== null && game !== null && !done && !busy && !takeover && !game.pending;
  const autoGap = ms(AUTO_GAP_MS);
  useEffect(() => {
    if (!autoReady) return;
    const timeout = setTimeout(autoStep, autoGap);
    return () => clearTimeout(timeout);
  }, [autoReady, autoGap, game]);

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
  const landedGood = landed !== null && isGoodResult(landed);
  const winReels = landed ? winningReels(landed.faces, landed.kind) : [];
  const lineColor = landedGood ? WIN_GOLD : LOSS_RED;
  const bulbMode: BulbMode = pulling
    ? "chase"
    : (takeover && takeover.style !== "slip") || (landed && winReels.length === 3 && landedGood)
      ? "party"
      : inFreeSpins
        ? "chase"
        : "idle";
  const reelDuration = (reelIndex: number, teased: boolean) =>
    (heldReels.length > 0 ? RESPIN_DURATION : teased ? TEASE_DURATION : REEL_DURATIONS[reelIndex]) *
    speed;
  const giftBoxes = gifting?.boxes ?? giftShow?.boxes ?? [];

  function slipCaption(slip: Extract<Takeover, { style: "slip" }>): ReactNode {
    return (
      <span className="flex flex-col items-center gap-1.5">
        <FacesRow faces={slip.faces} />
        {slip.wild && <WildBadge />}
        <span className="font-heading text-lg leading-tight font-semibold">
          {t(OUTCOME_TITLE[slip.kind])}
        </span>
        {slip.amountMinor > 0 && (
          <span
            className={cn(
              "font-heading leading-none font-semibold whitespace-nowrap",
              stakeSizeClass(money(slip.amountMinor)),
            )}
          >
            +<AnimatedMoney amountMinor={slip.amountMinor} currency={currency} countOnMount />
          </span>
        )}
        {slip.finale && (
          <span className="text-muted-foreground text-xs font-medium">
            {t("expenses.slotFullyAllocated")}
          </span>
        )}
      </span>
    );
  }

  const bigGold =
    "font-heading text-4xl leading-none font-bold text-[oklch(0.9_0.14_88)] drop-shadow-[0_0_12px_oklch(0.85_0.17_85/0.8)]";

  /** A row per person on a banner: avatar, name, and an amount rolling up. */
  function chargeRows(charges: { uid: string; amountMinor: number }[], delay = 0.7) {
    return (
      <span className="flex w-full flex-col gap-1">
        {charges.map((charge, index) => (
          <span
            key={`${charge.uid}-${index}`}
            className="flex items-center justify-between gap-2 rounded-full bg-black/30 px-3 py-1 text-sm"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <GameAvatar name={name(charge.uid)} className="size-5 text-[10px]" />
              <span className="truncate">{name(charge.uid)}</span>
            </span>
            <RollupMoney
              amountMinor={Math.abs(charge.amountMinor)}
              currency={currency}
              duration={ROLLUP_S * speed}
              delay={delay + index * 0.15}
              prefix={charge.amountMinor < 0 ? "−" : "+"}
              className="font-bold text-[oklch(0.9_0.14_88)]"
            />
          </span>
        ))}
      </span>
    );
  }

  function bannerBody(result: SlotSpinResult, finale: boolean): ReactNode {
    const charged = result.charges.filter((charge) => charge.amountMinor > 0);
    const refund = result.charges.find((charge) => charge.amountMinor < 0);
    const pendingNow = result.state.pending;
    return (
      <>
        {result.wild && <WildBadge />}
        <span className="text-sm font-semibold text-white/85">{t(OUTCOME_TITLE[result.kind])}</span>
        {pendingNow && (
          <span className="text-sm text-white/85">
            {pendingNow.type === "gift"
              ? t("expenses.slotGiftPending")
              : pendingNow.type === "duel"
                ? t("expenses.slotDuelPending", { amount: money(pendingNow.amountMinor) })
                : t("expenses.slotCloverPick", { amount: money(pendingNow.amountMinor) })}
          </span>
        )}
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
              duration={ROLLUP_S * speed}
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
        {(result.kind === "stars" || result.kind === "receipt") && chargeRows(charged)}
        {result.kind === "clover" && !pendingNow && charged[0] && chargeRows(charged)}
        {result.kind === "ghost" && result.swap && (
          <span className="flex w-full items-center justify-center gap-2 text-sm">
            {[
              {
                uid: result.spinner,
                before: result.swap.spinnerBefore,
                after: result.swap.otherBefore,
              },
              null,
              {
                uid: result.swap.uid,
                before: result.swap.otherBefore,
                after: result.swap.spinnerBefore,
              },
            ].map((side, index) =>
              side === null ? (
                <motion.span
                  key="swap"
                  aria-hidden="true"
                  className="text-2xl text-white/80"
                  animate={reduceMotion ? undefined : { rotate: [0, 180, 360] }}
                  transition={{ delay: 0.6, duration: 0.8, ease: "easeInOut" }}
                >
                  ⇄
                </motion.span>
              ) : (
                <span key={side.uid} className="flex w-28 flex-col items-center gap-1">
                  <GameAvatar
                    name={name(side.uid)}
                    className="size-9 text-sm ring-2 ring-white/70"
                  />
                  <span className="max-w-full truncate text-xs">{name(side.uid)}</span>
                  <span className="text-xs text-white/55 line-through">{money(side.before)}</span>
                  <motion.span
                    className="font-bold text-[oklch(0.9_0.14_88)]"
                    initial={reduceMotion ? false : { rotateX: 90, opacity: 0 }}
                    animate={{ rotateX: 0, opacity: 1 }}
                    transition={{ delay: 1 + index * 0.1, duration: 0.4 }}
                  >
                    {money(side.after)}
                  </motion.span>
                </span>
              ),
            )}
          </span>
        )}
        {result.kind === "jackpot" && (
          <>
            {refund ? (
              <>
                <RollupMoney
                  amountMinor={-refund.amountMinor}
                  currency={currency}
                  duration={ROLLUP_S * speed}
                  delay={0.9}
                  prefix="−"
                  className={bigGold}
                />
                <span className="text-xs text-white/80">
                  {t("expenses.slotJackpotRefund", { amount: money(-refund.amountMinor) })}
                </span>
              </>
            ) : (
              <span className="text-sm text-white/85">{t("expenses.slotJackpotOut")}</span>
            )}
            {result.jackpotPayout && (
              <>
                <span className="text-xs text-white/80">
                  {t("expenses.slotJackpotPotPaid", {
                    amount: money(result.jackpotPayout.totalMinor),
                  })}
                </span>
                {chargeRows(result.jackpotPayout.charges, 1.4)}
              </>
            )}
            {result.lastPayer && charged[0] && (
              <span className="text-xs font-medium text-white/90">
                {t("expenses.slotLastPays", {
                  name: name(result.lastPayer),
                  amount: money(charged[charged.length - 1].amountMinor),
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

  function potBody(result: SlotSpinResult, finale: boolean): ReactNode {
    const pot = result.potPayout;
    if (!pot) return null;
    return (
      <>
        <RollupMoney
          amountMinor={pot.totalMinor}
          currency={currency}
          duration={ROLLUP_S * speed}
          delay={0.5}
          className={bigGold}
        />
        <span className="text-xs text-white/80">{t("expenses.slotPotPaid")}</span>
        {chargeRows(pot.charges, 0.9)}
        {finale && (
          <span className="text-xs font-medium text-white/75">
            {t("expenses.slotFullyAllocated")}
          </span>
        )}
      </>
    );
  }

  const toolbarButton =
    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-(--duration-fast) active:scale-95 disabled:opacity-50";

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
                      amount: money(setupStake),
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
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="font-heading truncate text-lg leading-tight font-semibold">
                          {name(spinner)}
                        </span>
                        <PlayerBadges game={game} uid={spinner} />
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
                with a progressive-jackpot marquee and marquee bulbs, an LED
                panel like a real machine's BET / WIN meters, and the reels in
                pressed-in wells. During free spins it turns gold and fizzes,
                and coins land above and below the payline.
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
                <JackpotMarquee
                  label={t("expenses.slotJackpotLabel")}
                  value={money(game.jackpotPotMinor)}
                />
                <BulbRow count={10} mode={bulbMode} />
                <LedPanel
                  cells={
                    inFreeSpins || (game.coinPotMinor > 0 && !done)
                      ? [
                          {
                            label: t("expenses.slotLedFreeSpins"),
                            value: String(game.freeSpinsLeft),
                            blink: true,
                          },
                          {
                            label: t("expenses.slotLedPot"),
                            value: money(game.coinPotMinor),
                            blink: coinsFlying,
                          },
                          {
                            label: t("expenses.slotLedMulti"),
                            value: `×${game.freeSpinMultiplier}`,
                            blink: game.freeSpinMultiplier > 1,
                          },
                        ]
                      : [
                          {
                            label: t("expenses.slotLedStake"),
                            value: money(game.stakeMinor),
                          },
                          {
                            label: t("expenses.slotLedSpin"),
                            value: done ? "–" : `${spinNumber}/${SLOT_SPINS_PER_TURN}`,
                          },
                          {
                            label: t("expenses.slotLedLast"),
                            value: landed ? t(OUTCOME_SHORT[landed.kind]) : "–",
                            blink: landedGood,
                            tone: landed && !landedGood && landed.kind !== "miss" ? "loss" : "win",
                          },
                        ]
                  }
                />
                <span className="border-l-primary absolute top-[63%] left-1 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent" />
                <span className="border-r-primary absolute top-[63%] right-1 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent" />
                <div ref={reelsRef} className="relative flex gap-1.5">
                  {[0, 1, 2].map((reelIndex) => {
                    const spun = reels[reelIndex].length > 0;
                    const strip = spun ? reels[reelIndex] : IDLE_STRIPS[reelIndex];
                    const winnerIndex = strip.length - 3;
                    const targetY = -(winnerIndex - 1) * ROW_HEIGHT;
                    const teased = reelIndex === 2 && strip.length > STRIP_LENGTH;
                    const inCombo = winReels.includes(reelIndex);
                    const held = heldReels.includes(reelIndex);
                    const mystery = !mysteryRevealed && mysteryReels.includes(reelIndex);
                    const coin =
                      landed && reelStopped[reelIndex]
                        ? landed.coins.find((c) => c.reel === reelIndex)
                        : undefined;
                    const glowing =
                      teasing &&
                      ((heldReels.length === 0 && reelIndex === 2) ||
                        (heldReels.length > 0 && !held));
                    return (
                      <div
                        key={reelIndex}
                        className={cn(
                          "bg-muted shadow-pressed relative overflow-hidden rounded-lg transition-shadow duration-(--duration-base)",
                          glowing && "ring-primary shadow-[0_0_18px_var(--primary)] ring-2",
                          held && "ring-2 ring-[oklch(0.7_0.15_230)]",
                          inFreeSpins && "bg-[oklch(0.84_0.16_85/0.14)]",
                        )}
                        style={{ width: ROW_HEIGHT, height: ROW_HEIGHT * VISIBLE_ROWS }}
                      >
                        <motion.div
                          key={`${reelKeys[reelIndex]}-${reelIndex}`}
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
                                  duration: reelDuration(reelIndex, teased),
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
                              mystery={mystery && rowIndex === winnerIndex}
                              flipIn={mysteryReels.includes(reelIndex) && rowIndex === winnerIndex}
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
                        {held && (
                          <span className="absolute inset-x-0 bottom-1 z-20 text-center text-[9px] font-black tracking-wider text-[oklch(0.55_0.15_230)] uppercase">
                            {t("expenses.slotHeld")}
                          </span>
                        )}
                        {coin && landed && (
                          <span
                            key={`coin-${reelKeys[reelIndex]}`}
                            className="absolute inset-x-0 z-20 flex items-center justify-center"
                            style={{ top: coin.row * ROW_HEIGHT, height: ROW_HEIGHT }}
                          >
                            <CoinChip
                              multiplier={coin.multiplier * landed.coinMultiplier}
                              collect={coinsFlying}
                            />
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {landed && winReels.length > 0 && (
                    <WinLine
                      key={reelKeys.join("-")}
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

            {!done && (
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-pressed={turbo}
                  onClick={toggleTurbo}
                  className={cn(
                    toolbarButton,
                    turbo
                      ? "border-[oklch(0.84_0.16_85)] bg-[oklch(0.84_0.16_85/0.2)]"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {t("expenses.slotTurbo")}
                </button>
                <button
                  type="button"
                  aria-pressed={auto !== null}
                  disabled={!spinner}
                  onClick={() => setAuto(auto || !spinner ? null : { uid: spinner })}
                  className={cn(
                    toolbarButton,
                    auto
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {auto ? t("expenses.slotAutoStop") : t("expenses.slotAuto")}
                </button>
                <button
                  type="button"
                  aria-pressed={!soundOff}
                  aria-label={t("expenses.slotSoundToggle")}
                  onClick={toggleSound}
                  className={cn(toolbarButton, "border-border hover:bg-muted")}
                >
                  {soundOff ? "🔇" : "🔊"}
                </button>
              </div>
            )}

            {done && <SlotAwards game={game} stats={stats} members={members} currency={currency} />}

            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
              </span>
              <TallyList game={game} members={members} currency={currency} />
            </div>

            <Paytable />

            {/* Clover or duel: the person who pulled it points at someone. */}
            <AnimatePresence>
              {choosing && (
                <motion.div
                  key="choice"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    "absolute -inset-x-4 -inset-y-2 z-30 flex flex-col items-center justify-center gap-4 px-6 text-white",
                    choosing.type === "duel"
                      ? "bg-[radial-gradient(circle_at_50%_40%,oklch(0.32_0.07_250/0.96),oklch(0.12_0.03_260/0.96)_70%)]"
                      : "bg-[radial-gradient(circle_at_50%_40%,oklch(0.36_0.1_150/0.95),oklch(0.14_0.03_260/0.95)_70%)]",
                  )}
                >
                  <span aria-hidden="true" className="text-5xl">
                    {choosing.type === "duel" ? "⚔️" : "🍀"}
                  </span>
                  <span className="font-heading text-center text-2xl font-semibold">
                    {t(
                      choosing.type === "duel"
                        ? "expenses.slotDuelPick"
                        : "expenses.slotChoiceTitle",
                      { name: name(choosing.uid), amount: money(choosing.amountMinor) },
                    )}
                  </span>
                  <div className="grid w-full max-w-80 grid-cols-2 gap-2">
                    {slotChoiceCandidates(game, choosing.uid).map((uid, index) => (
                      <motion.button
                        key={uid}
                        type="button"
                        data-choice=""
                        onClick={() => choose(uid)}
                        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.06 }}
                        className="flex flex-col items-center gap-1.5 rounded-xl bg-white/10 p-3 ring-1 ring-white/25 transition-colors hover:bg-white/20 active:scale-95"
                      >
                        <GameAvatar name={name(uid)} className="size-12 text-lg" />
                        <span className="max-w-full truncate text-sm font-semibold">
                          {name(uid)}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Gift: pick one of three boxes. */}
            <AnimatePresence>
              {(gifting || giftShow) && (
                <GiftPicker
                  key="gift"
                  title={t("expenses.slotGiftTitle", {
                    name: name(gifting?.uid ?? giftShow?.outcome.uid ?? ""),
                  })}
                  boxes={giftBoxes.map(prizeFace)}
                  picked={giftShow?.picked ?? null}
                  onPick={openGift}
                />
              )}
            </AnimatePresence>

            {/* The duel's reels. */}
            <AnimatePresence>
              {duelShow && (
                <DuelReveal
                  key={duelShow.id}
                  title={t("expenses.slotDuelTitle")}
                  sides={[
                    {
                      name: name(duelShow.duel.challenger),
                      symbol: duelShow.duel.challengerSymbol,
                      loser: duelShow.duel.loser === duelShow.duel.challenger,
                    },
                    {
                      name: name(duelShow.duel.opponent),
                      symbol: duelShow.duel.opponentSymbol,
                      loser: duelShow.duel.loser === duelShow.duel.opponent,
                    },
                  ]}
                  resultLabel={t("expenses.slotDuelResult", {
                    name: name(duelShow.duel.loser),
                    amount: money(duelShow.charge?.amountMinor ?? 0),
                  })}
                />
              )}
            </AnimatePresence>

            {/* The takeovers: a stamped slip for what costs, a casino banner for a win. */}
            <AnimatePresence>
              {takeover?.style === "slip" && takeover.kind === "bombs" && (
                <BombFlash key={`bomb-${takeover.id}`} />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {takeover?.style === "slip" && (
                <CatchFlash
                  key={takeover.id}
                  seed={takeover.id}
                  name={name(takeover.uid)}
                  stampLabel={t(OUTCOME_SHORT[takeover.kind])}
                  finale={takeover.finale || takeover.kind === "bombs"}
                  caption={slipCaption(takeover)}
                />
              )}
              {takeover?.style === "banner" && (
                <SlotWinBanner
                  key={takeover.id}
                  tier={BANNER_TIER[takeover.result.kind] ?? "win"}
                  tierLabel={t(BANNER_LABEL[takeover.result.kind] ?? "expenses.slotWinBig")}
                  tone={isGoodResult(takeover.result) ? "gold" : "red"}
                  name={name(takeover.result.spinner)}
                  faces={takeover.result.faces}
                  onDismiss={dismissTakeover}
                >
                  {bannerBody(takeover.result, takeover.finale)}
                </SlotWinBanner>
              )}
              {takeover?.style === "wheel" && takeover.result.wheel && (
                <BonusWheel
                  key={takeover.id}
                  title={t("expenses.slotWheelTitle")}
                  segments={SLOT_WHEEL_SEGMENTS.map(prizeFace)}
                  index={takeover.result.wheel.index}
                  resultLabel={prizeFace(takeover.result.wheel.outcome.prize).label}
                  onTick={playTickSound}
                />
              )}
              {takeover?.style === "pot" && (
                <SlotWinBanner
                  key={takeover.id}
                  tier="mega"
                  tierLabel={t("expenses.slotWinPot")}
                  name={name(takeover.result.spinner)}
                  faces={["cherry", "cherry", "cherry"]}
                  onDismiss={dismissTakeover}
                >
                  {potBody(takeover.result, takeover.finale)}
                </SlotWinBanner>
              )}
            </AnimatePresence>
            {takeover?.style === "banner" && OUTCOME_GLYPHS[takeover.result.kind] && (
              <EmojiShower
                key={`shower-${takeover.id}`}
                anchorRef={reelsRef}
                seed={takeover.id * 7919}
                glyphs={OUTCOME_GLYPHS[takeover.result.kind] ?? []}
                mode="fountain"
                count={34}
              />
            )}
            {takeover?.style === "slip" && OUTCOME_GLYPHS[takeover.kind] && (
              <EmojiShower
                key={`shower-${takeover.id}`}
                anchorRef={reelsRef}
                seed={takeover.id * 7919}
                glyphs={OUTCOME_GLYPHS[takeover.kind] ?? []}
                count={18}
              />
            )}
            {takeover?.style === "pot" && (
              <EmojiShower
                key={`pot-${takeover.id}`}
                anchorRef={reelsRef}
                seed={takeover.id * 7919}
                glyphs={["🪙", "🪙", "🪙", "💶"]}
                mode="fountain"
                count={40}
              />
            )}
            {takeover?.style === "banner" && takeover.result.kind === "jackpot" && (
              <EmojiShower
                key={`rain-${takeover.id}`}
                seed={takeover.id * 104729}
                glyphs={["🪙", "🪙", "🪙", "💶"]}
                mode="rain"
                count={56}
                delay={0.3}
              />
            )}

            {/* Risiko: the coin flip on a loss. */}
            <AnimatePresence>
              {gambleFlip && (
                <GambleFlip
                  key={gambleFlip.id}
                  won={gambleFlip.won}
                  title={t("expenses.slotRiskTitle")}
                  stakeLabel={t("expenses.slotRiskStake", {
                    name: name(gambleFlip.uid),
                    amount: money(gambleFlip.stakeMinor),
                  })}
                  resultLabel={
                    gambleFlip.won
                      ? t("expenses.slotRiskWon")
                      : t("expenses.slotRiskLost", {
                          amount: money(gambleFlip.stakeMinor + gambleFlip.deltaMinor),
                        })
                  }
                />
              )}
            </AnimatePresence>
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
            <>
              {(gambleOffer || holdOffer) && (
                <div className="flex flex-1 gap-2">
                  {holdOffer && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="flex-1 border-[oklch(0.7_0.15_230)] font-bold"
                      onClick={holdAndRespin}
                    >
                      {t("expenses.slotHold")}
                    </Button>
                  )}
                  {gambleOffer && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="flex-1 border-[oklch(0.84_0.16_85)] font-bold"
                      onClick={risk}
                    >
                      {gambleOffer.step === 0
                        ? t("expenses.slotRisk", { amount: money(gambleOffer.amountMinor) })
                        : t("expenses.slotRiskAgain", { amount: money(gambleOffer.amountMinor) })}
                    </Button>
                  )}
                </div>
              )}
              <Button
                type="button"
                size="lg"
                className={cn(
                  "flex-1 font-bold",
                  inFreeSpins &&
                    "bg-[linear-gradient(180deg,oklch(0.9_0.13_90),oklch(0.72_0.16_65))] text-[oklch(0.28_0.07_55)] shadow-[0_0_16px_oklch(0.84_0.16_85/0.6)] hover:brightness-105",
                )}
                disabled={busy || pending !== null}
                onClick={pull}
              >
                {pending
                  ? t(
                      pending.type === "gift"
                        ? "expenses.slotGiftWaiting"
                        : pending.type === "duel"
                          ? "expenses.slotDuelWaiting"
                          : "expenses.slotChoiceWaiting",
                    )
                  : inFreeSpins
                    ? `🍒 ${t("expenses.slotPullFree")}`
                    : `${t("expenses.slotPull")} · ${spinNumber}/${SLOT_SPINS_PER_TURN}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
