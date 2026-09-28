/**
 * Pure move-by-move rules for an *online* duel match — two players on two
 * phones, one `liveMatches` doc between them. Every move goes through
 * `applyOnlineMove` inside `playOnlineMove`'s transaction (server-side), so a
 * modified client can't place a mark out of turn, peek at a memory card it
 * hasn't flipped, or claim a win the board doesn't show. The per-game rules
 * themselves are the exact same modules the one-phone boards use
 * (`tic-tac-toe.ts`, `connect-four.ts`, `memory-duel.ts`, `reaction-duel.ts`);
 * this file only adds turn order, replay-from-moves and validation on top.
 *
 * No `Date.now()` and no randomness in here — the one random input (the
 * reaction duel's signal delay, and the memory deck at creation) is passed
 * in, so the whole module stays deterministic and unit-testable.
 */
import {
  CF_COLUMNS,
  CF_ROWS,
  applyConnectFourMove,
  emptyConnectFourBoard,
  type ConnectFourBoard,
} from "@/lib/games/connect-four";
import { MEMORY_CARD_COUNT, MEMORY_PAIR_COUNT, memoryOutcome } from "@/lib/games/memory-duel";
import { REACTION_TIE_WINDOW_MS } from "@/lib/games/reaction-duel";
import {
  EMPTY_TIC_TAC_TOE_STATE,
  applyTicTacToeMove,
  ticTacToeCells,
  ticTacToeVariantForAttempt,
  type TicTacToeCell,
  type TicTacToeState,
} from "@/lib/games/tic-tac-toe";
import type {
  DuelGameId,
  LiveMatch,
  LiveMatchState,
  ReactionReport,
  Tournament,
  TournamentMatch,
} from "@/lib/types";

/** A phone that saw "Los!" but never got a tap in reports this — slower than any real reaction, so it loses unless the other side false-starts. */
export const REACTION_ONLINE_TIMEOUT_MS = 5000;

export type OnlineMove =
  | { kind: "cell"; index: number }
  | { kind: "column"; column: number }
  | { kind: "flip"; index: number }
  | { kind: "ready" }
  | { kind: "reaction"; report: ReactionReport }
  | { kind: "forfeit" };

/** Hidden server-side state no client may read — `liveSecrets/{matchId}`. Only the memory deck needs one. */
export interface LiveSecret {
  faces: string[];
}

export type OnlineOutcome =
  | { kind: "continue" }
  | { kind: "win"; player: 0 | 1; reason: "win" | "falseStart" | "forfeit" }
  | { kind: "draw" };

export type OnlineMoveError =
  "not-your-turn" | "invalid-move" | "wrong-game" | "match-finished" | "missing-secret";

/** An online match is one whose two players both have an account (a phone of their own) in an "online" tournament. */
export function isOnlineMatch(
  tournament: Pick<Tournament, "playMode" | "entrants">,
  match: Pick<TournamentMatch, "players">,
): boolean {
  if (tournament.playMode !== "online") return false;
  return match.players.every(
    (uid) => uid !== null && tournament.entrants[uid]?.isPlaceholder !== true,
  );
}

/** `deck` is the shuffled memory faces (`buildMemoryDeck().map(c => c.face)`) — required for memory, ignored otherwise. */
export function initialLiveState(
  gameId: DuelGameId,
  deck?: string[],
): { state: LiveMatchState; secret: LiveSecret | null } {
  switch (gameId) {
    case "tictactoe":
      return { state: { gameId, moves: [] }, secret: null };
    case "connectfour":
      return { state: { gameId, columns: [] }, secret: null };
    case "memory": {
      if (!deck || deck.length !== MEMORY_CARD_COUNT) {
        throw new Error("A memory match needs a full shuffled deck");
      }
      return {
        state: {
          gameId,
          claimedFaces: new Array(MEMORY_CARD_COUNT).fill(null),
          claimedBy: new Array(MEMORY_CARD_COUNT).fill(-1),
          open: [],
          scores: [0, 0],
          turn: 0,
        },
        secret: { faces: deck },
      };
    }
    case "reaction":
      return {
        state: { gameId, ready: [false, false], signalDelayMs: null, results: [null, null] },
        secret: null,
      };
  }
}

/** Tic-Tac-Toe rebuilt from its flat move list — players alternate, `players[0]` first. */
export function replayTicTacToe(
  moves: number[],
  attempt: number,
): {
  state: TicTacToeState;
  cells: TicTacToeCell[];
  turn: 0 | 1;
  winLine: readonly [number, number, number] | null;
} {
  const variant = ticTacToeVariantForAttempt(attempt);
  let state = EMPTY_TIC_TAC_TOE_STATE;
  let winLine: readonly [number, number, number] | null = null;
  moves.forEach((cell, i) => {
    const result = applyTicTacToeMove(state, (i % 2) as 0 | 1, cell, variant);
    state = result.state;
    if (result.winner) winLine = result.winner.line;
  });
  return { state, cells: ticTacToeCells(state), turn: (moves.length % 2) as 0 | 1, winLine };
}

/** Connect Four rebuilt from its flat column list — players alternate, `players[0]` first. */
export function replayConnectFour(columns: number[]): {
  board: ConnectFourBoard;
  turn: 0 | 1;
  lastDrop: { col: number; row: number } | null;
  winCells: [number, number][] | null;
} {
  let board = emptyConnectFourBoard();
  let lastDrop: { col: number; row: number } | null = null;
  let winCells: [number, number][] | null = null;
  columns.forEach((column, i) => {
    const result = applyConnectFourMove(board, column, (i % 2) as 0 | 1);
    board = result.board;
    lastDrop = { col: column, row: result.row };
    if (result.winner) winCells = result.winner.cells;
  });
  return { board, turn: (columns.length % 2) as 0 | 1, lastDrop, winCells };
}

/** Whose move it is, or `null` for the reaction duel, where both act at once. */
export function liveTurn(state: LiveMatchState): 0 | 1 | null {
  switch (state.gameId) {
    case "tictactoe":
      return (state.moves.length % 2) as 0 | 1;
    case "connectfour":
      return (state.columns.length % 2) as 0 | 1;
    case "memory":
      return state.turn;
    case "reaction":
      return null;
  }
}

/**
 * Applies one move by `player` (0 or 1 — an index into `LiveMatch.players`).
 * `drawSignalDelay` is only called when a reaction duel's second player
 * becomes ready. A `"draw"` outcome returns the final drawn position; the
 * caller replays with `nextAttempt`.
 */
export function applyOnlineMove(input: {
  live: Pick<LiveMatch, "state" | "attempt" | "winnerUid">;
  secret: LiveSecret | null;
  player: 0 | 1;
  move: OnlineMove;
  drawSignalDelay: () => number;
}): { state: LiveMatchState; outcome: OnlineOutcome } | { error: OnlineMoveError } {
  const { live, secret, player, move } = input;
  if (live.winnerUid !== null) return { error: "match-finished" };
  const state = live.state;
  const other: 0 | 1 = player === 0 ? 1 : 0;

  if (move.kind === "forfeit") {
    return { state, outcome: { kind: "win", player: other, reason: "forfeit" } };
  }

  switch (state.gameId) {
    case "tictactoe": {
      if (move.kind !== "cell") return { error: "wrong-game" };
      const replay = replayTicTacToe(state.moves, live.attempt);
      if (replay.turn !== player) return { error: "not-your-turn" };
      if (!Number.isInteger(move.index) || move.index < 0 || move.index > 8) {
        return { error: "invalid-move" };
      }
      if (replay.cells[move.index] !== null) return { error: "invalid-move" };
      const result = applyTicTacToeMove(
        replay.state,
        player,
        move.index,
        ticTacToeVariantForAttempt(live.attempt),
      );
      const next: LiveMatchState = { gameId: "tictactoe", moves: [...state.moves, move.index] };
      if (result.winner) {
        return {
          state: next,
          outcome: { kind: "win", player: result.winner.player, reason: "win" },
        };
      }
      return { state: next, outcome: result.draw ? { kind: "draw" } : { kind: "continue" } };
    }

    case "connectfour": {
      if (move.kind !== "column") return { error: "wrong-game" };
      const replay = replayConnectFour(state.columns);
      if (replay.turn !== player) return { error: "not-your-turn" };
      if (!Number.isInteger(move.column) || move.column < 0 || move.column >= CF_COLUMNS) {
        return { error: "invalid-move" };
      }
      if (replay.board[move.column].length >= CF_ROWS) return { error: "invalid-move" };
      const result = applyConnectFourMove(replay.board, move.column, player);
      const next: LiveMatchState = {
        gameId: "connectfour",
        columns: [...state.columns, move.column],
      };
      if (result.winner) {
        return {
          state: next,
          outcome: { kind: "win", player: result.winner.player, reason: "win" },
        };
      }
      return { state: next, outcome: result.draw ? { kind: "draw" } : { kind: "continue" } };
    }

    case "memory": {
      if (move.kind !== "flip") return { error: "wrong-game" };
      if (!secret) return { error: "missing-secret" };
      if (state.turn !== player) return { error: "not-your-turn" };
      const index = move.index;
      if (!Number.isInteger(index) || index < 0 || index >= MEMORY_CARD_COUNT) {
        return { error: "invalid-move" };
      }
      if (state.claimedBy[index] !== -1) return { error: "invalid-move" };
      // A shown mismatch stays face up until the next flip — which clears it.
      const open = state.open.length >= 2 ? [] : state.open;
      if (open.some((card) => card.index === index)) return { error: "invalid-move" };

      const nextOpen = [...open, { index, face: secret.faces[index] }];
      if (nextOpen.length < 2) {
        return { state: { ...state, open: nextOpen }, outcome: { kind: "continue" } };
      }

      const [first, second] = nextOpen;
      if (first.face !== second.face) {
        // Mismatch: both stay visible for the next player, whose turn it now is.
        return { state: { ...state, open: nextOpen, turn: other }, outcome: { kind: "continue" } };
      }

      const claimedFaces = [...state.claimedFaces];
      const claimedBy = [...state.claimedBy];
      for (const card of nextOpen) {
        claimedFaces[card.index] = card.face;
        claimedBy[card.index] = player;
      }
      const scores: [number, number] = [...state.scores];
      scores[player] += 1;
      const next: LiveMatchState = { ...state, claimedFaces, claimedBy, open: [], scores };
      const winner = memoryOutcome(scores, MEMORY_PAIR_COUNT);
      return {
        state: next,
        outcome:
          winner === null ? { kind: "continue" } : { kind: "win", player: winner, reason: "win" },
      };
    }

    case "reaction": {
      if (move.kind === "ready") {
        if (state.ready[player]) return { error: "invalid-move" };
        const ready: [boolean, boolean] = [...state.ready];
        ready[player] = true;
        const signalDelayMs =
          ready[0] && ready[1] && state.signalDelayMs === null
            ? input.drawSignalDelay()
            : state.signalDelayMs;
        return { state: { ...state, ready, signalDelayMs }, outcome: { kind: "continue" } };
      }
      if (move.kind !== "reaction") return { error: "wrong-game" };
      if (state.signalDelayMs === null) return { error: "invalid-move" };
      if (state.results[player] !== null) return { error: "invalid-move" };
      const report = move.report;
      if (
        report.kind === "time" &&
        (!Number.isInteger(report.ms) || report.ms < 0 || report.ms > REACTION_ONLINE_TIMEOUT_MS)
      ) {
        return { error: "invalid-move" };
      }

      const results: [ReactionReport | null, ReactionReport | null] = [...state.results];
      results[player] = report.kind === "time" ? { kind: "time", ms: report.ms } : report;
      const next: LiveMatchState = { ...state, results };

      // Transactions serialize reports, so a false start is judged the moment
      // it lands — whoever jumped first loses, whatever the other does after.
      if (report.kind === "falseStart") {
        return { state: next, outcome: { kind: "win", player: other, reason: "falseStart" } };
      }
      const theirs = results[other];
      if (theirs === null) return { state: next, outcome: { kind: "continue" } };
      if (theirs.kind === "falseStart") {
        // Unreachable in practice (their false start already ended it) — kept total.
        return { state: next, outcome: { kind: "win", player, reason: "falseStart" } };
      }
      const gap = Math.abs(report.ms - theirs.ms);
      if (gap <= REACTION_TIE_WINDOW_MS) return { state: next, outcome: { kind: "draw" } };
      return {
        state: next,
        outcome: { kind: "win", player: report.ms < theirs.ms ? player : other, reason: "win" },
      };
    }
  }
}

/** A draw replays the match from scratch with the players swapped — whoever went second starts this time, same as the ladder. */
export function nextAttempt(
  live: Pick<LiveMatch, "players" | "attempt" | "gameId">,
  deck?: string[],
): Pick<LiveMatch, "players" | "attempt" | "state"> & { secret: LiveSecret | null } {
  const { state, secret } = initialLiveState(live.gameId, deck);
  return {
    players: [live.players[1], live.players[0]],
    attempt: live.attempt + 1,
    state,
    secret,
  };
}
