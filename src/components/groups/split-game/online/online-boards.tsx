"use client";

import { Lock } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useT } from "@/components/locale-provider";
import { ConnectFourGrid } from "@/components/groups/split-game/connect-four-board";
import { DotsGrid } from "@/components/groups/split-game/dots-board";
import { MemoryGrid } from "@/components/groups/split-game/memory-board";
import { NimGrid } from "@/components/groups/split-game/nim-board";
import {
  ReactionPadContent,
  type ReactionArt,
} from "@/components/groups/split-game/reaction-board";
import {
  RpsHandIcon,
  RpsHandPicker,
  RpsRoundRow,
  RpsScoreStrip,
} from "@/components/groups/split-game/rps-board";
import { TicTacToeGrid } from "@/components/groups/split-game/tic-tac-toe-board";
import { replayDots } from "@/lib/games/dots-and-boxes";
import { replayNim } from "@/lib/games/nim";
import {
  REACTION_ONLINE_TIMEOUT_MS,
  replayConnectFour,
  replayTicTacToe,
  type OnlineMove,
} from "@/lib/games/online-match";
import { rpsScore, type RpsHand } from "@/lib/games/rock-paper-scissors";
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

  const myReport = myResult ?? localReport;
  const iFalseStarted =
    myReport === "falseStart" || (typeof myReport === "object" && myReport?.kind === "falseStart");
  let art: ReactionArt | null;
  if (me !== null && live.winnerUid === live.players[me]) art = "trophy";
  else if (iFalseStarted) art = "tooEarly";
  else if (phase === "arming" || phase === "waiting") art = "ready";
  else if (phase === "steady") art = "steady";
  else if (phase === "go") art = "go";
  else art = null;

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
        <ReactionPadContent art={art} label={label} dim={phase === "waiting"} />
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

export function OnlineNim({ live, state, me, names, colors, busy, onMove }: OnlineBoardProps) {
  if (state.gameId !== "nim") return null;
  const replay = replayNim(state.moves);
  const myTurn = me !== null && replay.turn === me && live.winnerUid === null;
  return (
    <NimGrid
      rows={replay.rows}
      last={replay.last}
      colors={colors}
      names={names}
      turnColor={colors[replay.turn]}
      disabled={!myTurn || busy}
      onTake={(row, count) => onMove({ kind: "take", row, count })}
    />
  );
}

export function OnlineDots({ live, state, me, names, colors, busy, onMove }: OnlineBoardProps) {
  if (state.gameId !== "dots") return null;
  const replay = replayDots(state.lines);
  const myTurn = me !== null && replay.turn === me && live.winnerUid === null;
  return (
    <DotsGrid
      state={replay.state}
      lastLine={replay.last?.line ?? null}
      colors={colors}
      names={names}
      disabled={!myTurn || busy}
      onLine={(index) => onMove({ kind: "line", index })}
    />
  );
}

/**
 * The online Schnick-Schnack-Schnuck: each phone shows only its own hands. A
 * hand locks the moment it is picked and stays secret on the server until the
 * other player has locked one too — then the round appears for both at once,
 * in the list below. There are no turns, so the match has no "your move".
 */
export function OnlineRps({ live, state, me, names, colors, busy, onMove }: OnlineBoardProps) {
  const t = useT();
  // What this phone picked this round. The server keeps hands secret, so a
  // reload forgets it — the pad then simply says "locked in".
  const [myPick, setMyPick] = useState<{ round: number; hand: RpsHand } | null>(null);
  if (state.gameId !== "rps") return null;

  const round = state.rounds.length;
  const decided = live.winnerUid !== null;
  const other: 0 | 1 = me === 1 ? 0 : 1;
  const iLocked = me !== null && state.locked[me];
  const shownPick = iLocked && myPick?.round === round ? myPick.hand : null;

  function pick(hand: RpsHand) {
    setMyPick({ round, hand });
    onMove({ kind: "pick", hand });
  }

  let pad: ReactNode = null;
  if (!decided) {
    if (me === null) {
      // A spectator sees who has locked in, never what.
      pad = (
        <ul className="flex flex-col gap-1 text-sm">
          {([0, 1] as const).map((seat) => (
            <li key={seat} className="flex items-center justify-center gap-2">
              <span style={{ color: colors[seat] }}>{names[seat]}</span>
              {state.locked[seat] ? (
                <Lock aria-hidden="true" className="text-muted-foreground size-4" />
              ) : (
                <span className="text-muted-foreground text-xs">{t("expenses.rpsChoosing")}</span>
              )}
            </li>
          ))}
        </ul>
      );
    } else if (iLocked) {
      pad = (
        <div className="flex flex-col items-center gap-2">
          {shownPick ? (
            <RpsHandIcon hand={shownPick} className="text-6xl" />
          ) : (
            <Lock aria-hidden="true" className="text-muted-foreground size-8" />
          )}
          <p className="text-muted-foreground text-sm font-medium">
            {t("expenses.rpsLockedWaiting", { name: names[other] })}
          </p>
        </div>
      );
    } else {
      pad = (
        <div className="flex flex-col items-center gap-3">
          <RpsHandPicker disabled={busy} onPick={pick} />
          <p className="text-muted-foreground text-xs">
            {state.locked[other]
              ? t("expenses.rpsOpponentLocked", { name: names[other] })
              : t("expenses.rpsHint")}
          </p>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex flex-col gap-3 rounded-2xl p-3 select-none [-webkit-touch-callout:none]"
        style={{
          backgroundColor: `color-mix(in oklch, ${colors[me ?? 0]} 14%, var(--muted))`,
        }}
      >
        <RpsScoreStrip names={names} colors={colors} score={rpsScore(state.rounds)} />
        {pad && <div className="flex min-h-28 items-center justify-center">{pad}</div>}
      </div>
      {state.rounds.length > 0 && (
        <ol aria-label={t("expenses.rpsRoundsTitle")} className="flex flex-col gap-1.5">
          {state.rounds.map((played, index) => (
            <RpsRoundRow
              key={index}
              round={played}
              names={names}
              colors={colors}
              fresh={index === state.rounds.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export const ONLINE_BOARDS = {
  tictactoe: OnlineTicTacToe,
  connectfour: OnlineConnectFour,
  memory: OnlineMemory,
  reaction: OnlineReaction,
  rps: OnlineRps,
  nim: OnlineNim,
  dots: OnlineDots,
} as const;
