import { describe, expect, it } from "vitest";
import {
  REACTION_ONLINE_TIMEOUT_MS,
  applyOnlineMove,
  initialLiveState,
  isOnlineMatch,
  liveTurn,
  nextAttempt,
  replayConnectFour,
  replayTicTacToe,
  type LiveSecret,
  type OnlineMove,
} from "./online-match";
import { MEMORY_CARD_COUNT } from "./memory-duel";
import type { LiveMatch, LiveMatchState } from "@/lib/types";

const noDelay = () => 2000;

function live(
  state: LiveMatchState,
  attempt = 0,
): Pick<LiveMatch, "state" | "attempt" | "winnerUid"> {
  return { state, attempt, winnerUid: null };
}

/** Plays moves alternating from player 0, asserting each is accepted; returns the last result. */
function playAll(
  state: LiveMatchState,
  moves: OnlineMove[],
  opts: { attempt?: number; secret?: LiveSecret | null; players?: (0 | 1)[] } = {},
) {
  let current = state;
  let last: ReturnType<typeof applyOnlineMove> | null = null;
  moves.forEach((move, i) => {
    const player = opts.players?.[i] ?? ((i % 2) as 0 | 1);
    last = applyOnlineMove({
      live: live(current, opts.attempt ?? 0),
      secret: opts.secret ?? null,
      player,
      move,
      drawSignalDelay: noDelay,
    });
    if ("error" in last) throw new Error(`move ${i} rejected: ${last.error}`);
    current = last.state;
  });
  return last!;
}

describe("isOnlineMatch", () => {
  const entrants = {
    a: { displayName: "A", isPlaceholder: false },
    b: { displayName: "B", isPlaceholder: false },
    p: { displayName: "P", isPlaceholder: true },
  };

  it("is online only in an online tournament with two real accounts", () => {
    expect(isOnlineMatch({ playMode: "online", entrants }, { players: ["a", "b"] })).toBe(true);
    expect(isOnlineMatch({ playMode: "local", entrants }, { players: ["a", "b"] })).toBe(false);
    expect(isOnlineMatch({ entrants }, { players: ["a", "b"] })).toBe(false);
  });

  it("falls back to local play when a placeholder (no phone of their own) is in the match", () => {
    expect(isOnlineMatch({ playMode: "online", entrants }, { players: ["a", "p"] })).toBe(false);
  });

  it("isn't online while a slot is still open", () => {
    expect(isOnlineMatch({ playMode: "online", entrants }, { players: ["a", null] })).toBe(false);
  });
});

describe("tic-tac-toe online", () => {
  const start = initialLiveState("tictactoe").state;

  it("rejects a move out of turn", () => {
    const result = applyOnlineMove({
      live: live(start),
      secret: null,
      player: 1,
      move: { kind: "cell", index: 0 },
      drawSignalDelay: noDelay,
    });
    expect(result).toEqual({ error: "not-your-turn" });
  });

  it("rejects a taken or out-of-range cell", () => {
    const after = playAll(start, [{ kind: "cell", index: 4 }]);
    if ("error" in after) throw new Error();
    for (const index of [4, -1, 9, 1.5]) {
      const result = applyOnlineMove({
        live: live(after.state),
        secret: null,
        player: 1,
        move: { kind: "cell", index },
        drawSignalDelay: noDelay,
      });
      expect(result).toEqual({ error: "invalid-move" });
    }
  });

  it("detects a win for the player who completes a line", () => {
    // 0 takes the top row, 1 plays the middle row.
    const result = playAll(
      start,
      [0, 3, 1, 4, 2].map((index) => ({ kind: "cell", index }) as const),
    );
    expect(result).toMatchObject({ outcome: { kind: "win", player: 0, reason: "win" } });
    if ("error" in result) throw new Error();
    expect(replayTicTacToe((result.state as { moves: number[] }).moves, 0).winLine).toEqual([
      0, 1, 2,
    ]);
  });

  it("reports a classic full-board draw", () => {
    const result = playAll(
      start,
      [0, 1, 2, 4, 3, 5, 7, 6, 8].map((index) => ({ kind: "cell", index }) as const),
    );
    expect(result).toMatchObject({ outcome: { kind: "draw" } });
  });

  it("uses vanishing rules from the sudden-death attempt on", () => {
    const moves = [0, 1, 2, 4, 3, 5, 7].map((index) => ({ kind: "cell", index }) as const);
    const result = playAll(start, moves, { attempt: 2 });
    if ("error" in result) throw new Error();
    // Player 0's 4th mark (7) removed their oldest (0).
    expect(replayTicTacToe((result.state as { moves: number[] }).moves, 2).cells[0]).toBeNull();
  });

  it("refuses moves after the match is decided", () => {
    const result = applyOnlineMove({
      live: { state: start, attempt: 0, winnerUid: "a" },
      secret: null,
      player: 0,
      move: { kind: "cell", index: 0 },
      drawSignalDelay: noDelay,
    });
    expect(result).toEqual({ error: "match-finished" });
  });
});

describe("connect four online", () => {
  const start = initialLiveState("connectfour").state;

  it("alternates turns and detects a vertical four", () => {
    const result = playAll(
      start,
      [0, 1, 0, 1, 0, 1, 0].map((column) => ({ kind: "column", column }) as const),
    );
    expect(result).toMatchObject({ outcome: { kind: "win", player: 0 } });
    if ("error" in result) throw new Error();
    const replay = replayConnectFour((result.state as { columns: number[] }).columns);
    expect(replay.winCells).toHaveLength(4);
    expect(replay.lastDrop).toEqual({ col: 0, row: 3 });
  });

  it("rejects a full column and the wrong move kind", () => {
    const full = playAll(
      start,
      [0, 0, 0, 0, 0, 0].map((column) => ({ kind: "column", column }) as const),
    );
    if ("error" in full) throw new Error();
    expect(
      applyOnlineMove({
        live: live(full.state),
        secret: null,
        player: 0,
        move: { kind: "column", column: 0 },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "invalid-move" });
    expect(
      applyOnlineMove({
        live: live(start),
        secret: null,
        player: 0,
        move: { kind: "cell", index: 0 },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "wrong-game" });
  });
});

describe("memory online", () => {
  // Pairs laid out side by side: cards 2k and 2k+1 match.
  const deck = Array.from({ length: MEMORY_CARD_COUNT }, (_, i) => `f${Math.floor(i / 2)}`);
  const { state: start, secret } = initialLiveState("memory", deck);

  it("never puts a face in the public state before it's flipped", () => {
    expect(JSON.stringify(start)).not.toContain("f0");
    expect(secret?.faces).toEqual(deck);
  });

  it("a match claims the pair and keeps the turn", () => {
    const result = playAll(
      start,
      [
        { kind: "flip", index: 0 },
        { kind: "flip", index: 1 },
      ],
      { secret, players: [0, 0] },
    );
    if ("error" in result) throw new Error();
    const state = result.state as Extract<LiveMatchState, { gameId: "memory" }>;
    expect(state.scores).toEqual([1, 0]);
    expect(state.claimedFaces[0]).toBe("f0");
    expect(state.turn).toBe(0);
  });

  it("a mismatch stays visible, passes the turn, and clears on the next flip", () => {
    const mismatch = playAll(
      start,
      [
        { kind: "flip", index: 0 },
        { kind: "flip", index: 2 },
      ],
      { secret, players: [0, 0] },
    );
    if ("error" in mismatch) throw new Error();
    const shown = mismatch.state as Extract<LiveMatchState, { gameId: "memory" }>;
    expect(shown.open.map((c) => c.index)).toEqual([0, 2]);
    expect(shown.turn).toBe(1);
    expect(liveTurn(shown)).toBe(1);

    const next = applyOnlineMove({
      live: live(shown),
      secret,
      player: 1,
      move: { kind: "flip", index: 5 },
      drawSignalDelay: noDelay,
    });
    if ("error" in next) throw new Error();
    const after = next.state as Extract<LiveMatchState, { gameId: "memory" }>;
    expect(after.open.map((c) => c.index)).toEqual([5]);
  });

  it("rejects flipping the same card twice, a claimed card, or out of turn", () => {
    const one = playAll(start, [{ kind: "flip", index: 0 }], { secret, players: [0] });
    if ("error" in one) throw new Error();
    expect(
      applyOnlineMove({
        live: live(one.state),
        secret,
        player: 0,
        move: { kind: "flip", index: 0 },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "invalid-move" });
    expect(
      applyOnlineMove({
        live: live(one.state),
        secret,
        player: 1,
        move: { kind: "flip", index: 3 },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "not-your-turn" });
  });

  it("decides the match as soon as one player holds a majority of pairs", () => {
    const moves: OnlineMove[] = [];
    for (let pair = 0; pair < 5; pair++) {
      moves.push({ kind: "flip", index: pair * 2 }, { kind: "flip", index: pair * 2 + 1 });
    }
    const result = playAll(start, moves, { secret, players: moves.map(() => 0) });
    expect(result).toMatchObject({ outcome: { kind: "win", player: 0 } });
  });
});

describe("reaction online", () => {
  const start = initialLiveState("reaction").state;
  const readyBoth = playAll(start, [{ kind: "ready" }, { kind: "ready" }]);
  if ("error" in readyBoth) throw new Error();
  const armed = readyBoth.state;

  it("draws the signal delay only once both are ready", () => {
    const one = playAll(start, [{ kind: "ready" }]);
    if ("error" in one) throw new Error();
    expect((one.state as { signalDelayMs: number | null }).signalDelayMs).toBeNull();
    expect((armed as { signalDelayMs: number | null }).signalDelayMs).toBe(2000);
  });

  it("rejects a reaction before the signal is armed", () => {
    expect(
      applyOnlineMove({
        live: live(start),
        secret: null,
        player: 0,
        move: { kind: "reaction", report: { kind: "time", ms: 200 } },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "invalid-move" });
  });

  it("a false start loses immediately", () => {
    const result = applyOnlineMove({
      live: live(armed),
      secret: null,
      player: 1,
      move: { kind: "reaction", report: { kind: "falseStart" } },
      drawSignalDelay: noDelay,
    });
    expect(result).toMatchObject({ outcome: { kind: "win", player: 0, reason: "falseStart" } });
  });

  it("waits for both times, then the faster one wins", () => {
    const result = playAll(armed, [
      { kind: "reaction", report: { kind: "time", ms: 310 } },
      { kind: "reaction", report: { kind: "time", ms: 240 } },
    ]);
    expect(result).toMatchObject({ outcome: { kind: "win", player: 1, reason: "win" } });
  });

  it("calls near-identical times a draw", () => {
    const result = playAll(armed, [
      { kind: "reaction", report: { kind: "time", ms: 250 } },
      { kind: "reaction", report: { kind: "time", ms: 255 } },
    ]);
    expect(result).toMatchObject({ outcome: { kind: "draw" } });
  });

  it("rejects implausible times", () => {
    for (const ms of [-1, 12.5, REACTION_ONLINE_TIMEOUT_MS + 1]) {
      expect(
        applyOnlineMove({
          live: live(armed),
          secret: null,
          player: 0,
          move: { kind: "reaction", report: { kind: "time", ms } },
          drawSignalDelay: noDelay,
        }),
      ).toEqual({ error: "invalid-move" });
    }
  });
});

describe("forfeit and replay", () => {
  it("forfeiting hands the win to the other player", () => {
    const result = applyOnlineMove({
      live: live(initialLiveState("connectfour").state),
      secret: null,
      player: 0,
      move: { kind: "forfeit" },
      drawSignalDelay: noDelay,
    });
    expect(result).toMatchObject({ outcome: { kind: "win", player: 1, reason: "forfeit" } });
  });

  it("nextAttempt swaps who starts and resets the board", () => {
    const next = nextAttempt({ players: ["a", "b"], attempt: 1, gameId: "tictactoe" });
    expect(next.players).toEqual(["b", "a"]);
    expect(next.attempt).toBe(2);
    expect(next.state).toEqual({ gameId: "tictactoe", moves: [] });
  });
});
