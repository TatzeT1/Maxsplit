"use client";

import { type ReactNode, type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";
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
} from "@/lib/sound/game-sounds";
import { useGameSoundsMuted } from "@/lib/sound/use-game-sounds-muted";
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
  Sunburst,
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
/** What the reels show before the first pull: a row of sevens on the payline, as bait. */
const IDLE_STRIPS: SlotSymbol[][] = [
  ["bell", "seven", "wheel"],
  ["gift", "seven", "star"],
  ["swords", "seven", "clover"],
];
/**
 * Roughly what the full-screen stage needs besides the reels, top to bottom:
 * title bar and safe areas, the info strip, the jackpot marquee and bulbs,
 * the scroll hint, and the control deck. Whatever is left of the screen's
 * height goes to the three reel rows.
 */
const STAGE_CHROME_PX = 470;
/** The widest the stage's column gets (`max-w-2xl`), and what it keeps for padding, frame and gaps. */
const STAGE_MAX_WIDTH = 672;
const REEL_SIDE_ROOM = 64;

/** The reels' size: as wide as a third of the screen allows, as tall as the screen's height allows. */
function measureReels(): { width: number; row: number } {
  if (typeof window === "undefined") return { width: ROW_HEIGHT, row: ROW_HEIGHT };
  const width = Math.max(
    ROW_HEIGHT,
    Math.floor((Math.min(window.innerWidth, STAGE_MAX_WIDTH) - REEL_SIDE_ROOM) / 3),
  );
  const byHeight = (window.innerHeight - STAGE_CHROME_PX) / VISIBLE_ROWS;
  const row = Math.round(Math.max(ROW_HEIGHT, Math.min(byHeight, width * 1.2)));
  return { width, row };
}

/** `measureReels`, kept current as the window turns or resizes. */
function useReelGeometry() {
  const [geometry, setGeometry] = useState(measureReels);
  useEffect(() => {
    const update = () => setGeometry(measureReels());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return geometry;
}

/** The stage's scroller (see `GameDialogContent`), the element that scrolls the machine and the tallies below it. */
function stageScroller(element: HTMLElement | null): HTMLElement | null {
  return element?.closest<HTMLElement>("[data-slot=stage-scroller]") ?? null;
}

/**
 * The height the screen has between the stage's sticky title bar and its
 * control deck, so the machine fills the whole first screen and the tallies
 * start just below it, a scroll away. Follows rotation, the deck growing a
 * Halten/Risiko row, and the iOS toolbar coming and going.
 */
function useFirstScreen(
  stageRef: RefObject<HTMLElement | null>,
  active: boolean,
): number | undefined {
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    const scroller = stageScroller(stageRef.current);
    if (!active || !scroller) return;
    const column = stageRef.current?.parentElement;
    const header = scroller.querySelector<HTMLElement>("[data-slot=dialog-header]");
    const footer = scroller.querySelector<HTMLElement>("[data-slot=dialog-footer]");
    const update = () => {
      const gap = column ? parseFloat(getComputedStyle(column).rowGap) || 0 : 0;
      setHeight(
        Math.floor(
          scroller.clientHeight -
            (header?.offsetHeight ?? 0) -
            (footer?.offsetHeight ?? 0) -
            gap * 2,
        ),
      );
    };
    const observer = new ResizeObserver(update);
    for (const element of [scroller, header, footer]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [stageRef, active]);
  return height;
}

/** The casino the reels play in: dark whatever the app's theme, like the win banners. */
const CASINO_FRAME =
  "dark bg-[radial-gradient(ellipse_at_50%_30%,oklch(0.3_0.09_300),oklch(0.16_0.05_280)_55%,oklch(0.1_0.02_270))]";
/** The reels' paper: bright like a real machine's, so the symbols pop. */
const REEL_PAPER = "oklch(0.97 0.015 85)";
const REEL_PAPER_GOLD = "oklch(0.95 0.06 88)";

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
  // Shared with every other game's 🔊 switch; the slot keeps its own on the deck.
  const [soundOff, setSoundOff] = useGameSoundsMuted();
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
  const infoRef = useRef<HTMLDivElement | null>(null);
  const { width: reelWidth, row: rowHeight } = useReelGeometry();
  /** How far a reel overshoots its landing spot before snapping back — a real reel doesn't stop dead. */
  const overshoot = rowHeight * 0.22;
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
  const overlayActive = Boolean(
    choosing || gifting || giftShow || duelShow || takeover || gambleFlip,
  );
  const firstScreen = useFirstScreen(stageRef, step === "playing" && game !== null);
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

  /**
   * Brings the machine back into view if someone scrolled down to the
   * tallies: every pull, hold and Risiko plays out up there.
   */
  function showMachine() {
    const scroller = stageScroller(stageRef.current);
    if (!scroller || scroller.scrollTop < 8) return;
    scroller.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  /** Scrolls the stage down to the tallies, just under the sticky title bar. */
  function showInfo() {
    const info = infoRef.current;
    const scroller = stageScroller(info);
    if (!info || !scroller) return;
    const header = scroller.querySelector<HTMLElement>("[data-slot=dialog-header]");
    const top =
      scroller.scrollTop +
      info.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      (header?.offsetHeight ?? 0);
    scroller.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function clearStage() {
    showMachine();
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

  /** The round switches either side of the spin button. */
  const deckToggle =
    "flex size-11 shrink-0 items-center justify-center rounded-full text-lg ring-1 transition-[background-color,transform] duration-(--duration-fast) active:scale-90 disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent
        frameClassName={step === "playing" && game ? CASINO_FRAME : undefined}
        // While the reels run, 🔊 sits on the deck with the other switches.
        soundToggle={!(step === "playing" && game)}
      >
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
          <>
            <div
              ref={stageRef}
              className="relative flex flex-col gap-2.5 text-white"
              style={{ minHeight: firstScreen }}
            >
              {/* Light rays behind the machine, edge to edge and kept to the first screen. */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-4 bottom-0 left-1/2 w-screen -translate-x-1/2 overflow-hidden"
              >
                <Sunburst
                  color={inFreeSpins ? "oklch(0.88 0.15 88 / 0.22)" : "oklch(0.8 0.12 300 / 0.14)"}
                  className="top-1/2 left-1/2 size-[180vmax] -translate-x-1/2 -translate-y-1/2"
                />
              </span>
              <p aria-live="polite" className="sr-only">
                {liveText}
              </p>

              {/* Top strip: who's at the machine, what's left of the bill. */}
              {done ? (
                <div className="animate-rise flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold ring-1 ring-white/15">
                  <span aria-hidden="true">✓</span>
                  {t("expenses.slotFullyAllocated")}
                </div>
              ) : (
                spinner && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <motion.span
                        key={spinner}
                        initial={reduceMotion ? false : { scale: 0.5, rotate: -14 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", stiffness: 380, damping: 12 }}
                        className={cn(
                          "block shrink-0 rounded-full",
                          inFreeSpins && "shadow-[0_0_14px_oklch(0.84_0.16_85/0.8)]",
                        )}
                      >
                        <GameAvatar
                          name={name(spinner)}
                          className="size-10 text-base ring-2 ring-white/70"
                        />
                      </motion.span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase">
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
                                  ? "border-[oklch(0.84_0.16_85)] bg-[oklch(0.84_0.16_85)]"
                                  : index === spinNumber - 1
                                    ? "border-[oklch(0.84_0.16_85)] bg-[oklch(0.84_0.16_85/0.35)]"
                                    : "border-white/30",
                              )}
                            />
                          ))}
                        </span>
                      )}
                      {upNext && (
                        <span className="max-w-32 truncate text-xs text-white/60">
                          {t("expenses.slotNextUp", { name: name(upNext) })}
                        </span>
                      )}
                    </span>
                  </div>
                )
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-end justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase">
                      {t("expenses.slotRemainingLabel")}
                    </span>
                    <AnimatedMoney
                      amountMinor={remaining}
                      currency={currency}
                      className="font-heading text-xl leading-none font-semibold"
                    />
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="text-[10px] font-semibold tracking-[0.14em] text-white/60 uppercase">
                      {t("expenses.slotAllocatedLabel")}
                    </span>
                    <AnimatedMoney
                      amountMinor={allocated}
                      currency={currency}
                      className="font-heading text-xl leading-none font-semibold"
                    />
                  </span>
                </div>
                <div className="relative h-1.5 overflow-hidden rounded-full bg-white/15">
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,oklch(0.78_0.18_50),oklch(0.86_0.16_85))]"
                    animate={{
                      width:
                        amountMinor > 0
                          ? `${Math.min((allocated / amountMinor) * 100, 100)}%`
                          : "0%",
                    }}
                    transition={reduceMotion ? { duration: 0 } : springs.weighted}
                  />
                </div>
              </div>

              {/*
              The machine, as wide as the screen and as tall as it allows: a
              dark cabinet in a gold neon frame with the progressive-jackpot
              marquee and bulbs, and bright reels like a real machine's.
              Light rays turn slowly behind it. During free spins it glows
              gold and fizzes, and coins land above and below the payline.
            */}
              <div className="relative -mx-2 my-auto flex justify-center">
                <motion.div
                  aria-hidden="true"
                  className={cn(
                    "relative flex w-full flex-col items-center gap-2 rounded-[28px] bg-[linear-gradient(180deg,oklch(0.32_0.07_300),oklch(0.17_0.04_280))] px-2.5 py-2.5 ring-2 transition-shadow duration-(--duration-slow)",
                    inFreeSpins
                      ? "shadow-[0_0_44px_oklch(0.84_0.16_85/0.6),inset_0_1px_0_oklch(1_0_0/0.2)] ring-[oklch(0.88_0.15_88)]"
                      : "shadow-[0_0_32px_oklch(0.84_0.16_85/0.28),inset_0_1px_0_oklch(1_0_0/0.15)] ring-[oklch(0.78_0.14_80)]",
                  )}
                >
                  {inFreeSpins && (
                    <AmbientBubbles count={18} className="absolute inset-0 rounded-[28px]" />
                  )}
                  <JackpotMarquee
                    label={t("expenses.slotJackpotLabel")}
                    value={money(game.jackpotPotMinor)}
                  />
                  <BulbRow count={12} mode={bulbMode} />
                  <div ref={reelsRef} className="relative flex justify-center gap-1.5 px-3">
                    {/* Payline markers, pointing in from both sides. */}
                    <span
                      className="absolute left-0 -translate-y-1/2 border-y-[8px] border-l-[10px] border-y-transparent border-l-[oklch(0.84_0.16_85)]"
                      style={{ top: rowHeight * 1.5 }}
                    />
                    <span
                      className="absolute right-0 -translate-y-1/2 border-y-[8px] border-r-[10px] border-y-transparent border-r-[oklch(0.84_0.16_85)]"
                      style={{ top: rowHeight * 1.5 }}
                    />
                    {[0, 1, 2].map((reelIndex) => {
                      const spun = reels[reelIndex].length > 0;
                      const strip = spun ? reels[reelIndex] : IDLE_STRIPS[reelIndex];
                      const winnerIndex = strip.length - 3;
                      const targetY = -(winnerIndex - 1) * rowHeight;
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
                      const paper = inFreeSpins ? REEL_PAPER_GOLD : REEL_PAPER;
                      return (
                        <div
                          key={reelIndex}
                          className={cn(
                            "relative overflow-hidden rounded-xl shadow-[inset_0_0_14px_oklch(0_0_0/0.35)] ring-1 ring-black/40 transition-shadow duration-(--duration-base)",
                            glowing &&
                              "shadow-[0_0_24px_oklch(0.84_0.16_85)] ring-4 ring-[oklch(0.84_0.16_85)]",
                            held && "ring-4 ring-[oklch(0.7_0.15_230)]",
                          )}
                          style={{
                            width: reelWidth,
                            height: rowHeight * VISIBLE_ROWS,
                            backgroundColor: paper,
                          }}
                        >
                          <motion.div
                            key={`${reelKeys[reelIndex]}-${reelIndex}`}
                            className={cn(
                              "flex flex-col transition-[filter] duration-150",
                              !reelStopped[reelIndex] && "blur-[2px]",
                            )}
                            initial={{ y: 0 }}
                            animate={{ y: spun ? [0, targetY - overshoot, targetY] : 0 }}
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
                                rowHeight={rowHeight}
                                mystery={mystery && rowIndex === winnerIndex}
                                flipIn={
                                  mysteryReels.includes(reelIndex) && rowIndex === winnerIndex
                                }
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
                          {/* The drum curving away: rows darken toward the reel's edges. */}
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/4 bg-linear-to-b from-black/35 to-transparent" />
                          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-black/35 to-transparent" />
                          {/* Payline: the middle row is the one that counts. */}
                          <span
                            className={cn(
                              "pointer-events-none absolute inset-x-0 border-y-2 transition-colors duration-(--duration-base)",
                              inCombo ? "border-transparent" : "border-[oklch(0.78_0.14_80/0.7)]",
                            )}
                            style={{
                              top: rowHeight,
                              height: rowHeight,
                              backgroundColor: inCombo
                                ? `color-mix(in oklch, ${lineColor} 22%, transparent)`
                                : undefined,
                            }}
                          />
                          {held && (
                            <span className="absolute inset-x-0 bottom-1.5 z-20 text-center text-[10px] font-black tracking-wider text-[oklch(0.5_0.15_230)] uppercase">
                              {t("expenses.slotHeld")}
                            </span>
                          )}
                          {coin && landed && (
                            <span
                              key={`coin-${reelKeys[reelIndex]}`}
                              className="absolute inset-x-0 z-20 flex items-center justify-center"
                              style={{ top: coin.row * rowHeight, height: rowHeight }}
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
                        rowTop={rowHeight}
                        rowHeight={rowHeight}
                        color={lineColor}
                      />
                    )}
                    <FloatingBubbles bubbles={bubbles} />
                  </div>
                  <BulbRow count={12} mode={bulbMode} />
                </motion.div>
              </div>

              {/* More below: the tallies, the paytable, the award show. */}
              <button
                type="button"
                onClick={showInfo}
                className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white/70 transition-colors hover:text-white"
              >
                {done ? t("expenses.slotMoreInfoDone") : t("expenses.slotMoreInfo")}
                <motion.span
                  aria-hidden="true"
                  className="block"
                  animate={reduceMotion ? undefined : { y: [0, 3, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                >
                  ↓
                </motion.span>
              </button>
            </div>

            {/*
            Everything that takes over the screen: decisions, reveals, win
            banners. A fixed layer over the whole stage, title bar and control
            deck included, so a win fills the phone the way the reels do; inset
            so the overlays' own negative inset lands on the screen's edges.
            Outside the stage so the impact shake never moves it. The ✕ stays
            on top.
          */}
            <div
              className={cn(
                "fixed inset-x-4 inset-y-2 z-[15] text-white",
                !overlayActive && "pointer-events-none",
              )}
            >
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

            <div ref={infoRef} className="flex flex-col gap-3 pt-4 text-white">
              {done && (
                <SlotAwards game={game} stats={stats} members={members} currency={currency} />
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold tracking-[0.12em] text-white/60 uppercase">
                  {done ? t("expenses.gameResultEyebrow") : t("expenses.slotTallyLabel")}
                </span>
                <TallyList game={game} members={members} currency={currency} />
              </div>
              <Paytable />
            </div>
          </>
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
            <div className="flex w-full flex-col gap-2">
              <LedPanel
                cells={
                  inFreeSpins || game.coinPotMinor > 0
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
                          value: `${spinNumber}/${SLOT_SPINS_PER_TURN}`,
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
              {(gambleOffer || holdOffer) && (
                <div className="flex gap-2">
                  {holdOffer && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1 border-[oklch(0.7_0.15_230)] font-bold"
                      onClick={holdAndRespin}
                    >
                      {t("expenses.slotHold")}
                    </Button>
                  )}
                  {gambleOffer && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1 border-[oklch(0.84_0.16_85)] font-bold"
                      onClick={risk}
                    >
                      {gambleOffer.step === 0
                        ? t("expenses.slotRisk", { amount: money(gambleOffer.amountMinor) })
                        : t("expenses.slotRiskAgain", { amount: money(gambleOffer.amountMinor) })}
                    </Button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={turbo}
                  aria-label={t("expenses.slotTurbo")}
                  onClick={toggleTurbo}
                  className={cn(
                    deckToggle,
                    turbo
                      ? "bg-[oklch(0.84_0.16_85)] text-[oklch(0.25_0.06_60)] ring-[oklch(0.84_0.16_85)]"
                      : "bg-white/10 text-white ring-white/20",
                  )}
                >
                  ⚡
                </button>
                <button
                  type="button"
                  aria-pressed={auto !== null}
                  aria-label={auto ? t("expenses.slotAutoStop") : t("expenses.slotAuto")}
                  disabled={!spinner}
                  onClick={() => setAuto(auto || !spinner ? null : { uid: spinner })}
                  className={cn(
                    deckToggle,
                    auto
                      ? "bg-[oklch(0.7_0.17_150)] text-white ring-[oklch(0.7_0.17_150)]"
                      : "bg-white/10 text-white ring-white/20",
                  )}
                >
                  {auto ? "⏹" : "🔁"}
                </button>
                <motion.button
                  type="button"
                  disabled={busy || pending !== null}
                  onClick={pull}
                  whileTap={reduceMotion ? undefined : { scale: 0.95 }}
                  className={cn(
                    "h-14 min-w-0 flex-1 truncate rounded-full px-4 text-base font-black tracking-wide uppercase transition-[filter,opacity] disabled:opacity-60",
                    inFreeSpins
                      ? "bg-[linear-gradient(180deg,oklch(0.92_0.13_90),oklch(0.72_0.16_65))] text-[oklch(0.28_0.07_55)] shadow-[0_0_22px_oklch(0.84_0.16_85/0.7)]"
                      : "bg-[linear-gradient(180deg,oklch(0.8_0.17_55),oklch(0.62_0.21_35))] text-white shadow-[0_6px_22px_oklch(0.65_0.2_40/0.55),inset_0_1px_0_oklch(1_0_0/0.35)]",
                  )}
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
                </motion.button>
                <button
                  type="button"
                  aria-pressed={!soundOff}
                  aria-label={t("expenses.gameSoundToggle")}
                  onClick={toggleSound}
                  className={cn(deckToggle, "bg-white/10 text-white ring-white/20")}
                >
                  {soundOff ? "🔇" : "🔊"}
                </button>
              </div>
            </div>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
