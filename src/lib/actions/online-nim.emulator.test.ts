import { beforeEach, describe, expect, it } from "vitest";
import { createTournament, openOnlineMatch, playOnlineMove } from "@/lib/actions/tournaments";
import { adminDb } from "@/lib/firebase/admin";
import type { OnlineMove } from "@/lib/games/online-match";
import { realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

// The online matchstick duel against the Firestore emulator: the two things
// that arrive over the wire beyond a plain take — the joker (skip a move,
// once per player) and the late take the fuse plays for a slow player — and
// that a joker really does decide who is stuck with the last match.

let tournamentId: string;
let matchId: string;
let players: [string, string];

const tournamentRef = () => adminDb.doc(`groups/g1/tournaments/${tournamentId}`);
const liveRef = () => tournamentRef().collection("liveMatches").doc(matchId);

const take = (row: number, count: number): OnlineMove => ({ kind: "take", row, count });
const late = (row: number, count: number): OnlineMove => ({ kind: "take", row, count, late: true });
const skip: OnlineMove = { kind: "skip" };

async function send(uid: string, move: OnlineMove) {
  signInAs({ uid });
  return playOnlineMove({ groupId: "g1", tournamentId, matchId, move });
}

/** Plays the moves in turn from `players[0]`, asserting each is accepted. */
async function playInTurn(moves: OnlineMove[]) {
  for (const [index, move] of moves.entries()) {
    const moved = await send(players[index % 2], move);
    if (!moved.ok) throw new Error(`move ${index} rejected: ${moved.error}`);
  }
}

const storedMoves = async () => (await liveRef().get()).get("state.moves") as number[];

beforeEach(async () => {
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
  });
  signInAs({ uid: "max" });
  const created = await createTournament({
    groupId: "g1",
    gameId: "nim",
    poolUids: ["max", "lea"],
    targetLoserCount: 1,
    stake: null,
    playMode: "online",
  });
  if (!created.ok) throw new Error(created.error);
  tournamentId = created.data.tournamentId;
  matchId = Object.keys((await tournamentRef().get()).get("matches"))[0];
  const opened = await openOnlineMatch({ groupId: "g1", tournamentId, matchId });
  if (!opened.ok) throw new Error(opened.error);
  players = (await liveRef().get()).get("players") as [string, string];
});

describe("online matchstick duel", () => {
  it("opens as an empty move list with player 0 to move", async () => {
    expect((await liveRef().get()).get("state")).toEqual({ gameId: "nim", moves: [] });
  });

  it("lets a joker pass the move on without taking anything, once per player", async () => {
    await playInTurn([skip]);
    expect(await storedMoves()).toEqual([100]);

    // It is player 1's move now: player 0 can't skip again, out of turn.
    expect(await send(players[0], skip)).toEqual({ ok: false, error: "not-your-turn" });

    // Player 1 has a joker of their own to answer with.
    expect((await send(players[1], skip)).ok).toBe(true);
    expect(await storedMoves()).toEqual([100, 100]);
  });

  it("refuses a second joker from the same player", async () => {
    // p0 skips, p1 takes a match; p0 is on the move again but has no joker left.
    await playInTurn([skip, take(3, 1)]);
    expect(await send(players[0], skip)).toEqual({ ok: false, error: "invalid-move" });
    expect(await storedMoves()).toEqual([100, 3 * 8 + 1]);
  });

  it("stores the fuse's late take apart from a hand-made one, and only as a single match", async () => {
    await playInTurn([late(3, 1)]);
    expect(await storedMoves()).toEqual([32 + 3 * 8 + 1]);

    expect(await send(players[1], late(3, 2))).toEqual({ ok: false, error: "invalid-move" });
    expect(await storedMoves()).toEqual([32 + 3 * 8 + 1]);
  });

  it("decides the match by the joker: whoever is left with the last match loses the bracket", async () => {
    await playInTurn([
      take(0, 1), // p0
      take(1, 3), // p1
      take(2, 5), // p0
      take(3, 6), // p1 leaves a single match — p0 would have to take it
      skip, // p0 spends the joker instead
      take(3, 1), // p1 is forced to take the last one
    ]);

    const live = await liveRef().get();
    expect(live.get("winnerUid")).toBe(players[0]);
    expect(live.get("finish")).toMatchObject({ reason: "win" });

    const tournament = (await tournamentRef().get()).data()!;
    expect(tournament.status).toBe("finished");
    expect(tournament.loserUids).toEqual([players[1]]);
  });

  it("refuses a bystander's joker", async () => {
    expect(await send("ben", skip)).toEqual({ ok: false, error: "not-a-player" });
    expect(await storedMoves()).toEqual([]);
  });
});
