"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Heart } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useGameRound } from "@/components/groups/split-game/game-round";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { useT } from "@/components/locale-provider";
import { lotteryHeartbeat } from "@/lib/games/lottery-heartbeat";
import { maxPayerCount, stakeShares, type GameStake } from "@/lib/games/payers";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { springs } from "@/lib/motion";
import { avatarGradient, cn } from "@/lib/utils";
import { playAppliedSound, playHeartbeatSound, playMissSound } from "@/lib/sound/game-sounds";
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

/** The caught face peeking over the slip: `CatchFlash`'s `hero` slot is `size-24`. */
const HERO_SIZES = "96px";

/**
 * Every laugh variant fetched once, up front, at the same resolution the
 * catch slip's peeking face renders it at (`HERO_SIZES`, so the same
 * `/_next/image` URL). Without this, the first time any given character is
 * caught mid-session, the face behind the slip is a cold fetch racing the
 * stamp — on the phone-outdoors-cellular conditions this component is built
 * for, that's an empty corner under a laugh track. `sr-only` keeps the boxes
 * out of layout without skipping the fetch.
 */
function LotteryFacePreload() {
  return (
    <div aria-hidden="true" className="sr-only">
      {CHARACTERS.map((character) => (
        <span key={character.id} className="relative block size-24">
          <Image src={character.laughSrc} alt="" fill sizes={HERO_SIZES} />
        </span>
      ))}
    </div>
  );
}

/** Heartbeats per turn before the pulse goes quiet, so a phone put down mid-turn doesn't thump on forever. */
const HEARTBEAT_BEATS_PER_TURN = 8;

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
 *
 * A laughing face is the shared `CatchFlash`: a slip naming whoever tapped
 * it, the face itself peeking over the slip, stamp, shake and confetti. In
 * between, a heartbeat (`lottery-heartbeat.ts`) quickens as the safe faces
 * run out.
 */
export function SplitLotteryDialog({
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
  /** The bill being played for — shares go on the last slip and in the verdict. */
  stake?: GameStake | null;
  /** Who pays, and everyone who played (stored on the expense). */
  onResolve: (loserUids: string[], playerUids: string[]) => void;
}) {
  const t = useT();
  const { startRound } = useGameRound();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const [direction, setDirection] = useState<1 | -1>(1);
  // At most everyone but one laughing face: with as many as players, the
  // last turns would have nobody left to keep dry.
  const setup = useGamePoolSetup(memberUids, maxPayerCount, groupId);
  const poolUids = setup.poolUids;
  const [targetLoserCount, setTargetLoserCount] = useState(1);
  const [cells, setCells] = useState<LotteryCell[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  // The face behind the slip on screen: the last laughing face tapped.
  const [caughtCellIndex, setCaughtCellIndex] = useState<number | null>(null);
  const [stageRef, catches] = useCatchFlashes();
  // Mutable, synchronous shadows of `cells`/`turnIndex` state: two taps that
  // land in the same React batch (two fingers on two different cells) would
  // otherwise both read the same pre-update snapshot and get attributed to
  // the same player. Refs update immediately, before either tap's state
  // change commits, so the second tap always sees the first one's result.
  const tappedIndicesRef = useRef<Set<number>>(new Set());
  const turnCounterRef = useRef(0);

  function startGame() {
    startRound();
    const target = setup.loserCount;
    setup.remember();
    catches.cancel();
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
    setCaughtCellIndex(null);
    turnCounterRef.current = 0;
    tappedIndicesRef.current = new Set();
    setDirection(1);
    setStep("playing");
  }

  function goToSetup() {
    // "Neu mischen" works mid-slip too: the slip doesn't block the footer.
    catches.cancel();
    setDirection(-1);
    setStep("setup");
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
  // The result banner waits for the last slip to clear: both fire from the
  // same tap, and without this the whole celebration — the bloom, the settle
  // ring, the result rising in — plays out hidden behind the takeover and is
  // never actually seen.
  const showVerdict = gameOver && !catches.active;
  const flash = catches.flash;
  const currentTurnUid = poolUids[turnIndex % poolUids.length];
  const boardCols = cells.length > 0 ? cells.length / 4 : 1;
  // One person can catch two faces, so who pays — and so each share — is
  // only certain once the last laughing face is found.
  const shares = gameOver ? stakeShares(stake, loserUids) : null;
  const caughtCell = caughtCellIndex !== null ? cells[caughtCellIndex] : undefined;
  const caughtAgain =
    flash !== null && revealedPayCells.filter((cell) => cell.tappedByUid === flash.uid).length > 1;

  // Herzklopfen: public odds only (laughing faces left, faces left), never where they are.
  const payLeft = targetLoserCount - revealedPayCells.length;
  const facesLeft = cells.filter((cell) => !cell.revealed).length;
  const heartbeat = step === "playing" && !gameOver ? lotteryHeartbeat(payLeft, facesLeft) : null;
  const beatBpm = heartbeat?.bpm ?? null;
  const beatIntensity = heartbeat?.intensity ?? 0;
  const oddsText =
    payLeft >= facesLeft
      ? t("expenses.lotteryOddsAll")
      : payLeft === 1
        ? t("expenses.lotteryOddsOne", { faces: facesLeft })
        : t("expenses.lotteryOdds", { count: payLeft, faces: facesLeft });

  /*
   * The heartbeat itself: a beat at the current tempo, restarted by every
   * tap, quiet while a slip is up and after a few beats if nobody taps. It
   * waits for the first tap, which is also what unlocks audio on iOS. An
   * effect-owned interval, so a new turn, "Neu mischen", closing and
   * unmounting all stop it on their own.
   */
  useEffect(() => {
    if (!open || beatBpm === null || catches.active || turnIndex === 0) return;
    let beats = 0;
    const interval = setInterval(() => {
      playHeartbeatSound(beatIntensity);
      beats += 1;
      if (beats >= HEARTBEAT_BEATS_PER_TURN) clearInterval(interval);
    }, 60_000 / beatBpm);
    return () => clearInterval(interval);
  }, [open, beatBpm, beatIntensity, catches.active, turnIndex]);

  function tapCell(index: number) {
    if (gameOver) return;
    // The board is locked while a slip is up. A ref, not `catches.active`:
    // a second finger in the same frame must already see the first catch.
    if (catches.isActive()) return;
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
      // Counted from the tapped set, not `cells`: that may not have caught up
      // with a tap from the same frame. Outcomes never change mid-round.
      const found = [...tappedIndicesRef.current].filter(
        (tapped) => cells[tapped].outcome === "pay",
      ).length;
      setCaughtCellIndex(index);
      catches.catchOne(tapperUid, { finale: found >= targetLoserCount });
    } else {
      playMissSound();
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setCells([]);
      setTurnIndex(0);
      setCaughtCellIndex(null);
      turnCounterRef.current = 0;
      tappedIndicesRef.current = new Set();
      catches.cancel();
    }
    onOpenChange(nextOpen);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(loserUids, poolUids);
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        {/* Over the whole dialog, as the scratch cards' is: the board is taller than the slip. */}
        <AnimatePresence>
          {flash && (
            <CatchFlash
              key={flash.id}
              seed={flash.id}
              name={members[flash.uid].displayName}
              stampLabel={t("expenses.gameCaughtStamp")}
              finale={flash.finale}
              className="inset-0 z-50 rounded-xl"
              hero={
                caughtCell && (
                  <Image
                    src={caughtCell.character.laughSrc}
                    alt=""
                    fill
                    sizes={HERO_SIZES}
                    className="object-contain drop-shadow-xl"
                  />
                )
              }
              caption={
                <CatchCaption
                  share={flash.finale ? shares?.[flash.uid] : null}
                  stake={stake}
                  detail={
                    caughtAgain
                      ? t("expenses.lotteryCaughtAgain")
                      : t("expenses.lotteryProgress", {
                          found: revealedPayCells.length,
                          target: targetLoserCount,
                        })
                  }
                />
              }
            />
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
              >
                <GamePoolSetupStep
                  memberUids={memberUids}
                  members={members}
                  poolUids={poolUids}
                  onTogglePoolMember={setup.togglePoolMember}
                  loserCount={setup.loserCount}
                  maxLoserCount={setup.maxLoserCount}
                  onStepLoserCount={setup.stepLoserCount}
                  stepperDirection={setup.stepperDirection}
                  countHint={t("expenses.lotteryCountHint")}
                  countIcon={
                    <Image
                      src={CHARACTERS[0].laughSrc}
                      alt=""
                      fill
                      sizes="28px"
                      className="object-contain"
                    />
                  }
                />
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
              >
                {/* A plain box for the impact shake: the motion.div around it owns its own y. */}
                <div ref={stageRef} className="flex flex-col gap-3">
                  {/*
                  The banner and the tray are decorative rearrangements of what this
                  line says, so the live region carries the whole state change — one
                  announcement per turn instead of four fragments. The verdict
                  banner announces itself.
                */}
                  <p aria-live="polite" className="sr-only">
                    {showVerdict
                      ? ""
                      : flash
                        ? t("expenses.lotteryCaughtLabel", { name: members[flash.uid].displayName })
                        : t("expenses.lotteryTurnLabel", {
                            name: members[currentTurnUid].displayName,
                          })}
                  </p>

                  {showVerdict ? (
                    <GameResultBanner loserUids={loserUids} members={members} stake={stake} />
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
                            <GameAvatar
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

                  {/* The odds the heartbeat follows, with a heart beating at its tempo. */}
                  {heartbeat && (
                    <p className="text-muted-foreground -mt-1 flex items-center justify-center gap-1.5 text-xs font-medium">
                      <motion.span
                        // Restarted per tempo: a running repeat keeps its old duration.
                        key={heartbeat.bpm}
                        aria-hidden="true"
                        className="text-destructive flex"
                        animate={reduceMotion ? undefined : { scale: [1, 1.3, 1, 1.15, 1] }}
                        transition={{
                          duration: 60 / heartbeat.bpm,
                          times: [0, 0.12, 0.26, 0.38, 1],
                          ease: "easeOut",
                          repeat: Infinity,
                        }}
                      >
                        <Heart className="size-3.5 fill-current" />
                      </motion.span>
                      {oddsText}
                    </p>
                  )}

                  {/* The board gets a frame of its own so the cards read as laid out on a table. */}
                  {/*
                  Always four rows (landscape) or four columns (portrait, so a
                  phone's height goes to bigger faces instead of 8 tiny ones
                  across): cap the width so the whole grid fits the stage.
                */}
                  <div
                    className="bg-muted/30 relative mx-auto w-full max-w-[calc(var(--game-board-h,100vh)_*_var(--lottery-cols)_/_4)] rounded-xl border p-2 portrait:max-w-[calc(var(--game-board-h,100vh)_*_4_/_var(--lottery-cols))]"
                    style={{ "--lottery-cols": boardCols } as CSSProperties}
                  >
                    <span
                      aria-hidden="true"
                      className="bg-paper-texture pointer-events-none absolute inset-0 rounded-xl opacity-60"
                    />
                    <div
                      className={cn(
                        "relative grid",
                        GRID_COLUMN_CLASS[cells.length] ?? "grid-cols-6",
                        "portrait:grid-cols-4",
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
                            cell.tappedByUid
                              ? (members[cell.tappedByUid]?.displayName ?? null)
                              : null
                          }
                          onTap={() => tapCell(index)}
                        />
                      ))}
                    </div>
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
      </GameDialogContent>
    </Dialog>
  );
}
