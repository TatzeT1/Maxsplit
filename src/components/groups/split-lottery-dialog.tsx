"use client";

import { Check, Minus, Plus } from "lucide-react";
import { type CSSProperties, useState } from "react";
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

/*
 * Illustration palette for the faces.
 *
 * Deliberately literal hex rather than theme tokens: these are a drawing, not
 * chrome. The same painted characters have to read as themselves in both
 * themes, and a skin tone that inverts with the theme stops being a face. The
 * surfaces *around* them — card, border, tint — are theme tokens, so the cards
 * still belong to whichever theme is active.
 */
const SKIN = "#f2c89b";
const INK = "#3f2d1e";
const HAIR = "#5b4128";
const BLUSH = "#e4836b";
const MOUTH = "#7d2b20";
const TONGUE = "#d8654f";
const TEAR = "#7cc4e8";

/**
 * The head both faces share — ears, skull, a top-left highlight and a fringe.
 *
 * Sharing the head is the point: a revealed cell has to read as "the same
 * person, different mood", so only the features change between the two. The
 * faces are drawn from scratch and are deliberately generic — no likeness of
 * any existing character, franchise or person.
 */
function FaceHead() {
  return (
    <>
      <circle cx="9" cy="26" r="3.4" fill={SKIN} stroke={INK} strokeWidth="1.6" />
      <circle cx="39" cy="26" r="3.4" fill={SKIN} stroke={INK} strokeWidth="1.6" />
      <circle cx="24" cy="25" r="17" fill={SKIN} stroke={INK} strokeWidth="1.8" />
      {/* One soft highlight where the light lands — enough to round the head off. */}
      <ellipse
        cx="16.5"
        cy="17"
        rx="7"
        ry="4.6"
        fill="#ffffff"
        opacity="0.25"
        transform="rotate(-28 16.5 17)"
      />
      <path d="M7 22A17.3 17.3 0 0 1 41 22C37 15.6 31 12.8 24 12.8S11 15.6 7 22Z" fill={HAIR} />
    </>
  );
}

/** Dodged it: eyes open, easy closed-mouth smile. */
function SafeFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-6", className)} aria-hidden="true">
      <FaceHead />
      <path
        d="M13.5 19.8q4-2.6 8 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M26.5 19.8q4-2.6 8 0"
        fill="none"
        stroke={INK}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="12.8" cy="30" rx="3.2" ry="1.9" fill={BLUSH} opacity="0.45" />
      <ellipse cx="35.2" cy="30" rx="3.2" ry="1.9" fill={BLUSH} opacity="0.45" />
      <circle cx="17.5" cy="25" r="2.1" fill={INK} />
      <circle cx="30.5" cy="25" r="2.1" fill={INK} />
      <circle cx="18.3" cy="24.2" r="0.75" fill="#ffffff" />
      <circle cx="31.3" cy="24.2" r="0.75" fill="#ffffff" />
      <path
        d="M18 32.5q6 4.5 12 0"
        fill="none"
        stroke={MOUTH}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Caught one: head tipped back, eyes squeezed shut, laughing until it hurts. */
function LaughFace({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-6", className)} aria-hidden="true">
      <g transform="rotate(-6 24 27)">
        <FaceHead />
        <path
          d="M13 19q4.2-3 8.4-0.6"
          fill="none"
          stroke={INK}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M26.6 18.4q4.2-2.4 8.4 0.6"
          fill="none"
          stroke={INK}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <ellipse cx="35.6" cy="30.4" rx="3.2" ry="1.9" fill={BLUSH} opacity="0.5" />
        <path
          d="M13.8 25.6q3.7-4.4 7.4 0"
          fill="none"
          stroke={INK}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M26.8 25.6q3.7-4.4 7.4 0"
          fill="none"
          stroke={INK}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M15.2 29.4c2.9-1.5 14.7-1.5 17.6 0 0 6.2-3.8 9.4-8.8 9.4s-8.8-3.2-8.8-9.4Z"
          fill={MOUTH}
          stroke={INK}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M17 30.3c2.5-0.9 11.5-0.9 14 0v2.5c-2.7-0.9-11.3-0.9-14 0Z" fill="#ffffff" />
        <path
          d="M19.8 35.3c1.1-1.6 7.3-1.6 8.4 0 0.5 1.1-1.6 2.7-4.2 2.7s-4.7-1.6-4.2-2.7Z"
          fill={TONGUE}
        />
        <path
          d="M10.6 27.2c1.6 2.6 2.4 4.1 2.4 5a2.4 2.4 0 0 1-4.8 0c0-0.9 0.8-2.4 2.4-5Z"
          fill={TEAR}
          stroke={INK}
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
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
            {isPay ? <LaughFace className="size-[80%]" /> : <SafeFace className="size-[74%]" />}
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
                  <LaughFace className="size-7" />
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
                      <LaughFace className="size-5" />
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
