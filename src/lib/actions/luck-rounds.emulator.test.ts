import { beforeEach, describe, expect, it } from "vitest";
import {
  cancelLuckRound,
  createLuckRound,
  revealRemainingCards,
  revealScratchCard,
} from "@/lib/actions/luck-rounds";
import { adminDb } from "@/lib/firebase/admin";
import type { Expense, GameExpenseDraft, LuckRound } from "@/lib/types";
import { placeholderMember, realMember, seedGroup } from "@/test/fixtures";
import { clearSentPushes, sentPushes } from "@/test/push-mock";
import { signInAs } from "@/test/session-mock";

// Online scratch cards against the Firestore emulator: everyone scratches
// their own card, each face drawn the moment it's scratched, and the bill
// books itself with the last card.

const pizza: GameExpenseDraft = {
  description: "Pizza",
  amountMinor: 3600,
  currency: "EUR",
  date: "2026-10-03",
  category: null,
  emoji: "🍕",
  paidBy: { max: 3600 },
};

const roundRef = (id: string) => adminDb.doc(`groups/g1/luckRounds/${id}`);
const readRound = async (id: string) => (await roundRef(id).get()).data() as LuckRound;
const readGroup = async () => (await adminDb.doc("groups/g1").get()).data()!;
const messages = async () =>
  (await adminDb.collection("groups/g1/messages").get()).docs.map((doc) => doc.data());

async function startRound(targetLoserCount = 1, poolUids = ["max", "lea", "ben"]) {
  signInAs({ uid: "max" });
  const result = await createLuckRound({
    groupId: "g1",
    gameId: "scratch",
    poolUids,
    targetLoserCount,
    autoBook: pizza,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.roundId;
}

async function scratch(uid: string, roundId: string, cardUid = uid) {
  signInAs({ uid });
  return revealScratchCard({ groupId: "g1", roundId, cardUid });
}

beforeEach(async () => {
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
    tom: placeholderMember("Tom"),
  });
});

describe("createLuckRound", () => {
  it("deals nothing, points the group at the round and invites the others", async () => {
    const roundId = await startRound();
    const round = await readRound(roundId);
    expect(round.status).toBe("running");
    expect(round.revealed).toEqual({});
    expect([...round.order].sort()).toEqual(["ben", "lea", "max"]);
    expect(round.stake).toEqual({ description: "Pizza", amountMinor: 3600, currency: "EUR" });
    expect((await readGroup()).activeLuckRound).toEqual({ id: roundId, gameId: "scratch" });

    const [invite] = await messages();
    expect(invite.luckInvite).toEqual({ roundId, gameId: "scratch" });
    expect(invite.text).toMatch(/^Max lädt euch zum Rubbellos ein — es geht um Pizza · 36,00/);
    expect(sentPushes.filter((push) => push.event === "challenge").map((push) => push.uid)).toEqual(
      ["lea", "ben"],
    );
  });

  it("allows one luck round per group at a time", async () => {
    await startRound();
    signInAs({ uid: "lea" });
    expect(
      await createLuckRound({
        groupId: "g1",
        gameId: "scratch",
        poolUids: ["lea", "ben"],
        targetLoserCount: 1,
        autoBook: { ...pizza, paidBy: { lea: 3600 } },
      }),
    ).toEqual({ ok: false, error: "round-running" });
  });

  it.each([
    [{ poolUids: ["max", "tom"] }, "invalid-pool"],
    [{ poolUids: ["max", "stranger"] }, "invalid-pool"],
    [{ targetLoserCount: 4 }, "invalid-count"],
    [{ targetLoserCount: 0 }, "invalid-count"],
    [{ gameId: "wheel" }, "invalid-game"],
    [{ autoBook: { ...pizza, paidBy: { max: 100 } } }, "invalid-payer"],
    [{ autoBook: { ...pizza, paidBy: {}, payerIsWinner: true } }, "invalid-payer"],
  ])("rejects %o", async (patch, error) => {
    signInAs({ uid: "max" });
    const result = await createLuckRound({
      groupId: "g1",
      gameId: "scratch",
      poolUids: ["max", "lea", "ben"],
      targetLoserCount: 1,
      autoBook: pizza,
      ...(patch as object),
    } as Parameters<typeof createLuckRound>[0]);
    expect(result).toEqual({ ok: false, error });
  });
});

describe("revealScratchCard", () => {
  it("draws a card once, and only for its owner", async () => {
    const roundId = await startRound();
    const first = await scratch("lea", roundId);
    if (!first.ok) throw new Error(first.error);
    // Asking again just repeats what the card said.
    expect(await scratch("lea", roundId)).toEqual(first);
    expect((await readRound(roundId)).revealedBy).toEqual({ lea: "lea" });

    expect(await scratch("lea", roundId, "ben")).toEqual({ ok: false, error: "not-your-card" });
  });

  it("books the bill with the last card and tells the chat", async () => {
    const roundId = await startRound(2);
    for (const uid of ["lea", "ben", "max"]) {
      const result = await scratch(uid, roundId);
      expect(result.ok).toBe(true);
    }

    const round = await readRound(roundId);
    expect(round.status).toBe("finished");
    expect(round.loserUids).toHaveLength(2);
    expect(Object.values(round.revealed).filter(Boolean)).toHaveLength(2);
    expect((await readGroup()).activeLuckRound).toBeNull();

    const expense = (
      await adminDb.doc(`groups/g1/expenses/${round.expenseId}`).get()
    ).data() as Expense;
    expect(expense.viaLottery).toBe(true);
    expect(expense.paidBy).toEqual({ max: 3600 });
    expect(Object.keys(expense.splits).sort()).toEqual([...round.loserUids!].sort());
    expect(expense.game).toEqual({ gameId: "scratch", playerUids: round.order, attempt: 1 });

    const result = (await messages()).find((message) => message.gameResult);
    expect(result?.gameResult).toMatchObject({
      gameId: "scratch",
      loserUids: round.loserUids,
      roundId,
      amount: { description: "Pizza", amountMinor: 3600, currency: "EUR" },
    });
    // Nobody can scratch on afterwards.
    clearSentPushes();
    expect((await scratch("lea", roundId)).ok).toBe(true);
    expect(sentPushes).toEqual([]);
  });

  it("lets the creator scratch a placeholder's card, nobody else", async () => {
    const roundId = await startRound(1, ["max", "lea", "tom"]);
    expect(await scratch("lea", roundId, "tom")).toEqual({ ok: false, error: "not-your-card" });
    expect((await scratch("max", roundId, "tom")).ok).toBe(true);
    expect((await readRound(roundId)).revealedBy).toEqual({ tom: "max" });
  });
});

describe("ending a round", () => {
  it("lets the creator scratch whatever is left, but not just anyone", async () => {
    const roundId = await startRound();
    await scratch("lea", roundId);
    signInAs({ uid: "ben" });
    expect(await revealRemainingCards({ groupId: "g1", roundId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    signInAs({ uid: "max" });
    expect(await revealRemainingCards({ groupId: "g1", roundId })).toEqual({
      ok: true,
      data: null,
    });
    const round = await readRound(roundId);
    expect(round.status).toBe("finished");
    expect(round.revealedBy).toEqual({ lea: "lea", max: "max", ben: "max" });
    expect(round.loserUids).toHaveLength(1);
  });

  it("can be called off only before anyone has scratched", async () => {
    const roundId = await startRound();
    await scratch("lea", roundId);
    signInAs({ uid: "max" });
    expect(await cancelLuckRound({ groupId: "g1", roundId })).toEqual({
      ok: false,
      error: "cards-scratched",
    });

    await roundRef(roundId).update({ revealed: {}, revealedBy: {} });
    expect(await cancelLuckRound({ groupId: "g1", roundId })).toEqual({ ok: true, data: null });
    expect((await readRound(roundId)).status).toBe("cancelled");
    expect((await readGroup()).activeLuckRound).toBeNull();
  });
});
