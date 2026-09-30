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
import { DOTS_LINE_COUNT, replayDots } from "./dots-and-boxes";
import { nimTotal, replayNim } from "./nim";
import type { RpsHand } from "./rock-paper-scissors";
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

describe("rock-paper-scissors online", () => {
  const { state: start, secret: startSecret } = initialLiveState("rps");

  function pick(
    state: LiveMatchState,
    secret: LiveSecret | null,
    player: 0 | 1,
    hand: RpsHand,
  ): ReturnType<typeof applyOnlineMove> {
    return applyOnlineMove({
      live: live(state),
      secret,
      player,
      move: { kind: "pick", hand },
      drawSignalDelay: noDelay,
    });
  }

  /** Plays each pair of hands as a full round, threading the secret through like the server does. */
  function playRounds(rounds: [RpsHand, RpsHand][]): {
    last: ReturnType<typeof applyOnlineMove>;
    state: LiveMatchState;
    secret: LiveSecret | null;
  } {
    let state = start;
    let secret: LiveSecret | null = startSecret;
    let last: ReturnType<typeof applyOnlineMove> | null = null;
    for (const [first, second] of rounds) {
      for (const [player, hand] of [
        [0, first],
        [1, second],
      ] as const) {
        last = pick(state, secret, player, hand);
        if ("error" in last) throw new Error(last.error);
        state = last.state;
        secret = last.secret ?? secret;
      }
    }
    return { last: last!, state, secret };
  }

  it("starts with nobody locked in and two empty picks in the secret", () => {
    expect(start).toEqual({ gameId: "rps", rounds: [], locked: [false, false] });
    expect(startSecret).toEqual({ picks: [null, null] });
  });

  it("has no turns — both players choose at once", () => {
    expect(liveTurn(start)).toBeNull();
  });

  it("locks a pick without putting the hand in the public state", () => {
    const result = pick(start, startSecret, 0, "rock");
    if ("error" in result) throw new Error(result.error);
    expect(result.state).toEqual({ gameId: "rps", rounds: [], locked: [true, false] });
    expect(JSON.stringify(result.state)).not.toContain("rock");
    expect(result.secret).toEqual({ picks: ["rock", null] });
    expect(result.outcome).toEqual({ kind: "continue" });
  });

  it("lets either player lock in first", () => {
    const result = pick(start, startSecret, 1, "paper");
    if ("error" in result) throw new Error(result.error);
    expect(result.state).toMatchObject({ locked: [false, true] });
    expect(result.secret).toEqual({ picks: [null, "paper"] });
  });

  it("refuses a second pick from the same player", () => {
    const first = pick(start, startSecret, 0, "rock");
    if ("error" in first) throw new Error(first.error);
    expect(pick(first.state, first.secret ?? null, 0, "paper")).toEqual({
      error: "invalid-move",
    });
  });

  it("reveals the round once both have picked, and starts the next one clean", () => {
    const { last, state } = playRounds([["rock", "scissors"]]);
    if ("error" in last) throw new Error(last.error);
    expect(state).toEqual({
      gameId: "rps",
      rounds: [{ p0: "rock", p1: "scissors" }],
      locked: [false, false],
    });
    expect(last.secret).toEqual({ picks: [null, null] });
    expect(last.outcome).toEqual({ kind: "continue" });
  });

  it("decides the match at two round wins", () => {
    const { last } = playRounds([
      ["rock", "scissors"],
      ["paper", "rock"],
    ]);
    expect(last).toMatchObject({ outcome: { kind: "win", player: 0, reason: "win" } });
  });

  it("lets the second player win too, after losing a round", () => {
    const { last } = playRounds([
      ["rock", "scissors"],
      ["rock", "paper"],
      ["scissors", "rock"],
    ]);
    expect(last).toMatchObject({ outcome: { kind: "win", player: 1 } });
  });

  it("plays a drawn round again instead of ending the match", () => {
    const { last, state } = playRounds([["paper", "paper"]]);
    expect(last).toMatchObject({ outcome: { kind: "continue" } });
    expect((state as { rounds: unknown[] }).rounds).toHaveLength(1);
  });

  it("rejects a hand that does not exist and the wrong kind of move", () => {
    expect(
      applyOnlineMove({
        live: live(start),
        secret: startSecret,
        player: 0,
        move: { kind: "pick", hand: "lizard" as RpsHand },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "invalid-move" });
    expect(
      applyOnlineMove({
        live: live(start),
        secret: startSecret,
        player: 0,
        move: { kind: "cell", index: 0 },
        drawSignalDelay: noDelay,
      }),
    ).toEqual({ error: "wrong-game" });
  });

  it("cannot be played without its secret", () => {
    expect(pick(start, null, 0, "rock")).toEqual({ error: "missing-secret" });
  });
});

describe("matchstick duel online", () => {
  const start = initialLiveState("nim").state;
  const take = (row: number, count: number): OnlineMove => ({ kind: "take", row, count });

  it("starts from 1·3·5·7 with player 0 to move", () => {
    expect(start).toEqual({ gameId: "nim", moves: [] });
    expect(liveTurn(start)).toBe(0);
  });

  it("alternates turns and removes the matches taken", () => {
    const result = playAll(start, [take(3, 4), take(1, 2)]);
    if ("error" in result) throw new Error(result.error);
    expect(result.outcome).toEqual({ kind: "continue" });
    const replay = replayNim((result.state as { moves: number[] }).moves);
    expect([...replay.rows]).toEqual([1, 1, 5, 3]);
    expect(replay.turn).toBe(0);
    expect(liveTurn(result.state)).toBe(0);
  });

  it("rejects a move out of turn, an empty take, an oversized take and a missing row", () => {
    const after = playAll(start, [take(0, 1)]);
    if ("error" in after) throw new Error(after.error);
    const attempt = (player: 0 | 1, move: OnlineMove) =>
      applyOnlineMove({
        live: live(after.state),
        secret: null,
        player,
        move,
        drawSignalDelay: noDelay,
      });
    expect(attempt(0, take(1, 1))).toEqual({ error: "not-your-turn" });
    expect(attempt(1, take(1, 0))).toEqual({ error: "invalid-move" });
    expect(attempt(1, take(1, 4))).toEqual({ error: "invalid-move" });
    expect(attempt(1, take(0, 1))).toEqual({ error: "invalid-move" }); // row 0 is empty now
    expect(attempt(1, take(9, 1))).toEqual({ error: "invalid-move" });
    expect(attempt(1, { kind: "cell", index: 0 })).toEqual({ error: "wrong-game" });
  });

  it("makes whoever takes the last match lose", () => {
    const result = playAll(start, [
      take(0, 1), // p0
      take(1, 3), // p1
      take(2, 5), // p0
      take(3, 6), // p1 leaves a single match
      take(3, 1), // p0 must take it
    ]);
    expect(result).toMatchObject({ outcome: { kind: "win", player: 1, reason: "win" } });
    if ("error" in result) throw new Error(result.error);
    expect(nimTotal(replayNim((result.state as { moves: number[] }).moves).rows)).toBe(0);
  });
});

describe("dots and boxes online", () => {
  const start = initialLiveState("dots").state;
  const line = (index: number): OnlineMove => ({ kind: "line", index });

  it("starts empty with player 0 to move", () => {
    expect(start).toEqual({ gameId: "dots", lines: [] });
    expect(liveTurn(start)).toBe(0);
  });

  it("passes the turn when no box is closed", () => {
    const result = playAll(start, [line(0)]);
    if ("error" in result) throw new Error(result.error);
    expect(liveTurn(result.state)).toBe(1);
  });

  it("keeps the turn with whoever closed a box", () => {
    // Box 0's sides are lines 0 (top), 3 (bottom), 12 (left), 13 (right).
    const result = playAll(start, [line(0), line(3), line(12), line(13)]);
    if ("error" in result) throw new Error(result.error);
    expect(result.outcome).toEqual({ kind: "continue" });
    expect(replayDots((result.state as { lines: number[] }).lines).state.boxes[0]).toBe(1);
    expect(liveTurn(result.state)).toBe(1);

    const again = applyOnlineMove({
      live: live(result.state),
      secret: null,
      player: 0,
      move: line(1),
      drawSignalDelay: noDelay,
    });
    expect(again).toEqual({ error: "not-your-turn" });
  });

  it("rejects a line that is already drawn, does not exist or is the wrong kind of move", () => {
    const after = playAll(start, [line(5)]);
    if ("error" in after) throw new Error(after.error);
    const attempt = (move: OnlineMove) =>
      applyOnlineMove({
        live: live(after.state),
        secret: null,
        player: 1,
        move,
        drawSignalDelay: noDelay,
      });
    expect(attempt(line(5))).toEqual({ error: "invalid-move" });
    expect(attempt(line(-1))).toEqual({ error: "invalid-move" });
    expect(attempt(line(DOTS_LINE_COUNT))).toEqual({ error: "invalid-move" });
    expect(attempt(line(1.5))).toEqual({ error: "invalid-move" });
    expect(attempt({ kind: "cell", index: 0 })).toEqual({ error: "wrong-game" });
  });

  it("ends with a winner once the last line is drawn — never a draw", () => {
    let state: LiveMatchState = start;
    let outcome: ReturnType<typeof applyOnlineMove> | null = null;
    for (let index = 0; index < DOTS_LINE_COUNT; index++) {
      const player = liveTurn(state);
      if (player === null) throw new Error("dots always has a turn");
      outcome = applyOnlineMove({
        live: live(state),
        secret: null,
        player,
        move: line(index),
        drawSignalDelay: noDelay,
      });
      if ("error" in outcome) throw new Error(outcome.error);
      state = outcome.state;
    }
    const replay = replayDots((state as { lines: number[] }).lines);
    expect(replay.finished).toBe(true);
    expect(outcome).toMatchObject({
      outcome: { kind: "win", player: replay.winner, reason: "win" },
    });
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
