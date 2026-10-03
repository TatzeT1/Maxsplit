import { beforeEach, describe, expect, it } from "vitest";
import { createTournament, openOnlineMatch, playOnlineMove } from "@/lib/actions/tournaments";
import { adminDb } from "@/lib/firebase/admin";
import type { OnlineMove } from "@/lib/games/online-match";
import type { RpsHand } from "@/lib/games/rock-paper-scissors";
import { realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

// Online Schnick-Schnack-Schnuck against the Firestore emulator: the one online
// game whose hidden state changes during play. A locked-in hand has to live in
// `liveSecrets` (which no client can read) until both hands are in, and only
// then show up in the public `liveMatches` doc as a finished round.

let tournamentId: string;
let matchId: string;
let players: [string, string];

const tournamentRef = () => adminDb.doc(`groups/g1/tournaments/${tournamentId}`);
const liveRef = () => tournamentRef().collection("liveMatches").doc(matchId);
const secretRef = () => tournamentRef().collection("liveSecrets").doc(matchId);

async function pick(uid: string, hand: RpsHand) {
  signInAs({ uid });
  return playOnlineMove({ groupId: "g1", tournamentId, matchId, move: { kind: "pick", hand } });
}

/** Both players lock in a hand, `players[0]` first. */
async function playRound(first: RpsHand, second: RpsHand) {
  for (const [uid, hand] of [
    [players[0], first],
    [players[1], second],
  ] as const) {
    const moved = await pick(uid, hand);
    if (!moved.ok) throw new Error(moved.error);
  }
}

beforeEach(async () => {
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
  });
  signInAs({ uid: "max" });
  const created = await createTournament({
    groupId: "g1",
    gameId: "rps",
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

describe("online Schnick-Schnack-Schnuck", () => {
  it("opens with nothing locked in, and the picks start out empty in liveSecrets", async () => {
    expect((await liveRef().get()).get("state")).toEqual({
      gameId: "rps",
      rounds: [],
      locked: [false, false],
    });
    expect((await secretRef().get()).data()).toEqual({ picks: [null, null] });
  });

  it("keeps a locked-in hand in liveSecrets until the other is in, then reveals the round", async () => {
    expect((await pick(players[0], "rock")).ok).toBe(true);

    // Only "locked in" is public — the hand itself is not anywhere in the match doc.
    const half = await liveRef().get();
    expect(half.get("state")).toEqual({ gameId: "rps", rounds: [], locked: [true, false] });
    expect(JSON.stringify(half.data())).not.toContain("rock");
    expect((await secretRef().get()).data()).toEqual({ picks: ["rock", null] });

    // A pick is final: no changing your mind after seeing the other one lock in.
    expect(await pick(players[0], "paper")).toEqual({ ok: false, error: "invalid-move" });
    expect((await secretRef().get()).data()).toEqual({ picks: ["rock", null] });

    expect((await pick(players[1], "scissors")).ok).toBe(true);
    const revealed = await liveRef().get();
    expect(revealed.get("state")).toEqual({
      gameId: "rps",
      rounds: [{ p0: "rock", p1: "scissors" }],
      locked: [false, false],
    });
    expect(revealed.get("winnerUid")).toBeNull();
    expect((await secretRef().get()).data()).toEqual({ picks: [null, null] });
  });

  it("replays a drawn round inside the board; the first to two rounds wins the bracket", async () => {
    await playRound("rock", "rock");
    await playRound("rock", "scissors");
    await playRound("paper", "scissors");
    const undecided = await liveRef().get();
    expect(undecided.get("winnerUid")).toBeNull();
    expect(undecided.get("state.rounds")).toHaveLength(3);

    await playRound("rock", "scissors");
    const decided = await liveRef().get();
    expect(decided.get("winnerUid")).toBe(players[0]);
    expect(decided.get("finish")).toMatchObject({ reason: "win" });
    expect(decided.get("state.rounds")).toHaveLength(4);

    const tournament = (await tournamentRef().get()).data()!;
    expect(tournament.status).toBe("finished");
    expect(tournament.loserUids).toEqual([players[1]]);

    // The chat hears how it ended, next to the challenge that started it.
    const messages = (await adminDb.collection("groups/g1/messages").get()).docs.map((doc) =>
      doc.data(),
    );
    const result = messages.find((message) => message.gameResult);
    expect(result?.gameResult).toEqual({
      gameId: "rps",
      loserUids: [players[1]],
      winnerUid: players[0],
      amount: null,
      attempt: 1,
      tournamentId,
    });
    const names: Record<string, string> = { max: "Max", lea: "Lea" };
    expect(result?.text).toBe(`✊ ${names[players[0]]} gewinnt gegen ${names[players[1]]}`);

    // The match is over — nobody can pick any more.
    expect(await pick(players[1], "rock")).toEqual({ ok: false, error: "tournament-not-running" });
  });

  it("refuses a bystander and a hand that isn't rock, paper or scissors", async () => {
    expect(await pick("ben", "rock")).toEqual({ ok: false, error: "not-a-player" });

    signInAs({ uid: players[0] });
    const lizard = await playOnlineMove({
      groupId: "g1",
      tournamentId,
      matchId,
      move: { kind: "pick", hand: "lizard" } as unknown as OnlineMove,
    });
    expect(lizard).toEqual({ ok: false, error: "invalid-move" });
    expect((await secretRef().get()).data()).toEqual({ picks: [null, null] });
  });
});
