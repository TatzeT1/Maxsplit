"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { ConnectFourGrid } from "@/components/groups/split-game/connect-four-board";
import { MemoryGrid } from "@/components/groups/split-game/memory-board";
import { TicTacToeGrid } from "@/components/groups/split-game/tic-tac-toe-board";
import {
  REACTION_ONLINE_TIMEOUT_MS,
  replayConnectFour,
  replayTicTacToe,
  type OnlineMove,
} from "@/lib/games/online-match";
import { ticTacToeNextToVanish, ticTacToeVariantForAttempt } from "@/lib/games/tic-tac-toe";
import { playBuzzerSound, playGoSound, playTickSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import type { LiveMatch, LiveMatchState } from "@/lib/types";

/** What every online board gets from `OnlineMatchRunner` — the live doc (possibly with an optimistic state laid over it) and a way to send a move. */
export interface OnlineBoardProps {
  live: LiveMatch;
  /** The state to draw: the live doc's, or the runner's optimistic guess right after this phone's own move. */
  state: LiveMatchState;
  /** This viewer's index in `live.players`, or `null` for a spectator. */
  me: 0 | 1 | null;
  names: [string, string];
  colors: [string, string];
  /** True while this phone's own move is in flight — the board ignores input until it lands. */
  busy: boolean;
  onMove: (move: OnlineMove) => void;
}

export function OnlineTicTacToe({
  live,
  state,
  me,
  names,
  colors,
  busy,
  onMove,
}: OnlineBoardProps) {
  if (state.gameId !== "tictactoe") return null;
  const replay = replayTicTacToe(state.moves, live.attempt);
  const variant = ticTacToeVariantForAttempt(live.attempt);
  const myTurn = me !== null && replay.turn === me && live.winnerUid === null;
  return (
    <TicTacToeGrid
      cells={replay.cells}
      winLine={replay.winLine}
      nextToVanish={ticTacToeNextToVanish(replay.state, replay.turn, variant)}
      turn={replay.turn}
      colors={colors}
      names={names}
      disabled={!myTurn || busy}
      onTap={(index) => onMove({ kind: "cell", index })}
    />
  );
}

export function OnlineConnectFour({
  live,
  state,
  me,
  names,
  colors,
  busy,
  onMove,
}: OnlineBoardProps) {
  if (state.gameId !== "connectfour") return null;
  const replay = replayConnectFour(state.columns);
  const myTurn = me !== null && replay.turn === me && live.winnerUid === null;
  return (
    <ConnectFourGrid
      board={replay.board}
      winCells={replay.winCells}
      lastDrop={replay.lastDrop}
      colors={colors}
      names={names}
      disabled={!myTurn || busy}
      onDrop={(column) => onMove({ kind: "column", column })}
    />
  );
}

/** How long a just-arrived mismatch stays untouchable, so the next player actually sees both cards before flipping on. */
const MISMATCH_GRACE_MS = 900;

export function OnlineMemory({ live, state, me, colors, busy, onMove }: OnlineBoardProps) {
  // Sticky "a mismatch just landed" lock, keyed by version: set when a new
  // snapshot shows two open, non-matching cards, cleared by a timer.
  const [graceVersion, setGraceVersion] = useState<number | null>(null);
  const mismatchShown = state.gameId === "memory" && state.open.length === 2;
  const [seenVersion, setSeenVersion] = useState(live.version);
  if (seenVersion !== live.version) {
    setSeenVersion(live.version);
    if (mismatchShown) setGraceVersion(live.version);
  }
  useEffect(() => {
    if (graceVersion === null) return;
    const timer = setTimeout(() => setGraceVersion(null), MISMATCH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [graceVersion]);

  if (state.gameId !== "memory") return null;
  const myTurn = me !== null && state.turn === me && live.winnerUid === null;
  const openFaces = new Map(state.open.map((card) => [card.index, card.face]));
  return (
    <MemoryGrid
      cards={state.claimedBy.map((claimedBy, index) => ({
        key: index,
        face: state.claimedFaces[index] ?? openFaces.get(index) ?? null,
        claimedBy: claimedBy === -1 ? null : claimedBy,
      }))}
      colors={colors}
      disabled={!myTurn || busy || graceVersion !== null}
      onFlip={(index) => onMove({ kind: "flip", index })}
    />
  );
}

const reactionTimeFormatter = new Intl.NumberFormat("de-DE");

type ReactionPhase = "arming" | "waiting" | "steady" | "go" | "reported";

/**
 * The online reaction duel: each phone shows only its own pad and measures
 * its own reaction — from the moment *this* phone showed "Los!" to *this*
 * phone's tap — so network lag never decides who was faster. The server
 * picks the delay once both are ready; each phone starts counting it the
 * moment it sees that, and reports a time or a false start.
 */
export function OnlineReaction({ live, state, me, names, colors, onMove }: OnlineBoardProps) {
  const t = useT();
  const [goAt, setGoAt] = useState<number | null>(null);
  const [localReport, setLocalReport] = useState<number | "falseStart" | null>(null);
  const sentRef = useRef(false);
  const goAtRef = useRef<number | null>(null);
  const reactionState = state.gameId === "reaction" ? state : null;
  const delay = reactionState?.signalDelayMs ?? null;
  const myResult = me !== null && reactionState ? reactionState.results[me] : null;
  const reported = myResult !== null;

  // Arm the local signal the moment the server's delay arrives. The board is
  // remounted per attempt (keyed by the runner), so this runs once per try.
  // Depends on `reported` (a boolean), not the result object: every snapshot
  // brings a fresh object, and re-running this would restart the countdown.
  useEffect(() => {
    if (delay === null || me === null || reported) return;
    const goTimer = setTimeout(() => {
      const now = performance.now();
      goAtRef.current = now;
      setGoAt(now);
      playGoSound();
    }, delay);
    return () => clearTimeout(goTimer);
  }, [delay, me, reported]);

  // Nobody tapped after "Los!" — report the timeout so the match can't hang.
  useEffect(() => {
    if (goAt === null || sentRef.current) return;
    const timer = setTimeout(() => {
      if (sentRef.current) return;
      sentRef.current = true;
      setLocalReport(REACTION_ONLINE_TIMEOUT_MS);
      onMove({ kind: "reaction", report: { kind: "time", ms: REACTION_ONLINE_TIMEOUT_MS } });
    }, REACTION_ONLINE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [goAt, onMove]);

  if (!reactionState) return null;
  const other: 0 | 1 = me === 1 ? 0 : 1;

  let phase: ReactionPhase;
  if (me === null) phase = "waiting";
  else if (myResult !== null || localReport !== null) phase = "reported";
  else if (!reactionState.ready[me]) phase = "arming";
  else if (delay === null) phase = "waiting";
  else phase = goAt !== null ? "go" : "steady";

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (me === null || live.winnerUid !== null) return;
    if (phase === "arming") {
      playTickSound();
      onMove({ kind: "ready" });
      return;
    }
    if (sentRef.current || (phase !== "steady" && phase !== "go")) return;
    sentRef.current = true;
    if (goAtRef.current === null) {
      playBuzzerSound();
      setLocalReport("falseStart");
      onMove({ kind: "reaction", report: { kind: "falseStart" } });
      return;
    }
    // Same clock as performance.now(); see reaction-board.tsx for the fallback.
    const now = event.timeStamp > 1e12 ? performance.now() : event.timeStamp;
    const ms = Math.min(REACTION_ONLINE_TIMEOUT_MS, Math.max(0, Math.round(now - goAtRef.current)));
    setLocalReport(ms);
    onMove({ kind: "reaction", report: { kind: "time", ms } });
  }

  const describe = (report: typeof myResult | number | "falseStart" | null): string | null => {
    if (report === null) return null;
    if (report === "falseStart" || (typeof report === "object" && report.kind === "falseStart")) {
      return t("expenses.reactionFalseStart");
    }
    const ms = typeof report === "number" ? report : report.ms;
    return t("expenses.reactionTimeMs", { ms: reactionTimeFormatter.format(ms) });
  };

  const mine = describe(myResult ?? localReport);
  const theirs = describe(reactionState.results[other]);

  let label: string;
  if (phase === "arming") label = t("expenses.reactionTapWhenReady");
  else if (phase === "waiting" && me !== null && !reactionState.ready[other]) {
    label = t("expenses.reactionWaitingFor", { name: names[other] });
  } else if (phase === "go") label = t("expenses.reactionGo");
  else if (phase === "reported") label = mine ?? "";
  else label = t("expenses.reactionSteady");

  const color = me === null ? colors[0] : colors[me];
  const showGo = phase === "go";

  return (
    <div className="flex touch-none flex-col gap-2 select-none [-webkit-touch-callout:none]">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        disabled={me === null || live.winnerUid !== null || phase === "reported"}
        className={cn(
          "relative flex h-[min(46dvh,360px)] touch-manipulation items-center justify-center rounded-2xl px-4 text-center text-xl font-semibold transition-colors duration-(--duration-fast)",
          showGo ? "text-white" : "text-foreground",
        )}
        style={{
          backgroundColor: showGo ? color : `color-mix(in oklch, ${color} 18%, var(--muted))`,
        }}
      >
        {label}
      </button>
      {me !== null && (
        <p className="text-muted-foreground text-center text-xs">
          {theirs
            ? t("expenses.onlineReactionTheirs", { name: names[other], result: theirs })
            : phase === "reported"
              ? t("expenses.reactionWaitingFor", { name: names[other] })
              : t("expenses.onlineReactionOwnClock")}
        </p>
      )}
    </div>
  );
}

export const ONLINE_BOARDS = {
  tictactoe: OnlineTicTacToe,
  connectfour: OnlineConnectFour,
  memory: OnlineMemory,
  reaction: OnlineReaction,
} as const;
