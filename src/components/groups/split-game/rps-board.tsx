"use client";

import { Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  RPS_HANDS,
  RPS_ROUNDS_TO_WIN,
  judgeRpsRound,
  rpsMatchWinner,
  rpsScore,
  type RpsHand,
  type RpsRound,
} from "@/lib/games/rock-paper-scissors";
import {
  playGiggleSound,
  playGoSound,
  playMissSound,
  playTickSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One beat of "Schnick … Schnack … Schnuck!". */
const COUNTDOWN_BEAT_MS = 480;
/** How long a revealed round stays on screen before the next one (or the match result). */
const REVEAL_HOLD_MS = 1500;

const HAND_LABEL_KEY: Record<RpsHand, TranslationKey> = {
  rock: "expenses.rpsRock",
  paper: "expenses.rpsPaper",
  scissors: "expenses.rpsScissors",
};

const HAND_EMOJI: Record<RpsHand, string> = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

/** A hand as a picture. One place to swap the emoji for artwork later. */
export function RpsHandIcon({ hand, className }: { hand: RpsHand; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("leading-none select-none", className)}>
      {HAND_EMOJI[hand]}
    </span>
  );
}

/** The three hands as big buttons, for whoever is choosing. */
export function RpsHandPicker({
  onPick,
  disabled,
}: {
  onPick: (hand: RpsHand) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-stretch justify-center gap-2">
      {RPS_HANDS.map((hand) => (
        <button
          key={hand}
          type="button"
          disabled={disabled}
          onClick={() => onPick(hand)}
          aria-label={t("expenses.rpsPickLabel", { hand: t(HAND_LABEL_KEY[hand]) })}
          className="bg-background/70 shadow-e1 ease-spring active:shadow-pressed flex min-h-[76px] w-[84px] touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl border transition-[transform,opacity,box-shadow] duration-(--duration-fast) select-none [-webkit-touch-callout:none] active:scale-95 disabled:opacity-50"
        >
          <RpsHandIcon hand={hand} className="text-4xl" />
          <span className="text-xs font-medium">{t(HAND_LABEL_KEY[hand])}</span>
        </button>
      ))}
    </div>
  );
}

/** Round wins as pips, in the player's own colour: one pip per win needed. */
export function RpsScorePips({ wins, color }: { wins: number; color: string }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-1">
      {Array.from({ length: RPS_ROUNDS_TO_WIN }, (_, index) => (
        <span
          key={index}
          className={cn("size-2.5 rounded-full border", index >= wins && "border-foreground/30")}
          style={index < wins ? { backgroundColor: color, borderColor: color } : undefined}
        />
      ))}
    </span>
  );
}

/** "Anna ●○   ○○ Ben" — who has how many round wins. */
export function RpsScoreStrip({
  names,
  colors,
  score,
}: {
  names: [string, string];
  colors: [string, string];
  score: [number, number];
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-between gap-3 text-sm font-medium">
      {([0, 1] as const).map((seat) => (
        <span
          key={seat}
          className={cn("flex min-w-0 items-center gap-2", seat === 1 && "flex-row-reverse")}
        >
          <span className="sr-only">
            {t("expenses.rpsScoreLabel", { name: names[seat], count: score[seat] })}
          </span>
          <span aria-hidden="true" className="truncate" style={{ color: colors[seat] }}>
            {names[seat]}
          </span>
          <RpsScorePips wins={score[seat]} color={colors[seat]} />
        </span>
      ))}
    </div>
  );
}

/** One revealed round as a line: both hands and who took it. */
export function RpsRoundRow({
  round,
  names,
  colors,
  fresh = false,
}: {
  round: RpsRound;
  names: [string, string];
  colors: [string, string];
  fresh?: boolean;
}) {
  const t = useT();
  const winner = judgeRpsRound(round.p0, round.p1);
  return (
    <li
      className={cn(
        "bg-muted/40 flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
        fresh && "animate-rise",
      )}
    >
      <span className="flex items-center gap-1.5">
        <RpsHandIcon hand={round.p0} className="text-2xl" />
        <span className="text-muted-foreground text-xs">{t("expenses.duelVersusShort")}</span>
        <RpsHandIcon hand={round.p1} className="text-2xl" />
      </span>
      <span
        className="min-w-0 truncate text-right text-xs font-medium"
        style={winner === null ? undefined : { color: colors[winner] }}
      >
        {winner === null
          ? t("expenses.rpsRoundDraw")
          : t("expenses.rpsRoundPoint", { name: names[winner] })}
      </span>
    </li>
  );
}

type Phase = "choose" | "countdown" | "reveal";

/**
 * One match on a shared phone: the screen is split into two halves facing the
 * two players (the top one upside down, like the reaction duel). Each player
 * taps a hand on their own half — it locks at once and shows only a padlock,
 * so nothing gives it away — and when both are in, "Schnick … Schnack …
 * Schnuck!" counts down and both hands appear together. First to two round
 * wins takes the match; a drawn round just goes round again, so the match
 * itself never draws and `onDraw` is never called.
 */
export function RpsBoard({ players, members, locked, onWin }: DuelBoardProps) {
  const t = useT();
  const [rounds, setRounds] = useState<RpsRound[]>([]);
  const [picks, setPicks] = useState<[RpsHand | null, RpsHand | null]>([null, null]);
  const [phase, setPhase] = useState<Phase>("choose");
  const [beat, setBeat] = useState(0);
  // Synchronous mirrors: two fingers can land in the same tick, one per half,
  // and only a ref written right where the tap arrives sees the other's pick.
  const picksRef = useRef<[RpsHand | null, RpsHand | null]>([null, null]);
  const phaseRef = useRef<Phase>("choose");
  const roundsRef = useRef<RpsRound[]>([]);
  const finishedRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const names: [string, string] = [
    members[players[0]].displayName,
    members[players[1]].displayName,
  ];
  const colors = duelPalettes(names[0], names[1]);

  useEffect(() => {
    // The same array for the component's whole lifetime — only ever pushed to —
    // so capturing it here still sees every timer scheduled up to unmount.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function later(ms: number, action: () => void) {
    timersRef.current.push(setTimeout(action, ms));
  }

  function setPhaseBoth(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  function reveal(revealed: [RpsHand, RpsHand]) {
    const nextRounds = [...roundsRef.current, { p0: revealed[0], p1: revealed[1] }];
    roundsRef.current = nextRounds;
    setRounds(nextRounds);
    setPhaseBoth("reveal");
    if (judgeRpsRound(revealed[0], revealed[1]) === null) playMissSound();
    else playGiggleSound();

    const winner = rpsMatchWinner(nextRounds);
    later(REVEAL_HOLD_MS, () => {
      if (winner !== null) {
        finishedRef.current = true;
        onWin(players[winner]);
        return;
      }
      picksRef.current = [null, null];
      setPicks([null, null]);
      setBeat(0);
      setPhaseBoth("choose");
    });
  }

  function startCountdown(revealed: [RpsHand, RpsHand]) {
    setPhaseBoth("countdown");
    setBeat(1);
    playTickSound();
    later(COUNTDOWN_BEAT_MS, () => {
      setBeat(2);
      playTickSound();
    });
    later(COUNTDOWN_BEAT_MS * 2, () => {
      setBeat(3);
      playGoSound();
    });
    later(COUNTDOWN_BEAT_MS * 3, () => reveal(revealed));
  }

  function pick(pad: 0 | 1, hand: RpsHand) {
    if (locked || finishedRef.current || phaseRef.current !== "choose") return;
    if (picksRef.current[pad] !== null) return;
    playTickSound();
    const next: [RpsHand | null, RpsHand | null] = [...picksRef.current];
    next[pad] = hand;
    picksRef.current = next;
    setPicks(next);
    if (next[0] !== null && next[1] !== null) startCountdown([next[0], next[1]]);
  }

  const score = rpsScore(rounds);
  const lastRound = rounds[rounds.length - 1] ?? null;
  const lastWinner = lastRound ? judgeRpsRound(lastRound.p0, lastRound.p1) : null;

  function padBody(pad: 0 | 1) {
    const other: 0 | 1 = pad === 0 ? 1 : 0;
    if (phase === "countdown") {
      return (
        <p className="font-heading text-3xl font-medium" aria-live="polite">
          {t(`expenses.rpsCountdown${beat as 1 | 2 | 3}`)}
        </p>
      );
    }
    if (phase === "reveal" && lastRound) {
      const mine = pad === 0 ? lastRound.p0 : lastRound.p1;
      const theirs = pad === 0 ? lastRound.p1 : lastRound.p0;
      return (
        <div className="flex flex-col items-center gap-2" aria-live="polite">
          <span className="flex items-center gap-3">
            <RpsHandIcon hand={mine} className="text-6xl" />
            <span className="text-muted-foreground text-sm">{t("expenses.duelVersusShort")}</span>
            <RpsHandIcon hand={theirs} className="text-5xl opacity-80" />
          </span>
          <span className="text-sm font-semibold">
            {lastWinner === null
              ? t("expenses.rpsRoundDraw")
              : lastWinner === pad
                ? t("expenses.rpsRoundWon")
                : t("expenses.rpsRoundPoint", { name: names[other] })}
          </span>
        </div>
      );
    }
    if (picks[pad] !== null) {
      return (
        <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <Lock aria-hidden="true" className="size-4" />
          {t("expenses.rpsLockedIn")}
        </p>
      );
    }
    return <RpsHandPicker onPick={(hand) => pick(pad, hand)} disabled={locked} />;
  }

  return (
    <div className="flex touch-manipulation flex-col gap-2 select-none [-webkit-touch-callout:none]">
      <div className="flex h-[min(58dvh,460px)] flex-col gap-1.5 overflow-hidden rounded-xl">
        {([1, 0] as const).map((pad) => (
          <div
            key={pad}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-between gap-2 rounded-xl px-3 py-3",
              pad === 1 && "rotate-180",
            )}
            style={{
              backgroundColor: `color-mix(in oklch, ${colors[pad]} 18%, var(--muted))`,
            }}
          >
            <div className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
              <span className="truncate" style={{ color: colors[pad] }}>
                {names[pad]}
              </span>
              <span className="sr-only">
                {t("expenses.rpsScoreLabel", { name: names[pad], count: score[pad] })}
              </span>
              <RpsScorePips wins={score[pad]} color={colors[pad]} />
            </div>
            <div className="flex flex-1 items-center justify-center">{padBody(pad)}</div>
            <p className="text-muted-foreground text-center text-xs">
              {phase === "choose" && picks[pad] === null ? t("expenses.rpsHint") : " "}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
