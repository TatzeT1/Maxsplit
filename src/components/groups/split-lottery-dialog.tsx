"use client";

import { Check, Minus, Plus } from "lucide-react";
import Image from "next/image";
import { type CSSProperties, useRef, useState } from "react";
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
import { avatarGradient, cn } from "@/lib/utils";
import { playAppliedSound, playLaughSound, playTapSound } from "@/lib/sound/lottery-sounds";
import type { GroupMember } from "@/lib/types";

/**
 * The cast: real (generated, non-photographic) character portraits, each as
 * a calm/laughing pair so a revealed cell reads as "the same person, a
 * different mood" — one random cast member headlines each round. Generic
 * drawn characters, not a likeness of any real or existing person.
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
];

function randomCharacter(): LotteryCharacter {
  const bytes = randomBytes(1);
  return CHARACTERS[bytes[0] % CHARACTERS.length];
}

/**
 * The card back: the silhouette of the same head, in the current text color.
 *
 * A face-shaped back says "a person is hiding under here" and makes the flip
 * land as a reveal of *who*, which a question mark never did.
 */
function HiddenFaceMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-6", className)} aria-hidden="true">
      <circle cx="24" cy="25" r="16" fill="currentColor" opacity="0.18" />
      <path
        d="M7.5 22.5A16.8 16.8 0 0 1 40.5 22.5C36.7 16.5 30.8 13.7 24 13.7S11.3 16.5 7.5 22.5Z"
        fill="currentColor"
        opacity="0.32"
      />
    </svg>
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
 * One face-down card.
 *
 * The reveal is a real 180° flip rather than a swap: two faces stacked back to
 * back inside a `preserve-3d` wrapper, the back hidden once the card turns
 * past 90°. That is what makes tapping feel like turning a card over instead
 * of watching a cell change color. `prefers-reduced-motion` collapses the
 * transition globally (see globals.css), which lands the card on its final
 * state instantly rather than leaving it mid-flip.
 */
function LotteryCard({
  cell,
  character,
  stagger,
  boardLocked,
  label,
  tapperName,
  onTap,
}: {
  cell: LotteryCell;
  character: LotteryCharacter;
  stagger: number;
  boardLocked: boolean;
  label: string;
  tapperName: string | null;
  onTap: () => void;
}) {
  const isPay = cell.outcome === "pay";
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={cell.revealed || boardLocked}
      aria-label={label}
      className={cn(
        "focus-visible:ring-ring/50 ease-spring relative aspect-square touch-manipulation rounded-lg transition-[transform,opacity] duration-(--duration-fast) outline-none focus-visible:ring-3",
        !cell.revealed && (boardLocked ? "opacity-40" : "hover:-translate-y-0.5 active:scale-95"),
        // Keeps the tapper's badge above the neighbouring cards it overhangs.
        cell.revealed && isPay && "z-10",
      )}
    >
      {/*
        Three nested spans, each owning exactly one transform: the deal-in
        rise, the flip, and the press/hover on the button itself. Collapsing
        any two of them means one animation's `both` fill freezes the other.
      */}
      <span
        className="animate-rise absolute inset-0 [perspective:700px]"
        style={{ "--stagger": stagger } as CSSProperties}
      >
        <span
          className={cn(
            "ease-spring absolute inset-0 transition-transform duration-(--duration-slow) transform-3d",
            cell.revealed && "rotate-y-180",
          )}
        >
          <span className="border-border/70 bg-card shadow-e1 text-primary absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg border backface-hidden">
            <span aria-hidden="true" className="bg-paper-texture absolute inset-0 opacity-70" />
            <HiddenFaceMark className="relative size-[62%]" />
          </span>
          <span
            className={cn(
              "absolute inset-0 flex rotate-y-180 items-center justify-center rounded-lg border backface-hidden",
              isPay
                ? "border-destructive/45 bg-destructive/10 shadow-e1"
                : "border-success/35 bg-success/10",
            )}
          >
            <span className="relative size-[78%]">
              <Image
                src={isPay ? character.laughSrc : character.calmSrc}
                alt=""
                fill
                sizes="120px"
                className="object-contain"
              />
            </span>
            {isPay && tapperName && (
              <span
                className={cn(
                  "ring-popover absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-linear-to-br text-[9px] leading-none font-semibold text-white ring-2",
                  avatarGradient(tapperName),
                )}
              >
                {tapperName.charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </span>
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
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [loserCountInput, setLoserCountInput] = useState("1");
  const [targetLoserCount, setTargetLoserCount] = useState(1);
  const [cells, setCells] = useState<LotteryCell[]>([]);
  const [turnIndex, setTurnIndex] = useState(0);
  const [character, setCharacter] = useState<LotteryCharacter>(CHARACTERS[0]);
  const [flashCharacter, setFlashCharacter] = useState<LotteryCharacter | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setCells(outcomes.map((outcome) => ({ outcome, revealed: false, tappedByUid: null })));
    setTargetLoserCount(target);
    setTurnIndex(0);
    setCharacter(randomCharacter());
    setStep("playing");
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
    setLoserCountInput(String(Math.min(Math.max(loserCount + delta, 1), maxLoserCount)));
  }

  const loserUids = [
    ...new Set(
      cells
        .filter((cell) => cell.revealed && cell.outcome === "pay")
        .map((cell) => cell.tappedByUid as string),
    ),
  ];
  const gameOver = loserUids.length >= targetLoserCount;
  const currentTurnUid = poolUids[turnIndex % poolUids.length];

  function tapCell(index: number) {
    if (gameOver) return;
    const cell = cells[index];
    if (cell.revealed) return;

    const tapperUid = currentTurnUid;
    setCells((current) =>
      current.map((c, i) => (i === index ? { ...c, revealed: true, tappedByUid: tapperUid } : c)),
    );
    if (cell.outcome === "pay") {
      playLaughSound();
      // Re-triggers even if a previous flash's timeout hasn't fired yet, so
      // back-to-back catches each get their own full-length takeover.
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashCharacter(character);
      flashTimeoutRef.current = setTimeout(() => setFlashCharacter(null), 900);
    } else {
      playTapSound();
    }
    setTurnIndex((i) => i + 1);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      setCells([]);
      setTurnIndex(0);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlashCharacter(null);
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
      ? t("expenses.lotteryResultOne", { name: loserNames[0] })
      : t("expenses.lotteryResultMultiple", { names: loserNames.join(", ") });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {flashCharacter && (
          <div
            aria-hidden="true"
            className="bg-popover/95 animate-in fade-in zoom-in-75 pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-xl duration-200"
          >
            <span className="relative size-[85%]">
              <Image
                src={flashCharacter.laughSrc}
                alt=""
                fill
                sizes="400px"
                className="object-contain drop-shadow-2xl"
              />
            </span>
          </div>
        )}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎲</span>
            {t("expenses.lotteryTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.lotteryIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label id="lottery-pool-label">{t("expenses.lotteryPoolLabel")}</Label>
              <div
                role="group"
                aria-labelledby="lottery-pool-label"
                className="flex flex-col gap-1.5"
              >
                {memberUids.map((uid) => {
                  const name = members[uid].displayName;
                  const selected = poolUids.includes(uid);
                  return (
                    <label
                      key={uid}
                      className={cn(
                        "has-focus-visible:ring-ring/50 ease-spring flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none active:scale-[0.99] has-focus-visible:ring-3",
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
                        {selected && <Check className="size-3.5" />}
                      </span>
                    </label>
                  );
                })}
              </div>
              {poolUids.length < 2 && (
                <p className="text-muted-foreground text-xs">{t("expenses.lotteryPoolMinHint")}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label id="lottery-count-label">{t("expenses.lotteryCountLabel")}</Label>
              <div
                role="group"
                aria-labelledby="lottery-count-label"
                className="bg-muted/40 flex items-center gap-3 rounded-xl border p-2"
              >
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label={t("expenses.lotteryCountDecrease")}
                  disabled={loserCount <= 1}
                  onClick={() => stepLoserCount(-1)}
                >
                  <Minus />
                </Button>
                <div className="flex flex-1 items-center justify-center gap-2">
                  {/* Live, so stepping the count is audible as well as visible. */}
                  <span
                    aria-live="polite"
                    className="font-heading tabular-money text-2xl leading-none font-medium"
                  >
                    {loserCount}
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
                  aria-label={t("expenses.lotteryCountIncrease")}
                  disabled={loserCount >= maxLoserCount}
                  onClick={() => stepLoserCount(1)}
                >
                  <Plus />
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("expenses.lotteryCountHint")}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/*
              The banner and the tray are decorative rearrangements of what this
              line says, so the live region carries the whole state change — one
              announcement per turn instead of four fragments.
            */}
            <p aria-live="polite" className="sr-only">
              {gameOver
                ? resultText
                : t("expenses.lotteryTurnLabel", {
                    name: members[currentTurnUid].displayName,
                  })}
            </p>

            {gameOver ? (
              <div className="border-primary/30 bg-primary/5 animate-rise relative flex flex-col items-center gap-2 overflow-hidden rounded-xl border p-4 text-center">
                <span
                  aria-hidden="true"
                  className="bg-primary/25 animate-bloom pointer-events-none absolute -top-10 left-1/2 size-28 -translate-x-1/2 rounded-full blur-2xl"
                />
                <span className="text-muted-foreground relative text-[11px] font-semibold tracking-[0.12em] uppercase">
                  {t("expenses.lotteryResultEyebrow")}
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
              <div className="bg-muted/40 flex items-center gap-3 rounded-xl border p-3">
                <span className="relative flex shrink-0">
                  <span
                    aria-hidden="true"
                    className="bg-primary/25 animate-breathe absolute inset-0 rounded-full blur-sm"
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
              </div>
            )}

            {/* How many laughing faces are still out there, as slots rather than a sentence. */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="sr-only">
                {t("expenses.lotteryProgress", {
                  found: loserUids.length,
                  target: targetLoserCount,
                })}
              </span>
              {Array.from({ length: targetLoserCount }, (_, index) => {
                const found = index < loserUids.length;
                return (
                  <span
                    key={index}
                    aria-hidden="true"
                    className={cn(
                      "flex size-7 items-center justify-center rounded-lg border transition-colors duration-(--duration-base)",
                      found
                        ? "border-destructive/40 bg-destructive/10"
                        : "border-border border-dashed",
                    )}
                  >
                    {found ? (
                      <span className="relative size-5">
                        <Image
                          src={character.laughSrc}
                          alt=""
                          fill
                          sizes="20px"
                          className="object-contain"
                        />
                      </span>
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
                    character={character}
                    stagger={index * 0.35}
                    boardLocked={gameOver}
                    label={
                      cell.revealed
                        ? cell.outcome === "pay"
                          ? t("expenses.lotteryRevealPay")
                          : t("expenses.lotterySafe")
                        : t("expenses.lotteryCardHidden")
                    }
                    tapperName={
                      cell.tappedByUid ? (members[cell.tappedByUid]?.displayName ?? null) : null
                    }
                    onTap={() => tapCell(index)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "setup" ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.lotteryStart")}
            </Button>
          ) : gameOver ? (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setStep("setup")}
              >
                {t("expenses.lotteryPlayAgain")}
              </Button>
              <Button type="button" size="lg" className="flex-1" onClick={applyResult}>
                {t("expenses.lotteryApply")}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full"
              onClick={() => setStep("setup")}
            >
              {t("expenses.lotteryPlayAgain")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
