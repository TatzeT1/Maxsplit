import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEstimateRound,
  createLocalEstimateRound,
  submitEstimateGuess,
  submitLocalEstimateGuesses,
} from "@/lib/actions/estimate-rounds";
import { addExpense, editExpense, type ExpenseInput } from "@/lib/actions/expenses";
import { deleteGroup, joinGroupByInviteCode } from "@/lib/actions/groups";
import { adminDb } from "@/lib/firebase/admin";
import { compareEstimateAuditToExpense, verifyEstimateAudit } from "@/lib/games/estimate-audit";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import { splitEqual } from "@/lib/money/split";
import type { ChatMessage, EstimateRound, Expense } from "@/lib/types";
import { makeEstimateRow } from "@/test/estimate-bank-fixture";
import { placeholderMember, realMember, seedGroup } from "@/test/fixtures";
import { signInAs } from "@/test/session-mock";

// One-phone estimate rounds meet the expense form: a finished round is CLAIMED
// by the `addExpense` that books it (verified, optimistic), the audit survives
// `editExpense` only while the bill is still the equal split among the game's
// payers, and a claimed placeholder never raises a false alarm. Plus: deleting
// the group takes the round collections with it.

const state = vi.hoisted(() => ({ bank: [] as EstimateQuestion[] }));

vi.mock("@/lib/games/estimate-bank", () => ({
  get ESTIMATE_BANK() {
    return state.bank;
  },
  ESTIMATE_BANK_BY_ID: new Map(),
  RETIRED_IDS: [],
}));

// A fixed seating and draw order: the shuffle keeps the order it is given.
vi.mock("@/lib/games/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/games/random")>();
  return { ...real, secureShuffle: <T>(items: T[]): T[] => [...items] };
});

const roundRef = (id: string, groupId = "g1") =>
  adminDb.doc(`groups/${groupId}/estimateRounds/${id}`);
const readRound = async (id: string, groupId = "g1") =>
  (await roundRef(id, groupId).get()).data() as EstimateRound;
const readExpense = async (id: string) =>
  (await adminDb.doc(`groups/g1/expenses/${id}`).get()).data() as Expense;
const messages = async () =>
  (await adminDb.collection("groups/g1/messages").get()).docs.map(
    (doc) => doc.data() as ChatMessage,
  );

const AMOUNT = 3601;

interface FinishedRound {
  roundId: string;
  order: string[];
  loserUids: string[];
}

/** Plays a one-phone round to its end as `as` (the device owner). Truth 100 (ratio). */
async function finishedLocalRound(
  opts: {
    as?: string;
    groupId?: string;
    pool?: string[];
    k?: number;
    guesses?: Record<string, number>;
  } = {},
): Promise<FinishedRound> {
  const groupId = opts.groupId ?? "g1";
  signInAs({ uid: opts.as ?? "max" });
  const pool = opts.pool ?? ["max", "lea", "ben"];
  const created = await createLocalEstimateRound({
    groupId,
    poolUids: pool,
    targetLoserCount: opts.k ?? 2,
    includeFun: false,
  });
  if (!created.ok) throw new Error(created.error);
  const guesses = opts.guesses ?? { max: 100, lea: 90, ben: 150 };
  const submitted = await submitLocalEstimateGuesses({
    groupId,
    roundId: created.data.roundId,
    stageIndex: 0,
    guessesMilli: Object.fromEntries(
      Object.entries(guesses).map(([uid, units]) => [uid, units * 1000]),
    ),
  });
  if (!submitted.ok) throw new Error(submitted.error);
  const { round } = submitted.data;
  if (round.status !== "finished") throw new Error("the round is not finished");
  return { roundId: created.data.roundId, order: round.order, loserUids: round.loserUids! };
}

/** The expense the form builds for a game result: an exact split with `splitEqual`'s amounts. */
function bookingInput(round: FinishedRound, patch: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    groupId: "g1",
    description: "Pizza",
    amountMinor: AMOUNT,
    currency: "EUR",
    date: "2026-10-03",
    category: null,
    emoji: "🍕",
    paidBy: { max: AMOUNT },
    splitMode: "exact",
    participantUids: [],
    splitInputs: splitEqual(AMOUNT, round.loserUids),
    viaLottery: true,
    game: {
      gameId: "estimate",
      playerUids: round.order,
      attempt: 1,
      estimateRoundId: round.roundId,
    },
    ...patch,
  };
}

async function book(input: ExpenseInput, as = "max"): Promise<string> {
  signInAs({ uid: as });
  const result = await addExpense(input);
  if (!result.ok) throw new Error(result.error);
  return result.data.expenseId;
}

async function edit(expenseId: string, input: ExpenseInput, as = "max") {
  signInAs({ uid: as });
  return editExpense({ ...input, expenseId });
}

beforeEach(async () => {
  state.bank = [makeEstimateRow({ id: "est-geo-9101", value: "100" })];
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
    tom: placeholderMember("Tom"),
  });
});

describe("addExpense claiming a finished one-phone round", () => {
  it("stores the server's audit with the expense and claims the round", async () => {
    const round = await finishedLocalRound();
    expect(round.loserUids).toEqual(["ben", "lea"]);
    const before = await readRound(round.roundId);

    // A client-sent audit is dropped: the server writes its own.
    const forged = { ...bookingInput(round).game, estimate: { roundId: "forged" } };
    const expenseId = await book(bookingInput(round, { game: forged as ExpenseInput["game"] }));

    const expense = await readExpense(expenseId);
    expect(Object.keys(expense.game!).sort()).toEqual([
      "attempt",
      "estimate",
      "gameId",
      "playerUids",
    ]);
    const audit = expense.game!.estimate!;
    expect(audit).toMatchObject({
      roundId: round.roundId,
      mode: "local",
      createdBy: "max",
      resolvedBy: "distance",
      booked: { amountMinor: AMOUNT, currency: "EUR", loserUids: ["ben", "lea"] },
    });
    expect(verifyEstimateAudit(audit)).toBe(true);
    expect(compareEstimateAuditToExpense(audit, expense)).toEqual({
      payers: true,
      equalSplit: true,
      amountChanged: false,
    });
    // The round's id is never stored in the record.
    expect(JSON.stringify(expense.game)).not.toContain("estimateRoundId");

    const claimed = await readRound(round.roundId);
    expect(claimed.expenseId).toBe(expenseId);
    expect(claimed.updatedAt >= before.updatedAt).toBe(true);

    const card = (await messages()).find((message) => message.gameResult)!;
    expect(card.gameResult).toMatchObject({
      gameId: "estimate",
      loserUids: ["ben", "lea"],
      roundId: round.roundId,
    });
    expect(card.gameResult!.estimate!.lines[0].truthMilli).toBe(100_000);
  });

  const SOFT_FAILURES: [
    string,
    (round: FinishedRound) => Promise<{ input: ExpenseInput; as?: string; claimed?: boolean }>,
  ][] = [
    [
      "the payers differ from the round's",
      async (round) => ({
        input: bookingInput(round, { splitInputs: splitEqual(AMOUNT, ["ben", "max"]) }),
      }),
    ],
    [
      "the amounts are not the equal split (34,00 / 1,00 / 1,00 style)",
      async (round) => ({
        input: bookingInput(round, {
          amountMinor: 3600,
          paidBy: { max: 3600 },
          splitInputs: { ben: 3400, lea: 200 },
        }),
      }),
    ],
    [
      "the split mode is not exact",
      async (round) => ({
        input: bookingInput(round, {
          splitMode: "equal",
          participantUids: ["ben", "lea"],
          splitInputs: {},
        }),
      }),
    ],
    [
      "the round finished more than two hours ago",
      async (round) => {
        await roundRef(round.roundId).update({
          finishedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        });
        return { input: bookingInput(round) };
      },
    ],
    [
      "the round is not finished",
      async () => {
        signInAs({ uid: "max" });
        const created = await createLocalEstimateRound({
          groupId: "g1",
          poolUids: ["max", "lea", "ben"],
          targetLoserCount: 2,
          includeFun: false,
        });
        if (!created.ok) throw new Error(created.error);
        return {
          input: bookingInput({
            roundId: created.data.roundId,
            order: ["max", "lea", "ben"],
            loserUids: ["ben", "lea"],
          }),
        };
      },
    ],
    [
      "the round belongs to another creator",
      async () => {
        const others = await finishedLocalRound({ as: "lea" });
        return { input: bookingInput(others), as: "max" };
      },
    ],
    [
      "the round is in another group",
      async () => {
        await seedGroup("g2", {
          max: realMember("Max", { role: "owner" }),
          lea: realMember("Lea"),
          ben: realMember("Ben"),
        });
        const elsewhere = await finishedLocalRound({ groupId: "g2" });
        return { input: bookingInput(elsewhere) };
      },
    ],
    [
      "the round id is unknown",
      async (round) => ({
        input: bookingInput(round, {
          game: {
            gameId: "estimate",
            playerUids: round.order,
            attempt: 1,
            estimateRoundId: "no-such-round",
          },
        }),
      }),
    ],
  ];

  it.each(SOFT_FAILURES)(
    "books a plain record, with no audit and no claim, when %s",
    async (_name, setup) => {
      const round = await finishedLocalRound();
      const { input, as } = await setup(round);
      const expenseId = await book(input, as);

      const expense = await readExpense(expenseId);
      expect(expense.game).toBeDefined();
      expect(Object.keys(expense.game!).sort()).toEqual(["attempt", "gameId", "playerUids"]);
      expect(expense.viaLottery).toBe(true);
      expect((await readRound(round.roundId)).expenseId).toBeNull();
      // The chat card is still posted, as for any game result, but links to no round.
      const card = (await messages()).find((message) => message.gameResult)!;
      expect(card.gameResult!.estimate).toBeUndefined();
    },
  );

  it("does not let a second expense claim the same round", async () => {
    const round = await finishedLocalRound();
    const first = await book(bookingInput(round));
    const second = await book(bookingInput(round));
    expect(second).not.toBe(first);
    expect((await readExpense(second)).game!.estimate).toBeUndefined();
    expect((await readExpense(first)).game!.estimate).toBeDefined();
    expect((await readRound(round.roundId)).expenseId).toBe(first);
  });

  it("drops a client-sent audit when the claim fails", async () => {
    const round = await finishedLocalRound();
    const forged = { ...bookingInput(round).game, estimate: { roundId: "forged" } };
    const expenseId = await book(
      bookingInput(round, {
        splitInputs: splitEqual(AMOUNT, ["ben", "max"]),
        game: forged as ExpenseInput["game"],
      }),
    );
    expect((await readExpense(expenseId)).game).toEqual({
      gameId: "estimate",
      playerUids: round.order,
      attempt: 1,
    });
  });

  it("rejects a malformed round id", async () => {
    const round = await finishedLocalRound();
    signInAs({ uid: "max" });
    const result = await addExpense(
      bookingInput(round, {
        game: {
          gameId: "estimate",
          playerUids: round.order,
          attempt: 1,
          estimateRoundId: "../x",
        },
      }),
    );
    expect(result).toEqual({ ok: false, error: "invalid-game" });
  });
});

describe("editExpense on a claimed estimate expense", () => {
  async function claimed() {
    const round = await finishedLocalRound();
    const expenseId = await book(bookingInput(round));
    const audit = (await readExpense(expenseId)).game!.estimate!;
    return { round, expenseId, audit };
  }

  it("keeps the audit when only the description changes", async () => {
    const { round, expenseId, audit } = await claimed();
    const result = await edit(expenseId, bookingInput(round, { description: "Pizza Margherita" }));
    expect(result.ok).toBe(true);
    const expense = await readExpense(expenseId);
    expect(expense.description).toBe("Pizza Margherita");
    expect(expense.game!.estimate).toEqual(audit);
  });

  it("keeps it when a corrected amount is still the equal split", async () => {
    const { round, expenseId, audit } = await claimed();
    const input = bookingInput(round, {
      amountMinor: 4000,
      paidBy: { max: 4000 },
      splitInputs: splitEqual(4000, round.loserUids),
    });
    expect((await edit(expenseId, input)).ok).toBe(true);
    const expense = await readExpense(expenseId);
    expect(expense.game!.estimate).toEqual(audit);
    expect(compareEstimateAuditToExpense(audit, expense)).toEqual({
      payers: true,
      equalSplit: true,
      amountChanged: true,
    });
  });

  it("drops it when the split is changed by hand", async () => {
    const { round, expenseId } = await claimed();
    const handmade = bookingInput(round, {
      amountMinor: 3600,
      paidBy: { max: 3600 },
      splitInputs: { ben: 3400, lea: 200 },
    });
    expect((await edit(expenseId, handmade)).ok).toBe(true);
    const expense = await readExpense(expenseId);
    expect(expense.game).toEqual({ gameId: "estimate", playerUids: round.order, attempt: 1 });
  });

  it("drops it when the expense stops being a game result", async () => {
    const { round, expenseId } = await claimed();
    const manual = bookingInput(round, { viaLottery: false, game: null });
    expect((await edit(expenseId, manual)).ok).toBe(true);
    const expense = await readExpense(expenseId);
    expect(expense.viaLottery).toBe(false);
    expect(expense.game ?? null).toBeNull();
  });

  it("stores no round id, whatever the client sends", async () => {
    const { round, expenseId, audit } = await claimed();
    const sneaky = bookingInput(round, {
      game: {
        gameId: "estimate",
        playerUids: round.order,
        attempt: 1,
        estimateRoundId: "any-other-round",
      },
    });
    expect((await edit(expenseId, sneaky)).ok).toBe(true);
    const expense = await readExpense(expenseId);
    expect(JSON.stringify(expense.game)).not.toContain("any-other-round");
    expect(JSON.stringify(expense.game)).not.toContain("estimateRoundId");
    expect(expense.game!.estimate).toEqual(audit);
    // An unclaimed plain game edited with an id does not store it either.
    const plain = await finishedLocalRound();
    const plainId = await book(
      bookingInput(plain, { splitInputs: splitEqual(AMOUNT, ["ben", "max"]) }),
    );
    expect((await edit(plainId, sneaky)).ok).toBe(true);
    expect(JSON.stringify((await readExpense(plainId)).game)).not.toContain("estimateRoundId");
    expect((await readRound(plain.roundId)).expenseId).toBeNull();
  });
});

describe("a placeholder claimed after booking", () => {
  it("leaves the audit consistent and the expense verifiable", async () => {
    // Tom (a placeholder) guessed furthest off and pays.
    const round = await finishedLocalRound({
      pool: ["max", "lea", "tom"],
      k: 1,
      guesses: { max: 100, lea: 90, tom: 500 },
    });
    expect(round.loserUids).toEqual(["tom"]);
    const expenseId = await book(bookingInput(round, { splitInputs: { tom: AMOUNT } }));
    const stored = await readExpense(expenseId);
    expect(stored.game!.estimate!.booked.loserUids).toEqual(["tom"]);

    // A joining account claims Tom's placeholder: the ledger moves, the game record does not.
    signInAs({ uid: "newbie" });
    expect(
      await joinGroupByInviteCode({ inviteCode: "CODEG1", claimPlaceholderId: "tom" }),
    ).toEqual({
      ok: true,
      data: { groupId: "g1" },
    });
    const expense = await readExpense(expenseId);
    expect(Object.keys(expense.splits)).toEqual(["newbie"]);
    const audit = expense.game!.estimate!;
    expect(audit.booked.loserUids).toEqual(["tom"]);
    expect(audit.names.tom.placeholder).toBe(true);

    expect(verifyEstimateAudit(audit)).toBe(true);
    expect(compareEstimateAuditToExpense(audit, expense)).toEqual({
      payers: true,
      equalSplit: true,
      amountChanged: false,
    });
    // A forged real payer is still caught.
    const forgedSplits = { lea: expense.splits.newbie };
    expect(compareEstimateAuditToExpense(audit, { ...expense, splits: forgedSplits }).payers).toBe(
      false,
    );
  });
});

describe("deleting the group", () => {
  it("takes the round, its secrets and the seen-set with it", async () => {
    state.bank = [
      makeEstimateRow({ id: "est-geo-9101", value: "100" }),
      makeEstimateRow({ id: "est-geo-9102", value: "200" }),
    ];
    signInAs({ uid: "max" });
    const created = await createEstimateRound({
      groupId: "g1",
      poolUids: ["max", "lea", "ben"],
      targetLoserCount: 1,
      includeFun: false,
      answerWindowMs: 300_000,
      autoBook: {
        description: "Pizza",
        amountMinor: 3600,
        currency: "EUR",
        date: "2026-10-03",
        category: null,
        emoji: "🍕",
        paidBy: { max: 3600 },
      },
    });
    if (!created.ok) throw new Error(created.error);
    signInAs({ uid: "lea" });
    await submitEstimateGuess({
      groupId: "g1",
      roundId: created.data.roundId,
      stageIndex: 0,
      guessMilli: 90_000,
    });

    const groupRef = adminDb.doc("groups/g1");
    const names = async () => (await groupRef.listCollections()).map((collection) => collection.id);
    expect(await names()).toEqual(expect.arrayContaining(["estimateRounds", "estimateState"]));
    expect((await adminDb.collectionGroup("secrets").get()).size).toBe(1);

    signInAs({ uid: "max" });
    expect(await deleteGroup({ groupId: "g1" })).toEqual({ ok: true, data: null });
    expect((await groupRef.get()).exists).toBe(false);
    expect(await names()).toEqual([]);
    expect((await adminDb.collectionGroup("secrets").get()).size).toBe(0);
    expect((await adminDb.doc("groups/g1/estimateState/seen").get()).exists).toBe(false);
  });
});
