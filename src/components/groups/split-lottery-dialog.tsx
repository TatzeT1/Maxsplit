"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Minus, Plus } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import { avatarGradient, cn } from "@/lib/utils";
import { playAppliedSound, playLaughSound, playMissSound } from "@/lib/sound/game-sounds";
import type { GroupMember } from "@/lib/types";

/**
 * The cast: mostly generated character portraits plus a couple of real,
 * consented photos, each as a calm/laughing pair so tapping a face reads as
 * "the same person, a different mood". Each grid cell gets its own random
 * cast member at game start — a colourful mix across the board, not one
 * face repeated.
 */
interface LotteryCharacter {
  id: string;
  calmSrc: string;
  laughSrc: string;
}

const CHARACTERS: LotteryCharacter[] = [
  {
    id: "char1",
    calmSrc: "/lottery-faces/char1-calm.png",
    laughSrc: "/lottery-faces/char1-laugh.png",
  },
  {
    id: "char3",
    calmSrc: "/lottery-faces/char3-calm.png",
    laughSrc: "/lottery-faces/char3-laugh.png",
  },
  {
    id: "char4",
    calmSrc: "/lottery-faces/char4-calm.png",
    laughSrc: "/lottery-faces/char4-laugh.png",
  },
  {
    id: "char5",
    calmSrc: "/lottery-faces/char5-calm.png",
    laughSrc: "/lottery-faces/char5-laugh.png",
  },
  {
    id: "char6",
    calmSrc: "/lottery-faces/char6-calm.png",
    laughSrc: "/lottery-faces/char6-laugh.png",
  },
  {
    id: "char7",
    calmSrc: "/lottery-faces/char7-calm.png",
    laughSrc: "/lottery-faces/char7-laugh.png",
  },
  {
    id: "char8",
    calmSrc: "/lottery-faces/char8-calm.png",
    laughSrc: "/lottery-faces/char8-laugh.png",
  },
];

function randomCharacter(): LotteryCharacter {
  const bytes = randomBytes(1);
  return CHARACTERS[bytes[0] % CHARACTERS.length];
}

/**
 * Every laugh variant fetched once, up front, at the same resolution the
 * full-board flash renders it at. Without this, the first time any given
 * character is caught mid-session, the celebratory takeover is a cold
 * `/_next/image` fetch racing the "ha" sound — on the phone-outdoors-cellular
 * conditions this component is built for, that's a blank card under a laugh
 * track. `sr-only` keeps the boxes out of layout without skipping the fetch.
 */
function LotteryFacePreload() {
  return (
    <div aria-hidden="true" className="sr-only">
      {CHARACTERS.map((character) => (
        <span key={character.id} className="relative block size-[400px]">
          <Image src={character.laughSrc} alt="" fill sizes="400px" />
        </span>
      ))}
    </div>
  );
}

/** The app's deterministic name-colored initial chip, at whatever size the caller needs. */
function PlayerAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-linear-to-br font-semibold text-white",
        avatarGradient(name),
        className,
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

type Outcome = "pay" | "safe";

interface LotteryCell {
  outcome: Outcome;
  character: LotteryCharacter;
  revealed: boolean;
  tappedByUid: string | null;
}

const GRID_SIZE_OPTIONS = [16, 20, 24, 28, 32];

/**
 * Every board is four rows deep, so it always reads as one table of faces
 * rather than a list that happens to wrap. Each size divides evenly by four,
 * which is the only reason the mapping can be this tidy.
 */
const GRID_COLUMN_CLASS: Record<number, string> = {
  16: "grid-cols-4",
  20: "grid-cols-5",
  24: "grid-cols-6",
  28: "grid-cols-7",
  32: "grid-cols-8",
};

function randomBytes(length: number): Uint32Array {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Like the source party game: the grid is always 16-32 anonymous faces, independent of how many people are actually playing. */
function randomGridSize(): number {
  const bytes = randomBytes(1);
  return GRID_SIZE_OPTIONS[bytes[0] % GRID_SIZE_OPTIONS.length];
}

/** Fisher-Yates shuffle of `payCount` "pay" outcomes among `total` cells, using crypto randomness so the draw can't be predicted or replayed. */
function shuffledOutcomes(total: number, payCount: number): Outcome[] {
  const outcomes: Outcome[] = Array.from({ length: total }, (_, index) =>
    index < payCount ? "pay" : "safe",
  );
  const bytes = randomBytes(outcomes.length);
  for (let i = outcomes.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
  }
  return outcomes;
}

/**
 * Cards deal onto the board as a wavefront from the top-left corner rather
 * than a typewriter scanning row by row — every board is exactly four rows
 * deep, so `row + col` gives each diagonal one shared arrival time.
 */
function dealStagger(index: number, columns: number): number {
  const row = Math.floor(index / columns);
  const col = index % columns;
  return (row + col) * 0.9;
}

/**
 * One face, visible from the start — nothing is hidden under a card back.
 * The mystery is only which face is secretly wired to "pay"; tapping either
 * settles it permanently into a laugh (bigger, tinted, a tapper badge) or a
 * miss (shrinks away to an empty dashed slot). Both the calm and laugh
 * variants are mounted from the start and cross-faded on tap rather than
 * swapped, so the reveal never races a cold image fetch.
 * `prefers-reduced-motion` collapses the CSS transitions/animations here
 * globally (see globals.css); this component has no JS-driven motion of
 * its own to gate separately.
 */
function LotteryCard({
  cell,
  stagger,
  boardLocked,
  label,
  tapperName,
  onTap,
}: {
  cell: LotteryCell;
  stagger: number;
  boardLocked: boolean;
  label: string;
  tapperName: string | null;
  onTap: () => void;
}) {
  const isPay = cell.outcome === "pay";
  const laughing = cell.revealed && isPay;
  const vanished = cell.revealed && !isPay;
  const idle = !cell.revealed;

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={cell.revealed || boardLocked}
      aria-label={label}
      style={
        {
          "--stagger": stagger,
          // Locking spreads outward across the board on the same clock the
          // deal came in on, rather than every untapped card dimming at once.
          transitionDelay: idle && boardLocked ? `${stagger * 6}ms` : undefined,
        } as CSSProperties
      }
      className={cn(
        "focus-visible:ring-ring/50 ease-spring relative aspect-square touch-manipulation rounded-lg transition-[transform,opacity,filter] duration-(--duration-fast) outline-none focus-visible:ring-3",
        idle &&
          (boardLocked
            ? "opacity-40 grayscale"
            : "active:shadow-pressed hover:-translate-y-0.5 active:scale-[0.96]"),
        laughing && "z-10",
      )}
    >
      <span
        className="animate-rise absolute inset-0"
        style={{ "--stagger": stagger } as CSSProperties}
      >
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg border transition-[background-color,border-color,box-shadow] duration-(--duration-base)",
            laughing
              ? "ease-spring border-destructive/45 bg-destructive/10 shadow-e1"
              : vanished
                ? "ease-exit border-border/40 border-dashed delay-(--duration-micro)"
                : "border-border/70 bg-card shadow-e1",
          )}
        >
          <span
            className={cn(
              "relative size-[78%]",
              laughing && "animate-laugh-land",
              vanished &&
                "ease-exit -translate-y-0.5 scale-[0.55] opacity-0 transition-[transform,opacity] duration-(--duration-fast)",
            )}
          >
            <Image
              src={cell.character.calmSrc}
              alt=""
              fill
              sizes="120px"
              className={cn(
                "object-contain transition-opacity duration-(--duration-fast)",
                laughing ? "opacity-0" : "opacity-100",
              )}
            />
            <Image
              src={cell.character.laughSrc}
              alt=""
              fill
              sizes="120px"
              className={cn(
                "object-contain transition-opacity duration-(--duration-fast)",
                laughing ? "opacity-100" : "opacity-0",
              )}
            />
          </span>
          {laughing && (
            <span
              aria-hidden="true"
              className="animate-settle-ring border-destructive/40 pointer-events-none absolute inset-0 rounded-lg border"
            />
          )}
          {laughing && tapperName && (
            <span
              style={{ "--stagger": 4 } as CSSProperties}
              className={cn(
                "ring-popover animate-rise absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-linear-to-br text-[9px] leading-none font-semibold text-white ring-2",
                avatarGradient(tapperName),
              )}
            >
              {tapperName.charAt(0).toUpperCase() || "?"}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

type Step = "setup" | "playing";

interface FlashState {
  id: number;
  character: LotteryCharacter;
}

/** How long the full-board takeover holds before the caught face drops back into its slot. */
const FLASH_HOLD_MS = 620; // --duration-deliberate

/**
 * "Pass the phone" lottery for deciding who ends up owing an expense —
 * modeled on the tap-to-reveal party game it's inspired by: a grid of 16-32
 * anonymous faces (always that many, regardless of how many people are
 * actually playing), everyone in the pool taps one face per turn in
 * round-robin order, until a fixed number of "laughing" faces have been
 * found. Whoever tapped one owes the bill.
 *
 * Resolves to a list of "loser" uids the caller wires into an exact split —
 * they split the full amount between themselves, everyone else owes
 * nothing. It never touches `paidBy`: who actually fronted the money stays
 * a separate, manual choice, since the game only decides who owes it back.
 */
export function SplitLotteryDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  onResolve: (loserUids: string[]) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const [direction, setDirection] = useState<1 | -1>(1);
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [loserCountInput, setLoserCountInput] = useState("1");
  const [targetLoserCount, setTargetLoserCount] = useState(1);
  const [cells, setCells] = useState<LotteryCell[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashIdRef = useRef(0);
  // Mutable, synchronous shadows of `cells`/`turnIndex` state: two taps that
  // land in the same React batch (two fingers on two different cells) would
  // otherwise both read the same pre-update snapshot and get attributed to
  // the same player. Refs update immediately, before either tap's state
  // change commits, so the second tap always sees the first one's result.
  const tappedIndicesRef = useRef<Set<number>>(new Set());
  const turnCounterRef = useRef(0);
  // Direction the count last moved, for the stepper digit's slide — read
  // during render (to pick the enter/exit offset), so state rather than a
  // ref.
  const [stepperDirection, setStepperDirection] = useState<1 | -1>(1);

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

  function startGame() {
    const requested = Number.parseInt(loserCountInput, 10) || 1;
    const target = Math.min(Math.max(requested, 1), poolUids.length);
    const size = randomGridSize();
    const outcomes = shuffledOutcomes(size, target);
    // Each cell gets its own random cast member — a colourful mix, not one
    // face repeated — so every face on the board is visible from the start;
    // nothing is hidden under a card back.
    setCells(
      outcomes.map((outcome) => ({
        outcome,
        character: randomCharacter(),
        revealed: false,
        tappedByUid: null,
      })),
    );
    setTargetLoserCount(target);
    setTurnIndex(0);
    turnCounterRef.current = 0;
    tappedIndicesRef.current = new Set();
    setDirection(1);
    setStep("playing");
  }

  function goToSetup() {
    setDirection(-1);
    setStep("setup");
  }

  /*
   * The count is a stepper rather than a text field: the range is 1..pool
   * size, every value in it is one tap away, and nothing about setting up a
   * party game should summon a keyboard over the phone being passed around.
   * `loserCountInput` stays the source of truth in the same string form
   * `startGame` has always parsed and clamped.
   */
  const maxLoserCount = Math.max(poolUids.length, 1);
  const loserCount = Math.min(
    Math.max(Number.parseInt(loserCountInput, 10) || 1, 1),
    maxLoserCount,
  );

  function stepLoserCount(delta: number) {
    setStepperDirection(delta > 0 ? 1 : -1);
    setLoserCountInput(String(Math.min(Math.max(loserCount + delta, 1), maxLoserCount)));
  }

  const revealedPayCells = cells.filter((cell) => cell.revealed && cell.outcome === "pay");
  // Dedup by tapper for the result/split (one person can catch more than one
  // "pay" face). Ending the game on *cells* found, not distinct people, is
  // what guarantees termination: the grid only ever has exactly
  // `targetLoserCount` pay cells in it, so tapping keeps finding them even if
  // they all land on the same unlucky player's turns — gating on distinct
  // people instead could make the target unreachable.
  const loserUids = [...new Set(revealedPayCells.map((cell) => cell.tappedByUid as string))];
  const gameOver = revealedPayCells.length >= targetLoserCount;
  // The result banner waits for the flash to clear: both fire from the same
  // tap, and without this the whole celebration — the bloom, the settle
  // ring, the result rising in — plays out hidden behind the opaque
  // takeover and is never actually seen.
  const showVerdict = gameOver && flash === null;
  const currentTurnUid = poolUids[turnIndex % poolUids.length];
  const boardCols = cells.length > 0 ? cells.length / 4 : 1;

  function tapCell(index: number) {
    if (gameOver) return;
    if (tappedIndicesRef.current.has(index)) return;
    const cell = cells[index];
    if (cell.revealed) return;
    tappedIndicesRef.current.add(index);

    const myTurn = turnCounterRef.current;
    turnCounterRef.current += 1;
    const tapperUid = poolUids[myTurn % poolUids.length];

    setCells((current) =>
      current.map((c, i) => (i === index ? { ...c, revealed: true, tappedByUid: tapperUid } : c)),
    );
    setTurnIndex(turnCounterRef.current);

    if (cell.outcome === "pay") {
      playLaughSound();
      // Re-triggers even if a previous flash's timeout hasn't fired yet, so
      // back-to-back catches each get their own full-length takeover — the
      // monotonic id is what makes AnimatePresence treat it as a new element
      // rather than a prop update on the one still on screen.
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      flashIdRef.current += 1;
      setFlash({ id: flashIdRef.current, character: cell.character });
      flashTimeoutRef.current = setTimeout(() => setFlash(null), FLASH_HOLD_MS);
    } else {
      playMissSound();
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setCells([]);
      setTurnIndex(0);
      turnCounterRef.current = 0;
      tappedIndicesRef.current = new Set();
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlash(null);
    }
    onOpenChange(nextOpen);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(loserUids);
    handleOpenChange(false);
  }

  const loserNames = loserUids.map((uid) => members[uid].displayName);
  const resultText =
    loserNames.length === 1
      ? t("expenses.gameResultOne", { name: loserNames[0] })
      : t("expenses.gameResultMultiple", { names: loserNames.join(", ") });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <AnimatePresence>
          {flash && (
            <motion.div
              key={flash.id}
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: reduceMotion ? { duration: 0 } : { duration: 0.12 },
              }}
              exit={{
                opacity: 0,
                transition: reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.4, 0, 1, 1] },
              }}
              // Eats taps for its whole hold: without this, a second finger on
              // the board mid-flash can register on a hidden cell.
              className="bg-popover/95 pointer-events-auto absolute inset-0 z-50 flex items-center justify-center rounded-xl"
            >
              <motion.span
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={reduceMotion ? { duration: 0 } : springs.weighted}
                className="relative size-[85%]"
              >
                <span className="animate-laugh-land absolute inset-0">
                  <Image
                    src={flash.character.laughSrc}
                    alt=""
                    fill
                    sizes="400px"
                    className="object-contain drop-shadow-2xl"
                  />
                </span>
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎲</span>
            {t("expenses.lotteryTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.lotteryIntro")}</DialogDescription>}
        </DialogHeader>

        <LotteryFacePreload />

        <motion.div
          layout={!reduceMotion}
          transition={reduceMotion ? { duration: 0 } : springs.weighted}
        >
          <AnimatePresence mode="wait" initial={false}>
            {step === "setup" ? (
              <motion.div
                key="setup"
                initial={reduceMotion ? false : { opacity: 0, y: 12 * direction }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: -12 * direction,
                        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                      }
                }
                transition={reduceMotion ? { duration: 0 } : springs.weighted}
                className="flex flex-col gap-4"
              >
                <div className="flex flex-col gap-2">
                  <Label id="lottery-pool-label">{t("expenses.gamePoolLabel")}</Label>
                  <div
                    role="group"
                    aria-labelledby="lottery-pool-label"
                    className="flex flex-col gap-1.5"
                  >
                    {memberUids.map((uid, index) => {
                      const name = members[uid].displayName;
                      const selected = poolUids.includes(uid);
                      return (
                        <label
                          key={uid}
                          style={{ "--stagger": index } as CSSProperties}
                          className={cn(
                            "has-focus-visible:ring-ring/50 ease-spring animate-rise active:shadow-pressed flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none active:scale-[0.99] has-focus-visible:ring-3",
                            selected
                              ? "border-primary/40 bg-primary/5 shadow-e1"
                              : "border-border bg-background",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePoolMember(uid)}
                            className="sr-only"
                          />
                          <PlayerAvatar
                            name={name}
                            className={cn(
                              "size-9 text-sm transition-all duration-(--duration-fast)",
                              !selected && "opacity-40 grayscale",
                            )}
                          />
                          <span
                            className={cn(
                              "flex-1 truncate text-sm font-medium",
                              !selected && "text-muted-foreground",
                            )}
                          >
                            {name}
                          </span>
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--duration-fast)",
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border",
                            )}
                          >
                            {selected && (
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="size-3.5"
                                aria-hidden="true"
                              >
                                <path
                                  d="M20 6 9 17l-5-5"
                                  pathLength={1}
                                  className="animate-draw-stroke [--stroke-length:1]"
                                />
                              </svg>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {poolUids.length < 2 && (
                    <p className="text-muted-foreground text-xs">{t("expenses.gamePoolMinHint")}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label id="lottery-count-label">{t("expenses.gameCountLabel")}</Label>
                  <div
                    role="group"
                    aria-labelledby="lottery-count-label"
                    className="bg-muted/40 flex items-center gap-3 rounded-xl border p-2"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      aria-label={t("expenses.gameCountDecrease")}
                      disabled={loserCount <= 1}
                      onClick={() => stepLoserCount(-1)}
                    >
                      <Minus />
                    </Button>
                    <div className="relative flex flex-1 items-center justify-center gap-2">
                      {/* Live, so stepping the count is audible as well as visible. */}
                      <span aria-live="polite" className="sr-only">
                        {loserCount}
                      </span>
                      <span className="relative h-8 overflow-hidden">
                        <AnimatePresence mode="popLayout" initial={false}>
                          <motion.span
                            key={loserCount}
                            aria-hidden="true"
                            initial={
                              reduceMotion ? false : { opacity: 0, y: stepperDirection * 14 }
                            }
                            animate={{ opacity: 1, y: 0 }}
                            exit={
                              reduceMotion
                                ? { opacity: 0 }
                                : {
                                    opacity: 0,
                                    y: -stepperDirection * 14,
                                    transition: { duration: 0.12 },
                                  }
                            }
                            transition={reduceMotion ? { duration: 0 } : springs.snappy}
                            className="font-heading tabular-money block text-2xl leading-none font-medium"
                          >
                            {loserCount}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                      <span className="relative size-7 shrink-0">
                        <Image
                          src={CHARACTERS[0].laughSrc}
                          alt=""
                          fill
                          sizes="28px"
                          className="object-contain"
                        />
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      aria-label={t("expenses.gameCountIncrease")}
                      disabled={loserCount >= maxLoserCount}
                      onClick={() => stepLoserCount(1)}
                    >
                      <Plus />
                    </Button>
                  </div>
                  <p className="text-muted-foreground text-xs">{t("expenses.lotteryCountHint")}</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="playing"
                initial={reduceMotion ? false : { opacity: 0, y: 12 * direction }}
                animate={{ opacity: 1, y: 0 }}
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        y: -12 * direction,
                        transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                      }
                }
                transition={reduceMotion ? { duration: 0 } : springs.weighted}
                className="flex flex-col gap-3"
              >
                {/*
                  The banner and the tray are decorative rearrangements of what this
                  line says, so the live region carries the whole state change — one
                  announcement per turn instead of four fragments.
                */}
                <p aria-live="polite" className="sr-only">
                  {showVerdict
                    ? resultText
                    : t("expenses.lotteryTurnLabel", {
                        name: members[currentTurnUid].displayName,
                      })}
                </p>

                {showVerdict ? (
                  <div className="border-primary/30 bg-primary/5 animate-rise relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-4 text-center">
                    <span
                      aria-hidden="true"
                      className="bg-primary/25 animate-bloom pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
                    />
                    <span className="text-muted-foreground relative text-[11px] font-semibold tracking-[0.12em] uppercase">
                      {t("expenses.gameResultEyebrow")}
                    </span>
                    <div className="relative flex -space-x-2">
                      {loserNames.map((name, index) => (
                        <PlayerAvatar
                          key={loserUids[index]}
                          name={name}
                          className="ring-popover size-10 text-sm ring-2"
                        />
                      ))}
                    </div>
                    <DialogDescription className="font-heading text-foreground relative text-lg font-medium">
                      {resultText}
                    </DialogDescription>
                  </div>
                ) : (
                  <div className="bg-muted/40 relative flex items-center gap-3 overflow-hidden rounded-xl border p-3">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={turnIndex}
                        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          reduceMotion
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                y: -8,
                                transition: { duration: 0.12, ease: [0.4, 0, 1, 1] },
                              }
                        }
                        transition={reduceMotion ? { duration: 0 } : springs.weighted}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <span className="relative flex shrink-0">
                          <span
                            aria-hidden="true"
                            className="bg-primary/25 animate-breathe absolute inset-0 rounded-full blur-sm"
                          />
                          <span
                            aria-hidden="true"
                            className="animate-settle-ring border-primary/40 absolute inset-0 rounded-full border"
                          />
                          <PlayerAvatar
                            name={members[currentTurnUid].displayName}
                            className="ring-popover relative size-10 text-sm ring-2"
                          />
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span
                            aria-hidden="true"
                            className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase"
                          >
                            {t("expenses.lotteryTurnEyebrow")}
                          </span>
                          <span
                            aria-hidden="true"
                            className="font-heading truncate text-lg leading-tight font-medium"
                          >
                            {members[currentTurnUid].displayName}
                          </span>
                          <DialogDescription className="text-xs">
                            {t("expenses.lotteryTapAnyHint")}
                          </DialogDescription>
                        </div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                )}

                {/* How many laughing faces are still out there, as slots rather than a sentence. */}
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  <span className="sr-only">
                    {t("expenses.lotteryProgress", {
                      found: revealedPayCells.length,
                      target: targetLoserCount,
                    })}
                  </span>
                  {Array.from({ length: targetLoserCount }, (_, index) => {
                    const found = index < revealedPayCells.length;
                    return (
                      <span
                        key={index}
                        aria-hidden="true"
                        className={cn(
                          "relative flex size-7 items-center justify-center rounded-lg border transition-colors duration-(--duration-base)",
                          found
                            ? "border-destructive/40 bg-destructive/10"
                            : "border-border border-dashed",
                        )}
                      >
                        {found ? (
                          <>
                            <span className="animate-settle-ring border-destructive/40 pointer-events-none absolute inset-0 rounded-lg border" />
                            <span
                              className="animate-rise relative size-5"
                              style={{ "--stagger": 22 } as CSSProperties}
                            >
                              <Image
                                src={CHARACTERS[0].laughSrc}
                                alt=""
                                fill
                                sizes="20px"
                                className="object-contain"
                              />
                            </span>
                          </>
                        ) : (
                          <span className="bg-muted-foreground/25 size-1.5 rounded-full" />
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* The board gets a frame of its own so the cards read as laid out on a table. */}
                <div className="bg-muted/30 relative rounded-xl border p-2">
                  <span
                    aria-hidden="true"
                    className="bg-paper-texture pointer-events-none absolute inset-0 rounded-xl opacity-60"
                  />
                  <div
                    className={cn(
                      "relative grid",
                      GRID_COLUMN_CLASS[cells.length] ?? "grid-cols-6",
                      cells.length > 24 ? "gap-1" : "gap-1.5",
                    )}
                  >
                    {cells.map((cell, index) => (
                      <LotteryCard
                        key={index}
                        cell={cell}
                        stagger={dealStagger(index, boardCols)}
                        boardLocked={gameOver}
                        label={
                          cell.revealed
                            ? cell.outcome === "pay"
                              ? t("expenses.lotteryRevealPay")
                              : t("expenses.lotterySafe")
                            : t("expenses.lotteryCardUntapped")
                        }
                        tapperName={
                          cell.tappedByUid ? (members[cell.tappedByUid]?.displayName ?? null) : null
                        }
                        onTap={() => tapCell(index)}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <DialogFooter>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step === "setup" ? "setup" : gameOver ? "over" : "playing"}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.12 } }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
              className="flex w-full gap-2"
            >
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
              ) : gameOver ? (
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
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={goToSetup}
                >
                  {t("expenses.gamePlayAgain")}
                </Button>
              )}
            </motion.div>
          </AnimatePresence>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
