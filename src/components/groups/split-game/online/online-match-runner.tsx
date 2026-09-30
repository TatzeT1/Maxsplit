"use client";

import { ArrowLeft, Flag, Loader2, Wifi } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { DuelDrawNotice } from "@/components/groups/split-game/duel-ladder";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { MatchChat } from "@/components/groups/split-game/online/match-chat";
import { ONLINE_BOARDS } from "@/components/groups/split-game/online/online-boards";
import {
  FATE_ICON,
  FATE_TEXT_CLASS,
  MatchStakes,
  useOutcomeKeys,
} from "@/components/groups/split-game/tournament/tournament-fate";
import { openOnlineMatch, playOnlineMove } from "@/lib/actions/tournaments";
import { dotsScore, replayDots } from "@/lib/games/dots-and-boxes";
import { duelPalettes } from "@/lib/games/member-colors";
import { applyOnlineMove, liveTurn, type OnlineMove } from "@/lib/games/online-match";
import { matchFates } from "@/lib/games/tournament-status";
import { useLiveMatch } from "@/lib/games/use-tournament";
import type { TranslationKey } from "@/lib/i18n/translate";
import { playAppliedSound, playLaughSound, playReelStopSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import type {
  DuelGameId,
  GroupMember,
  LiveMatchState,
  Tournament,
  TournamentMatch,
} from "@/lib/types";

const EYEBROW = "text-[11px] font-semibold tracking-[0.12em] uppercase";

/** Hint under "Du bist dran" per turn-based game — the same copy the one-phone boards use. */
const TURN_HINT: Partial<Record<DuelGameId, TranslationKey>> = {
  tictactoe: "expenses.ticTacToeHint",
  connectfour: "expenses.connectFourHint",
  memory: "expenses.memoryHint",
  nim: "expenses.nimHint",
  dots: "expenses.dotsHint",
};

/** True while a replayed attempt hasn't had its first move yet — the window to say "that was a draw". */
function freshAttempt(state: LiveMatchState): boolean {
  switch (state.gameId) {
    case "tictactoe":
      return state.moves.length === 0;
    case "connectfour":
      return state.columns.length === 0;
    case "memory":
      return state.open.length === 0 && state.claimedBy.every((c) => c === -1);
    case "reaction":
      return !state.ready[0] && !state.ready[1];
    case "rps":
      return state.rounds.length === 0 && !state.locked[0] && !state.locked[1];
    case "nim":
      return state.moves.length === 0;
    case "dots":
      return state.lines.length === 0;
  }
}

/**
 * One online match, both players on their own phones. Every move goes to
 * `playOnlineMove` (validated server-side); this component only renders the
 * live doc and — for the two grid games, where the rules are cheap and the
 * outcome certain — lays the viewer's own move over it optimistically so a
 * tap never feels laggy. A spectator gets the same screen, read-only.
 */
export function OnlineMatchRunner({
  groupId,
  tournament,
  match,
  members,
  currentUid,
  contextLabel,
  beforeFirstMove,
  onDone,
}: {
  groupId: string;
  tournament: Tournament;
  match: TournamentMatch;
  members: Record<string, GroupMember>;
  currentUid: string;
  /** "Runde 2 · Gruppe 1", or `null` for a plain 1-vs-1. */
  contextLabel: string | null;
  /** Shown above the board until the first move lands — the invite card, while the other side may not even know yet. */
  beforeFirstMove?: ReactNode;
  onDone: () => void;
}) {
  const t = useT();
  const outcomeKeys = useOutcomeKeys();
  const { live, errorCode, loading } = useLiveMatch(groupId, tournament.id, match.id);
  const [openError, setOpenError] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<{ version: number; state: LiveMatchState } | null>(
    null,
  );
  const openingRef = useRef(false);

  const isPlayer = match.players.includes(currentUid);

  // Whoever arrives first deals the board; the call is idempotent, so both
  // phones can race it. Spectators never create it — they just wait.
  const [openAttempt, setOpenAttempt] = useState(0);
  const needsOpening = isPlayer && !loading && !errorCode && live === null;
  useEffect(() => {
    if (!needsOpening || openingRef.current) return;
    openingRef.current = true;
    void openOnlineMatch({ groupId, tournamentId: tournament.id, matchId: match.id })
      .catch(() => ({ ok: false as const, error: "network" }))
      .then((result) => {
        openingRef.current = false;
        if (!result.ok) setOpenError(result.error);
      });
  }, [needsOpening, openAttempt, groupId, tournament.id, match.id]);

  // A move from the other phone lands — a small click, so an away glance
  // at the screen isn't the only way to notice it's your turn again. (The
  // matchstick board sounds every move itself: a struck match, a joker, a
  // burnt fuse.)
  const lastVersionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live) return;
    if (
      lastVersionRef.current !== null &&
      live.version > lastVersionRef.current &&
      !busy &&
      live.gameId !== "nim"
    ) {
      playReelStopSound();
    }
    lastVersionRef.current = live.version;
  }, [live, busy]);

  // The result sound, once per decided match.
  const decidedRef = useRef(false);
  useEffect(() => {
    if (!live?.winnerUid || decidedRef.current) return;
    decidedRef.current = true;
    if (live.winnerUid === currentUid) playAppliedSound();
    else if (isPlayer) playLaughSound();
  }, [live?.winnerUid, currentUid, isPlayer]);

  const sendMove = useCallback(
    async (move: OnlineMove) => {
      if (!live) return;
      const me = live.players.indexOf(currentUid);
      if (me === -1) return;
      setMoveError(null);
      // Only the open-information games are predicted locally: their rules
      // need no hidden state, and a rejected guess simply snaps back on the
      // next snapshot.
      if (
        live.gameId === "tictactoe" ||
        live.gameId === "connectfour" ||
        live.gameId === "nim" ||
        live.gameId === "dots"
      ) {
        const guess = applyOnlineMove({
          live,
          secret: null,
          player: me as 0 | 1,
          move,
          drawSignalDelay: () => 0,
        });
        if (!("error" in guess)) setOptimistic({ version: live.version, state: guess.state });
      }
      setBusy(true);
      const result = await playOnlineMove({
        groupId,
        tournamentId: tournament.id,
        matchId: match.id,
        move,
      }).catch(() => ({ ok: false as const, error: "network" }));
      setBusy(false);
      if (!result.ok) {
        setOptimistic(null);
        setMoveError(
          result.error === "network"
            ? t("expenses.onlineMoveNetwork")
            : t("expenses.onlineMoveError"),
        );
      }
    },
    [live, currentUid, groupId, tournament.id, match.id, t],
  );

  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";

  const header = (
    <div className="flex min-h-10 items-center justify-between gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground -ml-2 h-10"
        onClick={onDone}
      >
        <ArrowLeft aria-hidden="true" />
        {tournament.trees.length > 1 || Object.keys(tournament.matches).length > 1
          ? t("expenses.tournamentLeaveMatch")
          : t("expenses.onlineOverview")}
      </Button>
      {contextLabel && (
        <span className={cn(EYEBROW, "text-muted-foreground flex items-center gap-1.5")}>
          <Wifi aria-hidden="true" className="size-3.5" />
          {contextLabel}
        </span>
      )}
    </div>
  );

  if (errorCode || openError) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div
          role="alert"
          className="border-destructive/50 text-destructive flex flex-col items-start gap-2 rounded-xl border p-4"
        >
          <p className="text-sm font-medium">{t("expenses.onlineOpenError")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode ?? openError ?? "" })}</p>
          {openError && (
            <Button
              type="button"
              size="sm"
              className="h-10"
              onClick={() => {
                setOpenError(null);
                setOpenAttempt((n) => n + 1);
              }}
            >
              {t("common.retry")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!live) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div
          aria-busy="true"
          className="bg-muted/40 text-muted-foreground flex items-center justify-center gap-2 rounded-xl border p-6 text-sm"
        >
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {isPlayer ? t("expenses.onlinePreparing") : t("expenses.onlineNotStarted")}
        </div>
      </div>
    );
  }

  const meIndex = live.players.indexOf(currentUid);
  const me = meIndex === -1 ? null : (meIndex as 0 | 1);
  const state = optimistic && optimistic.version === live.version ? optimistic.state : live.state;
  // Colors follow the *person*, not the seat — seats swap on every draw replay.
  const [bracketA, bracketB] = match.players as [string, string];
  const [paletteA, paletteB] = duelPalettes(nameOf(bracketA), nameOf(bracketB));
  const colorOf = (uid: string) => (uid === bracketA ? paletteA : paletteB);
  const names: [string, string] = [nameOf(live.players[0]), nameOf(live.players[1])];
  const colors: [string, string] = [colorOf(live.players[0]), colorOf(live.players[1])];
  const turn = liveTurn(state);
  const decided = live.winnerUid !== null;
  const opponentUid = me === null ? null : live.players[me === 0 ? 1 : 0];
  const Board = ONLINE_BOARDS[live.gameId];

  let status: { text: string; hint?: string; mine: boolean } | null = null;
  if (!decided && turn !== null) {
    const mine = me !== null && turn === me;
    const hintKey = TURN_HINT[live.gameId];
    status = mine
      ? {
          text: t("expenses.onlineYourTurn"),
          hint: hintKey ? t(hintKey) : undefined,
          mine,
        }
      : {
          text:
            me === null
              ? t("expenses.onlineTheirTurn", { name: names[turn] })
              : t("expenses.onlineWaitingForMove", { name: names[turn] }),
          mine,
        };
  }

  const dotsTotals = state.gameId === "dots" ? dotsScore(replayDots(state.lines).state) : null;
  const scores =
    state.gameId === "memory"
      ? ([0, 1] as const).map((i) => (
          <span key={i} style={{ color: colors[i] }}>
            {t("expenses.memoryScoreLabel", { name: names[i], count: state.scores[i] })}
          </span>
        ))
      : dotsTotals
        ? ([0, 1] as const).map((i) => (
            <span key={i} style={{ color: colors[i] }}>
              {t("expenses.dotsScoreLabel", { name: names[i], count: dotsTotals[i] })}
            </span>
          ))
        : null;

  const fates = matchFates(tournament.advance, match);
  const winnerUid = live.winnerUid;
  const loserUid = winnerUid ? live.players.find((uid) => uid !== winnerUid)! : null;

  return (
    <div className="flex flex-col gap-3">
      {header}

      {live.version === 0 && beforeFirstMove}

      {/* Who plays whom — you on the left, always. */}
      <div className="flex items-center justify-between gap-2 rounded-xl border p-3">
        {(me === null ? live.players : [live.players[me], opponentUid!]).map((uid, i) => {
          const seat = live.players.indexOf(uid);
          const active = !decided && turn === seat;
          return (
            <div
              key={uid}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2",
                i === 1 && "order-3 flex-row-reverse",
              )}
            >
              <span
                className="rounded-full transition-shadow duration-(--duration-fast)"
                // Whose move it is, in their own color — a ring, not a fill,
                // so the avatar's initial stays readable.
                style={
                  active
                    ? { boxShadow: `0 0 0 2px var(--background), 0 0 0 4px ${colorOf(uid)}` }
                    : undefined
                }
              >
                <GameAvatar name={nameOf(uid)} className="size-9 text-sm" />
              </span>
              <span className={cn("flex min-w-0 flex-col", i === 1 && "items-end text-right")}>
                <span className="truncate text-sm font-semibold">
                  {uid === currentUid ? t("expenses.tournamentYou") : nameOf(uid)}
                </span>
                {turn !== null && (
                  <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: colorOf(uid) }}
                    />
                    {seat === 0 ? t("expenses.onlineStarts") : t("expenses.onlineSecond")}
                  </span>
                )}
              </span>
            </div>
          );
        })}
        <span className="text-muted-foreground order-2 shrink-0 px-1 text-xs font-medium">vs</span>
      </div>

      {status && (
        <div
          role="status"
          aria-atomic="true"
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors duration-(--duration-fast)",
            status.mine ? "border-primary/40 bg-primary/5" : "bg-muted/40",
          )}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span
              className={cn(
                "font-heading text-base leading-tight font-medium",
                status.mine && "text-primary",
              )}
            >
              {status.text}
            </span>
            {status.hint && <span className="text-muted-foreground text-xs">{status.hint}</span>}
          </div>
          {scores ? (
            <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs font-medium">
              {scores}
            </div>
          ) : (
            !status.mine && (
              <Loader2 aria-hidden="true" className="text-muted-foreground size-4 animate-spin" />
            )
          )}
        </div>
      )}

      {live.lastDrawAt && live.attempt > 0 && freshAttempt(live.state) && !decided && (
        <DuelDrawNotice />
      )}

      {winnerUid && loserUid && (
        <div
          aria-live="polite"
          className={cn(
            "animate-rise flex flex-col items-center gap-2 rounded-xl border p-4 text-center",
            // Your own result in its fate color; a spectator's stays neutral.
            winnerUid === currentUid
              ? "border-success/30 bg-success/10"
              : loserUid === currentUid
                ? "border-destructive/30 bg-destructive/5"
                : "bg-muted/40",
          )}
        >
          <p className="font-heading text-lg font-medium">
            {winnerUid === currentUid
              ? t("expenses.onlineYouWon")
              : t("expenses.tournamentMatchWinner", { name: nameOf(winnerUid) })}
          </p>
          {live.finish?.reason === "forfeit" && (
            <p className="text-muted-foreground text-xs">
              {t("expenses.onlineForfeited", { name: nameOf(loserUid) })}
            </p>
          )}
          {live.finish?.reason === "falseStart" && (
            <p className="text-muted-foreground text-xs">
              {t("expenses.onlineFalseStart", { name: nameOf(loserUid) })}
            </p>
          )}
          <div className="flex flex-col items-center gap-1 text-sm">
            {(
              [
                [winnerUid, fates.win],
                [loserUid, fates.loss],
              ] as const
            ).map(([uid, fate]) => {
              const Icon = FATE_ICON[fate];
              return (
                <span key={uid} className="flex items-center gap-1.5">
                  <Icon aria-hidden="true" className={cn("size-4", FATE_TEXT_CLASS[fate])} />
                  {t(outcomeKeys[fate], { name: nameOf(uid) })}
                </span>
              );
            })}
          </div>
          <Button type="button" size="lg" className="mt-1 w-full" onClick={onDone}>
            {t("expenses.onlineContinue")}
          </Button>
        </div>
      )}

      <Board
        key={`${live.attempt}`}
        live={live}
        state={state}
        me={me}
        names={names}
        colors={colors}
        busy={busy}
        onMove={(move) => void sendMove(move)}
      />

      {moveError && (
        <p role="alert" className="text-destructive text-center text-sm">
          {moveError}
        </p>
      )}

      {!decided && (
        <MatchStakes advance={tournament.advance} match={match} className="justify-center" />
      )}

      <MatchChat groupId={groupId} members={members} currentUid={currentUid} />

      {me !== null && !decided && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive h-10 self-center"
            >
              <Flag aria-hidden="true" />
              {t("expenses.onlineForfeit")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("expenses.onlineForfeitConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("expenses.onlineForfeitConfirmBody", { name: nameOf(opponentUid!) })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("expenses.tournamentLeaveConfirmStay")}</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void sendMove({ kind: "forfeit" })}
              >
                {t("expenses.onlineForfeit")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
