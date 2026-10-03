import { beforeEach, describe, expect, it } from "vitest";
import { createRematch, createTournament } from "@/lib/actions/tournaments";
import { adminDb } from "@/lib/firebase/admin";
import type { GameExpenseDraft, Tournament } from "@/lib/types";
import { realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";
import { clearSentPushes, sentPushes } from "@/test/push-mock";

// "Revanche" against the Firestore emulator: the same game for the same
// people, opened by the loser, started once however many players ask.

const tournaments = () => adminDb.collection("groups/g1/tournaments");

/** Starts an online duel Max vs. Lea and finishes it with Lea losing. */
async function finishedDuel(autoBook: GameExpenseDraft | null = null): Promise<string> {
  signInAs({ uid: "max" });
  const created = await createTournament({
    groupId: "g1",
    gameId: "rps",
    poolUids: ["max", "lea"],
    targetLoserCount: 1,
    stake: null,
    playMode: "online",
    autoBook,
  });
  if (!created.ok) throw new Error(created.error);
  await tournaments()
    .doc(created.data.tournamentId)
    .update({
      status: "finished",
      finishedAt: "2026-10-03T12:00:00.000Z",
      loserUids: ["lea"],
    });
  return created.data.tournamentId;
}

beforeEach(async () => {
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
  });
});

describe("createRematch", () => {
  it("starts the same duel again, with the loser moving first", async () => {
    const oldId = await finishedDuel();
    clearSentPushes();
    signInAs({ uid: "lea" });
    const result = await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" });
    if (!result.ok) throw new Error(result.error);

    const rematch = (await tournaments().doc(result.data.tournamentId).get()).data() as Tournament;
    expect(rematch.status).toBe("running");
    expect(rematch.gameId).toBe("rps");
    expect(rematch.playMode).toBe("online");
    expect(rematch.createdBy).toBe("lea");
    expect(Object.keys(rematch.entrants).sort()).toEqual(["lea", "max"]);
    expect(Object.values(rematch.matches)[0].players).toEqual(["lea", "max"]);
    expect((await tournaments().doc(oldId).get()).get("rematchId")).toBe(result.data.tournamentId);

    const invites = (await adminDb.collection("groups/g1/messages").get()).docs
      .map((doc) => doc.data())
      .filter((message) => message.gameInvite?.tournamentId === result.data.tournamentId);
    expect(invites).toHaveLength(1);
    expect(invites[0].text).toBe("Lea will Revanche bei Schnick-Schnack-Schnuck!");
    expect(sentPushes.filter((push) => push.event === "challenge").map((push) => push.uid)).toEqual(
      ["max"],
    );
  });

  it("joins the rematch already asked for instead of starting a second one", async () => {
    const oldId = await finishedDuel();
    signInAs({ uid: "lea" });
    const first = await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" });
    signInAs({ uid: "max" });
    const second = await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" });
    expect(second).toEqual(first);
    expect((await tournaments().where("status", "==", "running").get()).size).toBe(1);
  });

  it("plays for the same stake again, booked on the new day", async () => {
    const stake: GameExpenseDraft = {
      description: "Schnick-Schnack-Schnuck",
      amountMinor: 500,
      currency: "EUR",
      date: "2026-10-01",
      category: null,
      emoji: "✊",
      paidBy: {},
      payerIsWinner: true,
    };
    const oldId = await finishedDuel(stake);
    signInAs({ uid: "max" });
    const result = await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" });
    if (!result.ok) throw new Error(result.error);
    const rematch = (await tournaments().doc(result.data.tournamentId).get()).data() as Tournament;
    expect(rematch.autoBook).toEqual({ ...stake, date: "2026-10-03" });
  });

  it("refuses a game that booked a real bill", async () => {
    const oldId = await finishedDuel({
      description: "Pizza",
      amountMinor: 3000,
      currency: "EUR",
      date: "2026-10-01",
      category: null,
      emoji: null,
      paidBy: { max: 3000 },
    });
    signInAs({ uid: "lea" });
    expect(await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" })).toEqual(
      { ok: false, error: "rematch-unavailable" },
    );
  });

  it("refuses a bystander, and while another game runs", async () => {
    const oldId = await finishedDuel();
    signInAs({ uid: "ben" });
    expect(await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" })).toEqual(
      { ok: false, error: "not-a-player" },
    );

    signInAs({ uid: "ben" });
    const other = await createTournament({
      groupId: "g1",
      gameId: "nim",
      poolUids: ["ben", "max"],
      targetLoserCount: 1,
      stake: null,
      playMode: "online",
    });
    expect(other.ok).toBe(true);
    signInAs({ uid: "lea" });
    expect(await createRematch({ groupId: "g1", tournamentId: oldId, date: "2026-10-03" })).toEqual(
      { ok: false, error: "tournament-running" },
    );
  });
});
