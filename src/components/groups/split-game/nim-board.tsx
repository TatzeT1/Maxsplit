"use client";

import { Wind } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { duelPalettes } from "@/lib/games/member-colors";
import {
  NIM_START_ROWS,
  canNimSkip,
  encodeNimMove,
  encodeNimSkip,
  nimFuseSeconds,
  nimLateMove,
  nimTotal,
  replayNim,
  type NimReplay,
} from "@/lib/games/nim";
import { randomInt } from "@/lib/games/random";
import { useTurnFuse } from "@/lib/games/use-turn-fuse";
import {
  playBuzzerSound,
  playFuseTickSound,
  playMatchStrikeSound,
  playSkipSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import type { DuelBoardProps } from "@/components/groups/split-game/duel-game-dialog";

/** One match on the classic 1·3·5·7 layout. Remounted fresh for every new match by the shell. */
export function NimBoard({ players, members, locked, onWin }: DuelBoardProps) {
  const t = useT();
  const [moves, setMoves] = useState<number[]>([]);
  const replay = useMemo(() => replayNim(moves), [moves]);
  const finishedRef = useRef(false);
  const names: [string, string] = [
    members[players[0]].displayName,
    members[players[1]].displayName,
  ];
  const colors = duelPalettes(names[0], names[1]);

  /** Plays one stored action; anything the rules would refuse is ignored. */
  function play(code: number) {
    if (locked || finishedRef.current) return;
    const next = [...moves, code];
    const after = replayNim(next);
    if (after.moveCount === replay.moveCount) return;
    setMoves(next);
    if (after.winner !== null) {
      // Taking the very last match loses, so the other player wins.
      finishedRef.current = true;
      onWin(players[after.winner]);
    }
  }

  function burnt() {
    const late = nimLateMove(replay.rows, randomInt);
    if (late) play(encodeNimMove(late.row, late.count, true));
  }

  return (
    <div className="flex flex-col gap-3">
      <DuelTurnBanner uid={players[replay.turn]} members={members} hint={t("expenses.nimHint")} />
      <NimGrid
        replay={replay}
        colors={colors}
        names={names}
        canAct={!locked}
        fuseRunning={!locked}
        fuseSound
        onBurnt={burnt}
        onTake={(row, count) => play(encodeNimMove(row, count))}
        onSkip={() => play(encodeNimSkip())}
      />
    </div>
  );
}

/**
 * The matchstick board, stateless apart from which matches are currently
 * picked — shared by the one-phone board and the online board. Tapping a match
 * picks it and every match to its right in that row (the ones you'd pull off
 * the end); "Nehmen" takes them. Above the matches burns the fuse, beside the
 * "Nehmen" button sits the joker.
 *
 * It also plays the sound of every move that lands — mine, the other phone's
 * and the fuse's alike — so a move feels the same wherever it came from.
 */
export function NimGrid({
  replay,
  colors,
  names,
  canAct,
  fuseRunning,
  fuseSound,
  onBurnt,
  onTake,
  onSkip,
}: {
  replay: NimReplay;
  colors: [string, string];
  names: [string, string];
  /** Whether this viewer may move right now. */
  canAct: boolean;
  /** Whether the fuse burns — false while the match is over, held, or this phone is offline. */
  fuseRunning: boolean;
  /** Whether the fuse's last seconds are audible here. */
  fuseSound: boolean;
  /** The fuse burnt down. Only the phone that would play the late move passes this. */
  onBurnt?: () => void;
  onTake: (row: number, count: number) => void;
  onSkip: () => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const { rows, turn, jokers, last, moveCount } = replay;
  const total = nimTotal(rows);
  const finished = replay.loser !== null;
  const skippable = canNimSkip(replay, turn);

  // A pick belongs to one position: any move, even a joker, makes it lapse.
  const positionKey = `${rows.join("-")}/${moveCount}`;
  const [selection, setSelection] = useState<{ key: string; row: number; from: number } | null>(
    null,
  );
  const active = selection && selection.key === positionKey ? selection : null;
  const pickedCount = active ? rows[active.row] - active.from : 0;

  function choose(row: number, index: number) {
    if (!canAct || finished) return;
    if (active && active.row === row && active.from === index) {
      setSelection(null);
      return;
    }
    setSelection({ key: positionKey, row, from: index });
  }

  function confirmTake() {
    if (!canAct || finished || !active || pickedCount === 0) return;
    const { row } = active;
    setSelection(null);
    onTake(row, pickedCount);
  }

  // The sound of every move that lands after this board appeared.
  const [initialMoves] = useState(moveCount);
  const soundedRef = useRef(moveCount);
  useEffect(() => {
    if (moveCount <= soundedRef.current) {
      soundedRef.current = moveCount;
      return;
    }
    soundedRef.current = moveCount;
    if (!last) return;
    if (last.kind === "skip") playSkipSound();
    else if (last.late) playBuzzerSound();
    else playMatchStrikeSound();
  }, [moveCount, last]);

  const fresh = moveCount > initialMoves;
  const danger = !finished && total <= 4;
  const mover = names[turn];

  let message: string;
  let messageColor: string | undefined;
  if (!finished && total === 1) {
    message = t(jokers[turn] > 0 ? "expenses.nimLastOneJoker" : "expenses.nimLastOne", {
      name: mover,
    });
    messageColor = colors[turn];
  } else if (last?.kind === "skip") {
    message = t("expenses.nimLastSkip", { name: names[last.player] });
    messageColor = colors[last.player];
  } else if (last?.kind === "take" && last.late) {
    message = t("expenses.nimLastLate", { name: names[last.player] });
    messageColor = colors[last.player];
  } else if (last?.kind === "take") {
    message = t("expenses.nimLastMove", { name: names[last.player], count: last.count });
    messageColor = colors[last.player];
  } else {
    message = t("expenses.nimRemaining", { count: total });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-5 items-center justify-center">
        {finished ? null : moveCount === 0 ? (
          <p className="text-muted-foreground text-center text-xs font-medium">
            {t("expenses.nimFuseUnlit")}
          </p>
        ) : (
          <NimFuse
            seconds={nimFuseSeconds(total)}
            running={fuseRunning}
            resetKey={moveCount}
            sound={fuseSound}
            onBurnt={onBurnt}
          />
        )}
      </div>

      <p
        aria-live="polite"
        className="text-muted-foreground min-h-5 text-center text-xs font-medium"
        style={messageColor ? { color: messageColor } : undefined}
      >
        {message}
      </p>

      <div
        className={cn(
          "relative mx-auto flex w-full max-w-[320px] flex-col items-center gap-2 overflow-hidden rounded-xl border border-black/20 bg-[#1f5a4b] px-2 py-3 shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)]",
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(225_60_35/0.5)_100%)] opacity-0 transition-opacity duration-700",
            danger && "opacity-100",
          )}
        />
        {rows.map((count, row) => (
          <div
            key={row}
            role="group"
            aria-label={t("expenses.nimRowLabel", { row: row + 1, count })}
            className="relative flex items-end justify-center gap-0.5"
          >
            {Array.from({ length: NIM_START_ROWS[row] }, (_, index) => {
              const present = index < count;
              const picked = active?.row === row && index >= active.from && present;
              const burning =
                fresh &&
                last?.kind === "take" &&
                last.row === row &&
                index >= count &&
                index < count + last.count;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={!canAct || finished || !present}
                  aria-pressed={present ? picked : undefined}
                  aria-label={
                    present
                      ? t("expenses.nimMatchLabel", { n: index + 1, row: row + 1 })
                      : undefined
                  }
                  aria-hidden={present ? undefined : true}
                  tabIndex={present ? undefined : -1}
                  onClick={() => choose(row, index)}
                  className="relative flex h-[78px] w-[38px] touch-manipulation items-end justify-center rounded-md"
                >
                  <Match
                    present={present}
                    picked={picked}
                    color={colors[turn]}
                    lastOne={present && total === 1 && !finished && !reduceMotion}
                  />
                  {burning && !reduceMotion && <Flare key={moveCount} />}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[320px] gap-2">
        <Button
          type="button"
          size="lg"
          disabled={!canAct || finished || pickedCount === 0}
          onClick={confirmTake}
          className="min-w-0 flex-1"
        >
          {pickedCount > 0
            ? t("expenses.nimTake", { count: pickedCount })
            : t("expenses.nimTakeNone")}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={!canAct || !skippable}
          onClick={onSkip}
          aria-label={t("expenses.nimSkipLabel")}
          className="shrink-0"
        >
          <Wind aria-hidden="true" />
          {t("expenses.nimSkip")}
        </Button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs">
        <span className="text-muted-foreground font-medium">{t("expenses.nimJokerTitle")}</span>
        {([0, 1] as const).map((seat) => {
          const ready = jokers[seat] > 0;
          return (
            <span
              key={seat}
              aria-label={t(ready ? "expenses.nimJokerReady" : "expenses.nimJokerUsed", {
                name: names[seat],
              })}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 transition-opacity",
                ready ? "font-medium" : "text-muted-foreground opacity-50",
              )}
              style={ready ? { borderColor: colors[seat], color: colors[seat] } : undefined}
            >
              <Wind
                aria-hidden="true"
                className={cn("size-3.5 shrink-0", !ready && "line-through")}
              />
              <span className={cn("max-w-24 truncate", !ready && "line-through")}>
                {names[seat]}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The fuse: a match burning down along the top of the board, with its own
 * clock. Kept apart from the board because it re-renders ten times a second.
 * In the last five seconds it reddens and ticks, louder and higher each time.
 */
function NimFuse({
  seconds,
  running,
  resetKey,
  sound,
  onBurnt,
}: {
  seconds: number;
  running: boolean;
  resetKey: number;
  sound: boolean;
  onBurnt?: () => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const { remainingMs, fraction } = useTurnFuse({ seconds, running, resetKey, onBurnt });
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const urgent = secondsLeft <= 5;

  const tickedRef = useRef("");
  useEffect(() => {
    if (!running || !sound || !urgent || secondsLeft < 1) return;
    const id = `${resetKey}:${secondsLeft}`;
    if (tickedRef.current === id) return;
    tickedRef.current = id;
    playFuseTickSound(secondsLeft);
  }, [running, sound, urgent, secondsLeft, resetKey]);

  return (
    <div
      role="timer"
      aria-label={t("expenses.nimFuseLabel", { seconds: secondsLeft })}
      className="mx-auto flex w-full max-w-[320px] items-center gap-2.5"
    >
      <div className="relative h-2.5 flex-1 rounded-full bg-black/35 shadow-[inset_0_1px_2px_rgb(0_0_0/0.5)]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ease-linear"
          style={{
            width: `${fraction * 100}%`,
            background: urgent
              ? "linear-gradient(90deg, #ff7a3c, #e03a22)"
              : "linear-gradient(90deg, #cfa866, #f6e2b3)",
          }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute top-1/2 -translate-x-1/2 -translate-y-[72%]"
          style={{ left: `${fraction * 100}%`, transformOrigin: "50% 100%" }}
          animate={
            running && !reduceMotion
              ? { scaleY: [1, 1.2, 0.92, 1.12, 1], rotate: [-5, 4, -3, 5, -5] }
              : { scaleY: 1, rotate: 0 }
          }
          transition={{ duration: 0.45, repeat: running && !reduceMotion ? Infinity : 0 }}
        >
          <FlameIcon className="h-5 w-3.5" />
        </motion.span>
      </div>
      <span
        className={cn(
          "w-9 text-right text-sm font-semibold tabular-nums",
          urgent ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {secondsLeft} s
      </span>
    </div>
  );
}

/** A flame, drawn flat: an orange body with a yellow heart. */
function FlameIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 28" className={className}>
      <path
        d="M10 1 C11.5 7 18 10 18 18 C18 24 14.5 27 10 27 C5.5 27 2 24 2 18 C2 13 5 11 6 6.5 C8 8.5 8.5 10.5 9 12 C9.5 8 9 4.5 10 1 Z"
        fill="#ff7a1a"
      />
      <path
        d="M10 12 C11 15 14 16.5 14 20.5 C14 23.5 12.3 25 10 25 C7.7 25 6 23.5 6 20.5 C6 18 8 16.5 8.6 14.5 C9.2 15.5 9.5 16 9.7 16.5 C10.2 15 10.3 13.5 10 12 Z"
        fill="#ffd23f"
      />
    </svg>
  );
}

/** The flame that leaps off a match as it is taken, then fades. */
function Flare() {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-2 left-1/2 z-20 -translate-x-1/2"
      initial={{ opacity: 1, scale: 0.6, y: 0 }}
      animate={{ opacity: 0, scale: 1.3, y: -28 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    >
      <FlameIcon className="h-7 w-5" />
    </motion.span>
  );
}

/** One upright match: a pale stem and a red-orange head. A taken match leaves only a faint mark on the felt. */
function Match({
  present,
  picked,
  color,
  lastOne,
}: {
  present: boolean;
  picked: boolean;
  color: string;
  /** The very last match on the board: its head pulses, because somebody is about to lose. */
  lastOne: boolean;
}) {
  if (!present) {
    return <span aria-hidden="true" className="mb-1 h-16 w-1.5 rounded-full bg-black/15" />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex h-[68px] w-3 flex-col items-center transition-transform duration-(--duration-fast)",
        picked && "-translate-y-2",
      )}
    >
      {picked && (
        <span
          className="absolute -inset-x-1.5 inset-y-0 rounded-full opacity-35 blur-[3px]"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className={cn(
          "relative z-10 h-4 w-3.5 rounded-full bg-linear-to-b from-[#ff8a4c] to-[#d43a22] shadow-[inset_0_-2px_2px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.4)]",
          lastOne && "animate-pulse",
        )}
      />
      <span className="relative -mt-1.5 w-2 flex-1 rounded-b-[3px] bg-linear-to-r from-[#f6e2b3] via-[#ecd092] to-[#cfa866] shadow-[0_1px_2px_rgb(0_0_0/0.4)]" />
    </span>
  );
}
