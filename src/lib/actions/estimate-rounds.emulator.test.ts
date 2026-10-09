import { FieldValue } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelEstimateRound,
  closeEstimateStage,
  createEstimateRound,
  createLocalEstimateRound,
  submitEstimateGuess,
  submitLocalEstimateGuesses,
} from "@/lib/actions/estimate-rounds";
import { adminDb } from "@/lib/firebase/admin";
import { compareEstimateAuditToExpense, verifyEstimateAudit } from "@/lib/games/estimate-audit";
import { estimateBoundsFor } from "@/lib/games/estimate-bank/public";
import type { EstimateQuestion, EstimateSecrets } from "@/lib/games/estimate-bank/types";
import { ESTIMATE_LAST_CALL_MS } from "@/lib/games/estimate-input";
import type {
  ChatMessage,
  EstimateRound,
  EstimateSeen,
  EstimateStage,
  Expense,
  GameExpenseDraft,
} from "@/lib/types";
import { makeEstimateRow } from "@/test/estimate-bank-fixture";
import { placeholderMember, realMember, seedGroup } from "@/test/fixtures";
import { clearSentPushes, sentPushes } from "@/test/push-mock";
import { signInAs, signOut } from "@/test/session-mock";

// Schätzfragen against the Firestore emulator: the secrets subdocument, the
// stage machine (all-in, time-up, last call, Stechfrage chain, the lot), the
// booking that happens exactly once, and the one-phone submit. The bank is a
// small controlled one (truths the test knows), and the shuffle is switchable
// so a test can force "identity" / "reverse" where it needs a known draw.

const state = vi.hoisted(() => ({
  bank: [] as EstimateQuestion[],
  /** "reverse" flips lists of uids (the lot, the seating) but keeps the draw of questions in bank order. */
  shuffle: "identity" as "real" | "identity" | "reverse",
}));

vi.mock("@/lib/games/estimate-bank", () => ({
  get ESTIMATE_BANK() {
    return state.bank;
  },
  ESTIMATE_BANK_BY_ID: new Map(),
  RETIRED_IDS: [],
}));

vi.mock("@/lib/games/random", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/games/random")>();
  return {
    ...real,
    secureShuffle: <T>(items: T[]): T[] =>
      state.shuffle === "real"
        ? real.secureShuffle(items)
        : state.shuffle === "reverse" && items.every((item) => typeof item === "string")
          ? [...items].reverse()
          : [...items],
  };
});

const CELSIUS = { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" };

/** A ratio row in metres (class `m|ratio|quantity`). */
function ratio(id: string, value: string, extra: Partial<EstimateQuestion> = {}) {
  return makeEstimateRow({ id, value, ...extra });
}

/** An interval row in °C (class `°C|interval|quantity`, bounds 0..10 000). */
function interval(id: string, value: string, extra: Partial<EstimateQuestion> = {}) {
  return makeEstimateRow({
    id,
    category: "science",
    unit: CELSIUS,
    scale: "interval",
    value,
    ...extra,
  });
}

/**
 * Draw order with the identity shuffle: R100 (ratio, truth 100), then the
 * Stechfragen I10, I20, I30 (interval, truths 10, 20, 30).
 */
const DEFAULT_BANK = [
  ratio("est-geo-9101", "100"),
  interval("est-sci-9102", "10"),
  interval("est-sci-9103", "20"),
  interval("est-sci-9104", "30"),
];

const pizza: GameExpenseDraft = {
  description: "Pizza",
  amountMinor: 3600,
  currency: "EUR",
  date: "2026-10-03",
  category: null,
  emoji: "🍕",
  paidBy: { max: 3600 },
};

const roundRef = (id: string) => adminDb.doc(`groups/g1/estimateRounds/${id}`);
const secretsRef = (id: string, stage: number) =>
  roundRef(id).collection("secrets").doc(String(stage));
const seenRef = () => adminDb.doc("groups/g1/estimateState/seen");
const readRound = async (id: string) => (await roundRef(id).get()).data() as EstimateRound;
const readSecrets = async (id: string, stage: number) =>
  (await secretsRef(id, stage).get()).data() as EstimateSecrets;
const readSeen = async () => (await seenRef().get()).data() as EstimateSeen;
const readGroup = async () => (await adminDb.doc("groups/g1").get()).data()!;
const messages = async () =>
  (await adminDb.collection("groups/g1/messages").get()).docs.map(
    (doc) => doc.data() as ChatMessage,
  );
const expenses = async () =>
  (await adminDb.collection("groups/g1/expenses").get()).docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Expense & { id: string },
  );
const roundCount = async () => (await adminDb.collection("groups/g1/estimateRounds").get()).size;

async function startOnline(
  opts: {
    pool?: string[];
    k?: number;
    includeFun?: boolean;
    window?: number;
    as?: string;
    autoBook?: GameExpenseDraft;
  } = {},
) {
  signInAs({ uid: opts.as ?? "max" });
  const result = await createEstimateRound({
    groupId: "g1",
    poolUids: opts.pool ?? ["max", "lea", "ben"],
    targetLoserCount: opts.k ?? 1,
    includeFun: opts.includeFun ?? false,
    answerWindowMs: opts.window ?? 300_000,
    autoBook: opts.autoBook ?? pizza,
  });
  if (!result.ok) throw new Error(result.error);
  return result.data.roundId;
}

/** `units` are in the question's unit; the action takes milli-units. */
async function guess(uid: string, roundId: string, units: number, stageIndex = 0) {
  signInAs({ uid });
  return submitEstimateGuess({
    groupId: "g1",
    roundId,
    stageIndex,
    guessMilli: Math.round(units * 1000),
  });
}

/** Everyone in `guesses` locks a guess, in object order; throws on the first failure. */
async function playStage(roundId: string, guesses: Record<string, number>, stageIndex = 0) {
  for (const [uid, units] of Object.entries(guesses)) {
    const result = await guess(uid, roundId, units, stageIndex);
    if (!result.ok) throw new Error(`${uid}: ${result.error}`);
  }
}

async function close(uid: string, roundId: string, stageIndex = 0) {
  signInAs({ uid });
  return closeEstimateStage({ groupId: "g1", roundId, stageIndex });
}

async function cancel(uid: string, roundId: string) {
  signInAs({ uid });
  return cancelEstimateRound({ groupId: "g1", roundId });
}

/** Rewrites fields of one stage straight in the database (time travel without fake timers). */
async function patchStage(roundId: string, index: number, patch: Partial<EstimateStage>) {
  const round = await readRound(roundId);
  const stages = round.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage));
  await roundRef(roundId).update({ stages });
}

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const STAGE_QUESTION_KEYS = ["bounds", "category", "format", "id", "scale", "text", "tone", "unit"];

beforeEach(async () => {
  state.bank = DEFAULT_BANK;
  state.shuffle = "identity";
  await seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
    kim: realMember("Kim"),
    tom: placeholderMember("Tom"),
  });
});

describe("createEstimateRound", () => {
  it("opens the question, keeps the truth in the secrets and asks the pool to play", async () => {
    const roundId = await startOnline();
    const round = await readRound(roundId);

    expect(round).toMatchObject({
      rulesVersion: 1,
      mode: "online",
      status: "running",
      createdBy: "max",
      targetLoserCount: 1,
      includeFun: false,
      answerWindowMs: 300_000,
      loserUids: null,
      resolvedBy: null,
      stake: { description: "Pizza", amountMinor: 3600, currency: "EUR" },
      expenseId: null,
      autoBookError: null,
    });
    expect(round.entrants).toEqual({
      max: { displayName: "Max", isPlaceholder: false },
      lea: { displayName: "Lea", isPlaceholder: false },
      ben: { displayName: "Ben", isPlaceholder: false },
    });
    expect(round.order).toEqual(["max", "lea", "ben"]);
    expect(round.stages).toHaveLength(1);
    const [stage] = round.stages;
    expect(stage).toMatchObject({
      index: 0,
      kind: "main",
      contenders: round.order,
      slots: 1,
      submitted: [],
      lastCallAt: null,
      status: "guessing",
      reveal: null,
    });
    expect(Date.parse(stage.closesAt!) - Date.parse(stage.openedAt)).toBe(300_000);

    // The full row, truth included, lives in the secrets document only.
    const secrets = await readSecrets(roundId, 0);
    expect(secrets.question).toMatchObject({ id: "est-geo-9101", value: "100" });
    expect(secrets.guesses).toEqual({});

    const seen = await readSeen();
    expect(seen.seenIds).toEqual(["est-geo-9101"]);
    expect(seen.recent.max).toHaveLength(1);
    expect((await readGroup()).activeEstimateRound).toEqual({ id: roundId });

    const [invite] = await messages();
    expect(invite.estimateInvite).toEqual({ roundId });
    expect(invite.text).toContain("Max lädt euch zu Schätzfragen ein");
    expect(invite.text).toContain("Pizza · 36,00");
    expect(invite.text).toContain("5 Minuten");
    expect(invite.text).toContain("Wer nicht tippt, zahlt zuerst");

    // The challenge goes to the pool, not to the creator, not to a placeholder.
    expect(sentPushes.filter((push) => push.event === "challenge").map((push) => push.uid)).toEqual(
      ["lea", "ben"],
    );
  });

  it("leaks no truth into any member-readable document", async () => {
    state.bank = [
      ratio("est-geo-9101", "100"),
      ratio("est-geo-9201", "7342", {
        tolerance: "3",
        definition: "Leaky definition marker zebra-quartz, never shown while guessing.",
        sources: [
          { label: "Zebra Source Label", url: "https://zebra.example.org/a", kind: "primary" },
          { label: "Quartz Reference", url: "https://quartz.example.com/b", kind: "secondary" },
        ],
        verified: { by: "Zed Verifier", on: "2026-02-03" },
        asOf: 2017,
        note: "marker-note-xylophone",
      }),
    ];
    const first = await startOnline();
    await cancel("max", first);
    const roundId = await startOnline();
    expect((await readSecrets(roundId, 0)).question.id).toBe("est-geo-9201");

    await playStage(roundId, { lea: 4242 });
    const everything = JSON.stringify([
      await readRound(roundId),
      await messages(),
      await readGroup(),
    ]);
    for (const needle of [
      "7342",
      "7342000",
      "zebra-quartz",
      "Zebra Source Label",
      "quartz.example.com",
      "Zed Verifier",
      "marker-note-xylophone",
      "4242000",
      '"value"',
      '"tolerance"',
      '"definition"',
      '"sources"',
      '"verified"',
      '"asOf"',
    ]) {
      expect(everything, needle).not.toContain(needle);
    }

    const [stage] = (await readRound(roundId)).stages;
    expect(Object.keys(stage.question).sort()).toEqual(STAGE_QUESTION_KEYS);
    // The visible range is the unit class's, the same for every row of the class.
    const firstRound = await readRound(first);
    expect(stage.question.bounds).toEqual(firstRound.stages[0].question.bounds);
    expect(stage.question.bounds).toEqual(estimateBoundsFor(state.bank[1]));
  });

  it.each([
    [{ poolUids: ["max"] }, "invalid-pool"],
    [{ poolUids: ["max", "max"] }, "invalid-pool"],
    [{ poolUids: ["max", "stranger"] }, "invalid-pool"],
    // A placeholder has no phone, and whoever guessed for it could steer the result.
    [{ poolUids: ["max", "lea", "tom"] }, "invalid-pool"],
    [{ poolUids: ["max", "constructor"] }, "invalid-pool"],
    [{ poolUids: ["max", "__proto__"] }, "invalid-pool"],
    [{ poolUids: ["max", "toString"] }, "invalid-pool"],
    [{ poolUids: ["max", "../lea"] }, "invalid-pool"],
    [{ poolUids: "max" }, "invalid-pool"],
    [{ targetLoserCount: 0 }, "invalid-count"],
    [{ targetLoserCount: 3 }, "invalid-count"],
    [{ targetLoserCount: 1.5 }, "invalid-count"],
    [{ answerWindowMs: 42 }, "invalid-window"],
    [{ answerWindowMs: 180_000 }, "invalid-window"],
    [{ includeFun: "yes" }, "invalid-input"],
    [{ autoBook: { ...pizza, paidBy: {}, payerIsWinner: true } }, "invalid-payer"],
    [{ autoBook: { ...pizza, paidBy: { max: 100 } } }, "invalid-payer"],
    [{ autoBook: { ...pizza, paidBy: { constructor: 3600 } } }, "forbidden"],
    [{ autoBook: { ...pizza, currency: "USD" } }, "invalid-currency"],
    [{ autoBook: { ...pizza, amountMinor: 0 } }, "invalid-amount"],
    [{ autoBook: null }, "invalid-payer"],
  ])("rejects %o", async (patch, error) => {
    signInAs({ uid: "max" });
    const result = await createEstimateRound({
      groupId: "g1",
      poolUids: ["max", "lea", "ben"],
      targetLoserCount: 1,
      includeFun: false,
      answerWindowMs: 300_000,
      autoBook: pizza,
      ...(patch as object),
    } as Parameters<typeof createEstimateRound>[0]);
    expect(result).toEqual({ ok: false, error });
    expect(await roundCount()).toBe(0);
  });

  it("answers unauthenticated and forbidden", async () => {
    const input = {
      groupId: "g1",
      poolUids: ["max", "lea"],
      targetLoserCount: 1,
      includeFun: false,
      answerWindowMs: 300_000,
      autoBook: pizza,
    };
    signOut();
    expect(await createEstimateRound(input)).toEqual({ ok: false, error: "unauthenticated" });
    signInAs({ uid: "stranger" });
    expect(await createEstimateRound(input)).toEqual({ ok: false, error: "forbidden" });
    signInAs({ uid: "max" });
    expect(await createEstimateRound({ ...input, groupId: "nope" })).toEqual({
      ok: false,
      error: "not-found",
    });
  });

  it("allows one online round per group, and recovers from a stale pointer", async () => {
    const roundId = await startOnline();
    signInAs({ uid: "lea" });
    expect(
      await createEstimateRound({
        groupId: "g1",
        poolUids: ["lea", "ben"],
        targetLoserCount: 1,
        includeFun: false,
        answerWindowMs: 300_000,
        autoBook: { ...pizza, paidBy: { lea: 3600 } },
      }),
    ).toEqual({ ok: false, error: "round-running" });

    // A pointer at a round that no longer exists is replaced, not wedged.
    await adminDb.doc("groups/g1").update({ activeEstimateRound: { id: "gone" } });
    const second = await startOnline();
    expect((await readGroup()).activeEstimateRound).toEqual({ id: second });

    // So is one at a finished round.
    await roundRef(second).update({ status: "finished" });
    const third = await startOnline();
    expect(third).not.toBe(second);
    expect((await readGroup()).activeEstimateRound).toEqual({ id: third });
    expect(roundId).not.toBe(third);
  });

  it("caps round creations per member as anti-spam, and nobody else", async () => {
    state.shuffle = "real";
    state.bank = Array.from({ length: 6 }, (_, i) => ratio(`est-geo-92${10 + i}`, `${200 + i}`));
    for (let i = 0; i < 12; i++) {
      const id = await startOnline();
      expect(await cancel("max", id)).toEqual({ ok: true, data: null });
    }
    signInAs({ uid: "max" });
    expect(
      await createEstimateRound({
        groupId: "g1",
        poolUids: ["max", "lea"],
        targetLoserCount: 1,
        includeFun: false,
        answerWindowMs: 300_000,
        autoBook: pizza,
      }),
    ).toEqual({ ok: false, error: "rate-limited" });
    // Another member is unaffected.
    await startOnline({
      as: "lea",
      pool: ["lea", "ben"],
      autoBook: { ...pizza, paidBy: { lea: 3600 } },
    });
  });

  it("never draws a fun row unless asked", async () => {
    state.shuffle = "real";
    state.bank = [
      ...Array.from({ length: 8 }, (_, i) => ratio(`est-geo-93${10 + i}`, `${300 + i}`)),
      ...Array.from({ length: 4 }, (_, i) =>
        ratio(`est-foo-94${10 + i}`, `${400 + i}`, { tone: "fun", category: "food" }),
      ),
    ];
    // Across several pool resets (the anti-spam log is cleared so 30 draws fit).
    for (let i = 0; i < 30; i++) {
      const id = await startOnline({ includeFun: false });
      expect((await readSecrets(id, 0)).question.tone).toBe("standard");
      await cancel("max", id);
      await seenRef().update({ recent: {} });
    }
    // Twelve draws without replacement cover all twelve rows, fun included.
    await seenRef().set({
      seenIds: [],
      resets: 0,
      recent: {},
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const tones = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const id = await startOnline({ includeFun: true });
      tones.add((await readSecrets(id, 0)).question.tone);
      await cancel("max", id);
      await seenRef().update({ recent: {} });
    }
    expect(tones).toEqual(new Set(["standard", "fun"]));
  });

  it("draws without replacement, then resets without repeating the last question", async () => {
    state.shuffle = "real";
    state.bank = Array.from({ length: 8 }, (_, i) => ratio(`est-geo-95${10 + i}`, `${500 + i}`));
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const id = await startOnline();
      ids.push((await readSecrets(id, 0)).question.id);
      await cancel("max", id);
    }
    expect(new Set(ids).size).toBe(8);
    expect((await readSeen()).resets).toBe(0);

    const ninth = await startOnline();
    expect((await readSeen()).resets).toBe(1);
    // The question played last must not come straight back after the reset.
    expect((await readSecrets(ninth, 0)).question.id).not.toBe(ids[7]);
  });

  it("answers bank-empty before any transaction", async () => {
    state.bank = [ratio("est-foo-9601", "10", { tone: "fun", category: "food" })];
    signInAs({ uid: "max" });
    const input = {
      groupId: "g1",
      poolUids: ["max", "lea", "ben"],
      targetLoserCount: 1,
      includeFun: false,
      answerWindowMs: 300_000,
      autoBook: pizza,
    };
    expect(await createEstimateRound(input)).toEqual({ ok: false, error: "bank-empty" });
    expect(await roundCount()).toBe(0);
    expect((await seenRef().get()).exists).toBe(false);
    expect((await readGroup()).activeEstimateRound).toBeUndefined();
    expect((await createEstimateRound({ ...input, includeFun: true })).ok).toBe(true);
  });
});

describe("submitEstimateGuess", () => {
  it("stores a guess in the secrets only", async () => {
    const roundId = await startOnline();
    const result = await guess("lea", roundId, 4242);
    expect(result).toEqual({ ok: true, data: { stageClosed: false } });

    const round = await readRound(roundId);
    expect(round.stages[0].submitted).toEqual(["lea"]);
    expect(JSON.stringify(round)).not.toContain("4242000");
    const secrets = await readSecrets(roundId, 0);
    expect(secrets.guesses.lea).toEqual({ milli: 4_242_000, at: expect.any(String), by: "lea" });
  });

  it("is for your own seat only", async () => {
    const roundId = await startOnline({ pool: ["lea", "ben", "kim"] });
    // The creator is not a contender here.
    expect(await guess("max", roundId, 100)).toEqual({ ok: false, error: "not-a-contender" });
    expect(await guess("tom", roundId, 100)).toEqual({ ok: false, error: "forbidden" });
    signInAs({ uid: "stranger" });
    expect(
      await submitEstimateGuess({ groupId: "g1", roundId, stageIndex: 0, guessMilli: 1000 }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("locks a guess: asking again changes nothing, not even with another value", async () => {
    const roundId = await startOnline();
    await guess("lea", roundId, 80);
    const before = await readRound(roundId);
    expect(await guess("lea", roundId, 80)).toEqual({ ok: true, data: { stageClosed: false } });
    expect(await guess("lea", roundId, 999)).toEqual({ ok: true, data: { stageClosed: false } });
    expect((await readRound(roundId)).updatedAt).toBe(before.updatedAt);
    expect((await readSecrets(roundId, 0)).guesses.lea.milli).toBe(80_000);
  });

  it("validates the guess, the stage and the clock", async () => {
    const roundId = await startOnline();
    expect(await guess("lea", roundId, 0)).toEqual({ ok: false, error: "guess-zero" });
    expect(await guess("lea", roundId, 10_000_001)).toEqual({
      ok: false,
      error: "guess-above-max",
    });
    for (const milli of [Number.NaN, 1.5, Infinity, "5" as unknown as number]) {
      signInAs({ uid: "lea" });
      expect(
        await submitEstimateGuess({ groupId: "g1", roundId, stageIndex: 0, guessMilli: milli }),
      ).toEqual({ ok: false, error: "guess-invalid" });
    }
    expect(await guess("lea", roundId, 5, 1)).toEqual({ ok: false, error: "stale-stage" });
    signInAs({ uid: "lea" });
    expect(
      await submitEstimateGuess({ groupId: "g1", roundId, stageIndex: -1, guessMilli: 5000 }),
    ).toEqual({ ok: false, error: "invalid-input" });
    expect(await guess("lea", "no-such-round", 5)).toEqual({ ok: false, error: "not-found" });

    // Past closesAt + grace the window is shut.
    await patchStage(roundId, 0, { closesAt: minutesAgo(10) });
    expect(await guess("lea", roundId, 80)).toEqual({ ok: false, error: "stage-closed" });
    expect((await readRound(roundId)).stages[0].submitted).toEqual([]);
  });

  it("checks the class range for rows with a lower bound and years", async () => {
    // `|ratio|quantity` counts from 1; a year takes whole years only.
    state.bank = [
      makeEstimateRow({
        id: "est-geo-9701",
        unit: { de: "Stück", en: "pieces", symbol: "" },
        value: "50",
      }),
    ];
    const counted = await startOnline();
    expect(await guess("lea", counted, 0.5)).toEqual({ ok: false, error: "guess-below-min" });
    await cancel("max", counted);

    state.bank = [
      makeEstimateRow({
        id: "est-his-9702",
        category: "history",
        unit: { de: "Jahr", en: "year", symbol: "" },
        scale: "interval",
        format: "year",
        value: "1927",
      }),
    ];
    const year = await startOnline();
    expect(await guess("lea", year, 1999.5)).toEqual({ ok: false, error: "guess-not-whole" });
    expect((await guess("lea", year, 1999)).ok).toBe(true);
  });

  it("reveals in the very transaction of the last guess, and books the bill", async () => {
    const roundId = await startOnline({
      pool: ["lea", "ben", "kim"],
      k: 2,
      autoBook: { ...pizza, amountMinor: 3601, paidBy: { max: 3601 } },
    });
    await playStage(roundId, { lea: 90, ben: 150 });
    expect((await readRound(roundId)).status).toBe("running");
    clearSentPushes();
    expect(await guess("kim", roundId, 99)).toEqual({ ok: true, data: { stageClosed: true } });

    const round = await readRound(roundId);
    const reveal = round.stages[0].reveal!;
    expect(round.status).toBe("finished");
    expect(round.stages[0].status).toBe("revealed");
    expect(reveal).toMatchObject({ reason: "all-in", truthMilli: 100_000, next: "decided" });
    expect(reveal.results.map((row) => row.uid)).toEqual(["ben", "lea", "kim"]);
    for (const row of reveal.results) {
      expect(row.enteredBy).toBeNull();
      expect(row.answeredAfterMs).toEqual(expect.any(Number));
    }
    // Furthest first: the odd cent lands on the furthest off.
    expect(reveal.payers).toEqual(["ben", "lea"]);
    expect(round.loserUids).toEqual(["ben", "lea"]);
    expect(round.resolvedBy).toBe("distance");
    expect(round.finishedAt).not.toBeNull();
    expect((await readGroup()).activeEstimateRound).toBeNull();

    const [expense] = await expenses();
    expect(await expenses()).toHaveLength(1);
    expect(round.expenseId).toBe(expense.id);
    expect(expense).toMatchObject({
      viaLottery: true,
      paidBy: { max: 3601 },
      splitMode: "exact",
      createdBy: "max",
      game: { gameId: "estimate", playerUids: round.order, attempt: 1 },
    });
    expect(Object.keys(expense.splits)).toEqual(["ben", "lea"]);
    expect(expense.splits.ben.amountMinor).toBe(1801);
    expect(expense.splits.lea.amountMinor).toBe(1800);

    const audit = expense.game!.estimate!;
    expect(verifyEstimateAudit(audit)).toBe(true);
    expect(compareEstimateAuditToExpense(audit, expense)).toEqual({
      payers: true,
      equalSplit: true,
      amountChanged: false,
    });

    const cards = (await messages()).filter((message) => message.gameResult);
    expect(cards).toHaveLength(1);
    expect(cards[0].gameResult).toMatchObject({
      gameId: "estimate",
      loserUids: ["ben", "lea"],
      roundId,
      amount: { description: "Pizza", amountMinor: 3601, currency: "EUR" },
    });
    expect(cards[0].gameResult!.estimate!.lines[0].truthMilli).toBe(100_000);

    // Everyone who answered watched it: only the payer who did not play hears of the expense.
    expect(sentPushes.filter((push) => push.event === "expense").map((push) => push.uid)).toEqual([
      "max",
    ]);
  });

  it("opens the Stechfrage in the same transaction as the last guess (reads before writes)", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 50, ben: 200 });
    expect(await guess("max", roundId, 100)).toEqual({ ok: true, data: { stageClosed: true } });
    const round = await readRound(roundId);
    expect(round.stages).toHaveLength(2);
    expect(round.stages[1].status).toBe("guessing");
    expect((await readSecrets(roundId, 1)).question.id).toBe("est-sci-9102");
    expect((await readSeen()).seenIds).toEqual(["est-geo-9101", "est-sci-9102"]);
  });

  it("treats a missing seen document like an empty one", async () => {
    const roundId = await startOnline();
    await seenRef().delete();
    await playStage(roundId, { lea: 50, ben: 200, max: 100 });
    expect((await readRound(roundId)).stages).toHaveLength(2);
    expect((await seenRef().get()).exists).toBe(true);
  });

  it("answers not-found when the secrets of the stage are missing", async () => {
    const roundId = await startOnline();
    await secretsRef(roundId, 0).delete();
    expect(await guess("lea", roundId, 5)).toEqual({ ok: false, error: "not-found" });
    expect((await readRound(roundId)).stages[0].submitted).toEqual([]);
  });

  it("books exactly once, however often it is asked again", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 90, ben: 150 });
    // Two phones lock the last guess at the same moment.
    const results = await Promise.all([guess("max", roundId, 99), guess("max", roundId, 99)]);
    expect(results.filter((result) => result.ok && result.data.stageClosed)).toHaveLength(1);
    expect(await expenses()).toHaveLength(1);

    expect(await close("lea", roundId)).toEqual({ ok: true, data: { closed: true } });
    expect(await guess("lea", roundId, 5)).toMatchObject({ ok: false });
    expect(await expenses()).toHaveLength(1);
    expect((await messages()).filter((message) => message.gameResult)).toHaveLength(1);
  });

  it("plays a Stechfrage for an exact tie, and only the tied players answer it", async () => {
    const roundId = await startOnline();
    clearSentPushes();
    // lea and ben are both a factor 2 off (100*100 == 200*50), max is exact.
    await playStage(roundId, { lea: 50, ben: 200, max: 100 });

    const round = await readRound(roundId);
    expect(round.status).toBe("running");
    const [main, stechen] = round.stages;
    expect(main.reveal).toMatchObject({
      next: "stechen",
      contested: ["lea", "ben"],
      slotsLeft: 1,
      payers: [],
      safe: ["max"],
      shuffled: null,
    });
    expect(main.reveal!.results.find((row) => row.uid === "max")!.fate).toBe("safe");
    expect(stechen).toMatchObject({
      index: 1,
      kind: "stechen",
      contenders: ["lea", "ben"],
      slots: 1,
      status: "guessing",
      submitted: [],
    });
    expect(stechen.question.id).not.toBe(main.question.id);
    expect(Date.parse(stechen.closesAt!)).toBeGreaterThan(Date.parse(main.closesAt!) - 1);
    expect(Object.keys(stechen.question).sort()).toEqual(STAGE_QUESTION_KEYS);
    expect((await readSecrets(roundId, 1)).question.id).toBe(stechen.question.id);
    expect(
      sentPushes
        .filter((push) => push.tag.startsWith("estimate-stechen"))
        .map((push) => push.uid)
        .sort(),
    ).toEqual(["ben", "lea"]);
    expect(await expenses()).toHaveLength(0);

    expect(await guess("max", roundId, 10, 1)).toEqual({ ok: false, error: "not-a-contender" });
    // I10 has truth 10: lea is 3 off, ben 4 off.
    await playStage(roundId, { lea: 7, ben: 14 }, 1);
    const done = await readRound(roundId);
    expect(done.status).toBe("finished");
    expect(done.resolvedBy).toBe("stechen");
    expect(done.loserUids).toEqual(["ben"]);
    expect(await expenses()).toHaveLength(1);
    expect((await expenses())[0].game!.estimate!.stages).toHaveLength(2);
  });

  it("treats the truth's band as a tie only where the band can flip the order (E10)", async () => {
    state.bank = [
      interval("est-sci-9801", "100", { tolerance: "15" }),
      interval("est-sci-9802", "10"),
    ];
    // Truth 100 ± 15: lea 50, ben 130, kim 125. ben is certainly further than kim, so kim is safe.
    const roundId = await startOnline({ pool: ["lea", "ben", "kim"] });
    await playStage(roundId, { lea: 50, ben: 130, kim: 125 });
    const [main, stechen] = (await readRound(roundId)).stages;
    const byUid = Object.fromEntries(main.reveal!.results.map((row) => [row.uid, row.fate]));
    expect(byUid).toEqual({ lea: "contested", ben: "contested", kim: "safe" });
    expect(main.reveal).toMatchObject({
      slotsLeft: 1,
      precedes: [],
      bandTie: true,
      next: "stechen",
    });
    expect(stechen.contenders).toEqual(["lea", "ben"]);
  });

  it("carries the strict facts of the band into the Stechfrage (E11)", async () => {
    state.bank = [
      interval("est-sci-9811", "100", { tolerance: "10" }),
      interval("est-sci-9812", "50"),
    ];
    const roundId = await startOnline({ pool: ["lea", "ben", "kim", "max"], k: 2 });
    // Truth 100 ± 10, k=2: lea 90, ben 110, kim 70, max 130. Nobody is certain; kim is certainly
    // further than lea, max certainly further than ben.
    await playStage(roundId, { lea: 90, ben: 110, kim: 70, max: 130 });
    const [main] = (await readRound(roundId)).stages;
    expect(main.reveal).toMatchObject({ slotsLeft: 2, next: "stechen", payers: [], safe: [] });
    expect(main.reveal!.precedes).toEqual(
      expect.arrayContaining([
        { further: "kim", closer: "lea" },
        { further: "max", closer: "ben" },
      ]),
    );
    // Truth 50: lea 40 off, ben 5, kim 2, max 8. Without the facts lea and max would pay;
    // with them kim is forced along with lea.
    await playStage(roundId, { lea: 90, ben: 55, kim: 52, max: 58 }, 1);
    const done = await readRound(roundId);
    expect(done.status).toBe("finished");
    expect(done.resolvedBy).toBe("stechen");
    expect(done.loserUids).toEqual(["lea", "kim"]);
    expect(verifyEstimateAudit((await expenses())[0].game!.estimate!)).toBe(true);
  });

  it("ends with the lot after three Stechfragen, and the audit still verifies", async () => {
    state.shuffle = "reverse";
    const roundId = await startOnline();
    await playStage(roundId, { lea: 50, ben: 200, max: 100 });
    await playStage(roundId, { lea: 7, ben: 13 }, 1); // truth 10: both 3 off
    await playStage(roundId, { lea: 17, ben: 23 }, 2); // truth 20
    expect((await readRound(roundId)).status).toBe("running");
    await playStage(roundId, { lea: 27, ben: 33 }, 3); // truth 30

    const round = await readRound(roundId);
    expect(round.stages).toHaveLength(4);
    expect(round.stages[3].reveal).toMatchObject({
      next: "shuffle",
      shuffled: ["ben", "lea"],
      lotPayers: ["ben"],
      slotsLeft: 1,
    });
    expect(round.status).toBe("finished");
    expect(round.resolvedBy).toBe("shuffle");
    expect(round.loserUids).toEqual(["ben"]);
    const all = await expenses();
    expect(all).toHaveLength(1);
    const audit = all[0].game!.estimate!;
    expect(audit.shuffled).toEqual(["ben", "lea"]);
    expect(verifyEstimateAudit(audit)).toBe(true);
  });

  it("resolves a contested stage by lot when the bank has no Stechfrage left", async () => {
    state.bank = [ratio("est-geo-9901", "100")];
    const roundId = await startOnline();
    await playStage(roundId, { lea: 50, ben: 200, max: 100 });
    const round = await readRound(roundId);
    expect(round.status).toBe("finished");
    expect(round.stages).toHaveLength(1);
    expect(round.stages[0].reveal!.next).toBe("shuffle");
    expect(round.resolvedBy).toBe("shuffle");
    expect(["lea", "ben"]).toContain(round.loserUids![0]);
    expect(await expenses()).toHaveLength(1);
  });

  it("does not book when a payer has left, and tells the creator", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { ben: 200 });
    // ben, the furthest off, leaves before the last guesses are in.
    await adminDb.doc("groups/g1").update({
      memberUids: FieldValue.arrayRemove("ben"),
      "members.ben": FieldValue.delete(),
    });
    clearSentPushes();
    await playStage(roundId, { lea: 90, max: 100 });

    const round = await readRound(roundId);
    expect(round.status).toBe("finished");
    expect(round.loserUids).toEqual(["ben"]);
    expect(round.autoBookError).toBe("member-left");
    expect(round.expenseId).toBeNull();
    expect(await expenses()).toHaveLength(0);
    const card = (await messages()).find((message) => message.gameResult)!;
    expect(card.gameResult!.amount).toBeNull();
    const notBooked = sentPushes.filter((push) => push.tag.startsWith("estimate-notbooked"));
    expect(notBooked.map((push) => push.uid)).toEqual(["max"]);
    expect((await readGroup()).activeEstimateRound).toBeNull();
  });
});

describe("closeEstimateStage and the last call", () => {
  it("lets nobody end the guessing early", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 90 });
    expect(await close("max", roundId)).toEqual({ ok: false, error: "time-not-up" });
    // Inside the grace period the window is still open.
    await patchStage(roundId, 0, { closesAt: new Date().toISOString() });
    expect(await close("max", roundId)).toEqual({ ok: false, error: "time-not-up" });
    expect((await readRound(roundId)).stages[0].status).toBe("guessing");
  });

  it("starts a last call first, then scores with absent players ranking furthest", async () => {
    const roundId = await startOnline({ pool: ["max", "lea", "ben", "kim"] });
    await playStage(roundId, { lea: 90 });
    await patchStage(roundId, 0, { closesAt: minutesAgo(10) });

    // A spectator-member may not close; an entrant may.
    expect(await close("tom", roundId)).toEqual({ ok: false, error: "forbidden" });
    await adminDb.doc("groups/g1").update({ "members.tom.role": "member" });
    clearSentPushes();
    expect(await close("lea", roundId)).toEqual({ ok: true, data: { closed: false } });

    let round = await readRound(roundId);
    expect(round.stages[0].status).toBe("guessing");
    expect(round.stages[0].reveal).toBeNull();
    expect(round.stages[0].lastCallAt).not.toBeNull();
    const closesIn = Date.parse(round.stages[0].closesAt!) - Date.now();
    expect(closesIn).toBeGreaterThan(ESTIMATE_LAST_CALL_MS - 20_000);
    expect(closesIn).toBeLessThanOrEqual(ESTIMATE_LAST_CALL_MS);
    expect(
      sentPushes
        .filter((push) => push.tag.startsWith("estimate-lastcall"))
        .map((push) => push.uid)
        .sort(),
    ).toEqual(["ben", "kim", "max"]);
    expect(await expenses()).toHaveLength(0);

    // The last call cannot be cut short either.
    expect(await close("lea", roundId)).toEqual({ ok: false, error: "time-not-up" });
    // An absentee can still answer inside the last call.
    expect((await guess("ben", roundId, 100)).ok).toBe(true);

    await patchStage(roundId, 0, { closesAt: minutesAgo(10) });
    expect(await close("lea", roundId)).toEqual({ ok: true, data: { closed: true } });
    round = await readRound(roundId);
    const reveal = round.stages[0].reveal!;
    expect(reveal.reason).toBe("time-up");
    // k=1, two absent (max, kim) with nothing to separate them: no Stechfrage for people who never answered.
    expect(reveal.next).toBe("shuffle");
    expect(
      reveal.results
        .filter((row) => row.guessMilli === null)
        .map((row) => row.uid)
        .sort(),
    ).toEqual(["kim", "max"]);
    expect(round.status).toBe("finished");
    expect(round.stages).toHaveLength(1);
    expect(["max", "kim"]).toContain(round.loserUids![0]);
    expect(await expenses()).toHaveLength(1);

    // Closing again is a no-op.
    expect(await close("lea", roundId)).toEqual({ ok: true, data: { closed: true } });
    expect(await expenses()).toHaveLength(1);
  });

  it("makes the one absent player pay, as the furthest off", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 90, ben: 120 });
    await patchStage(roundId, 0, { closesAt: minutesAgo(10) });
    expect(await close("max", roundId)).toEqual({ ok: true, data: { closed: false } });
    await patchStage(roundId, 0, { closesAt: minutesAgo(10) });
    expect(await close("max", roundId)).toEqual({ ok: true, data: { closed: true } });

    const round = await readRound(roundId);
    expect(round.stages[0].reveal!.next).toBe("decided");
    expect(round.loserUids).toEqual(["max"]);
    const row = round.stages[0].reveal!.results[0];
    expect(row).toMatchObject({ uid: "max", guessMilli: null, distance: null, fate: "pays" });
    expect(row.answeredAfterMs).toBeNull();
  });

  it("is idempotent for a stage that is already over, and refuses a stranger", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 50, ben: 200, max: 100 });
    // Stage 0 is revealed; stage 1 is open.
    expect(await close("lea", roundId, 0)).toEqual({ ok: true, data: { closed: true } });
    expect(await close("lea", roundId, 2)).toEqual({ ok: false, error: "stale-stage" });
    expect(await close("kim", roundId, 1)).toEqual({ ok: false, error: "forbidden" });
    signInAs({ uid: "stranger" });
    expect(await closeEstimateStage({ groupId: "g1", roundId, stageIndex: 0 })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("cancelEstimateRound", () => {
  it("lets the creator or a manager call it off before any guess, and clears the pointer", async () => {
    const roundId = await startOnline({
      as: "lea",
      pool: ["lea", "ben"],
      autoBook: { ...pizza, paidBy: { lea: 3600 } },
    });
    expect(await cancel("ben", roundId)).toEqual({ ok: false, error: "forbidden" });
    expect(await cancel("lea", roundId)).toEqual({ ok: true, data: null });
    const round = await readRound(roundId);
    expect(round).toMatchObject({ status: "cancelled", cancelledBy: "lea" });
    expect(round.cancelledAt).not.toBeNull();
    expect((await readGroup()).activeEstimateRound).toBeNull();
    // Twice is fine.
    expect(await cancel("lea", roundId)).toEqual({ ok: true, data: null });

    const again = await startOnline({
      as: "lea",
      pool: ["lea", "ben"],
      autoBook: { ...pizza, paidBy: { lea: 3600 } },
    });
    expect(await cancel("max", again)).toEqual({ ok: true, data: null }); // the owner
  });

  it("refuses after the first locked guess", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 90 });
    expect(await cancel("max", roundId)).toEqual({ ok: false, error: "guesses-submitted" });
    expect((await readRound(roundId)).status).toBe("running");
  });

  it("refuses a finished round", async () => {
    const roundId = await startOnline();
    await playStage(roundId, { lea: 90, ben: 150, max: 100 });
    expect(await cancel("max", roundId)).toEqual({ ok: false, error: "round-not-running" });
  });

  it("stops guessing in a cancelled round", async () => {
    const roundId = await startOnline();
    await cancel("max", roundId);
    expect(await guess("lea", roundId, 90)).toEqual({ ok: false, error: "round-not-running" });
  });
});

describe("one phone", () => {
  async function startLocal(
    pool = ["max", "lea", "tom"],
    k = 1,
    as = "max",
  ): Promise<{ roundId: string; stage: EstimateStage }> {
    signInAs({ uid: as });
    const result = await createLocalEstimateRound({
      groupId: "g1",
      poolUids: pool,
      targetLoserCount: k,
      includeFun: false,
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }

  async function submitLocal(
    roundId: string,
    guessesUnits: Record<string, number>,
    stageIndex = 0,
    as = "max",
  ) {
    signInAs({ uid: as });
    return submitLocalEstimateGuesses({
      groupId: "g1",
      roundId,
      stageIndex,
      guessesMilli: Object.fromEntries(
        Object.entries(guessesUnits).map(([uid, units]) => [uid, Math.round(units * 1000)]),
      ),
    });
  }

  it("creates a public round and answers it without the truth", async () => {
    const { roundId, stage } = await startLocal();
    const round = await readRound(roundId);
    expect(round).toMatchObject({
      mode: "local",
      status: "running",
      answerWindowMs: null,
      stake: null,
      autoBook: null,
      order: ["max", "lea", "tom"],
      createdBy: "max",
    });
    expect(round.entrants.tom).toEqual({ displayName: "Tom", isPlaceholder: true });
    expect(round.stages[0]).toMatchObject({ closesAt: null, lastCallAt: null, submitted: [] });
    expect(stage).toEqual(round.stages[0]);
    expect(Object.keys(stage.question).sort()).toEqual(STAGE_QUESTION_KEYS);
    expect(JSON.stringify({ stage, round })).not.toContain('"value"');

    expect((await readSecrets(roundId, 0)).question).toMatchObject({ value: "100" });
    // Nothing else happens: no pointer, no chat card, no push, no bill.
    expect((await readGroup()).activeEstimateRound).toBeUndefined();
    expect(await messages()).toEqual([]);
    expect(sentPushes).toEqual([]);
    expect(await expenses()).toEqual([]);
  });

  it("rejects bad pools and counts, and a stranger", async () => {
    signInAs({ uid: "max" });
    const base = {
      groupId: "g1",
      poolUids: ["max", "lea"],
      targetLoserCount: 1,
      includeFun: false,
    };
    expect(await createLocalEstimateRound({ ...base, poolUids: ["max"] })).toEqual({
      ok: false,
      error: "invalid-pool",
    });
    expect(await createLocalEstimateRound({ ...base, poolUids: ["max", "constructor"] })).toEqual({
      ok: false,
      error: "invalid-pool",
    });
    expect(await createLocalEstimateRound({ ...base, targetLoserCount: 2 })).toEqual({
      ok: false,
      error: "invalid-count",
    });
    expect(
      await createLocalEstimateRound({ ...base, includeFun: 1 as unknown as boolean }),
    ).toEqual({ ok: false, error: "invalid-input" });
    signInAs({ uid: "stranger" });
    expect(await createLocalEstimateRound(base)).toEqual({ ok: false, error: "forbidden" });
    expect(await roundCount()).toBe(0);
  });

  it("applies the anti-spam cap and deletes nothing", async () => {
    state.shuffle = "real";
    state.bank = Array.from({ length: 6 }, (_, i) => ratio(`est-geo-97${10 + i}`, `${100 + i}`));
    const first = await startLocal();
    for (let i = 0; i < 11; i++) await startLocal();
    signInAs({ uid: "max" });
    expect(
      await createLocalEstimateRound({
        groupId: "g1",
        poolUids: ["max", "lea"],
        targetLoserCount: 1,
        includeFun: false,
      }),
    ).toEqual({ ok: false, error: "rate-limited" });
    expect((await roundRef(first.roundId).get()).exists).toBe(true);
    expect(await roundCount()).toBe(12);
  });

  it("refuses a partial or padded submit without revealing anything", async () => {
    const { roundId } = await startLocal();
    expect(await submitLocal(roundId, { max: 100, lea: 50 })).toEqual({
      ok: false,
      error: "guesses-missing",
    });
    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 70, ben: 80 })).toEqual({
      ok: false,
      error: "guesses-unexpected",
    });
    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 0 })).toEqual({
      ok: false,
      error: "guess-zero",
    });
    const round = await readRound(roundId);
    expect(round.status).toBe("running");
    expect(round.stages[0]).toMatchObject({ status: "guessing", reveal: null });
    expect((await readSecrets(roundId, 0)).guesses).toEqual({});
  });

  it("refuses malformed payloads", async () => {
    const { roundId } = await startLocal();
    signInAs({ uid: "max" });
    const send = (guessesMilli: unknown) =>
      submitLocalEstimateGuesses({
        groupId: "g1",
        roundId,
        stageIndex: 0,
        guessesMilli: guessesMilli as Record<string, number>,
      });
    expect(await send(null)).toEqual({ ok: false, error: "invalid-input" });
    expect(await send([1, 2, 3])).toEqual({ ok: false, error: "invalid-input" });
    expect(
      await send(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, 1000]))),
    ).toEqual({ ok: false, error: "invalid-input" });
    expect(await send({ max: 1000, lea: 1000, tom: 1000, constructor: 1000 })).toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(await send(JSON.parse('{"max":1000,"lea":1000,"tom":1000,"__proto__":1000}'))).toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(await send({ max: 1000, lea: 1000, tom: 1.5 })).toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(await send({ max: 1000, lea: 1000, tom: "1000" })).toEqual({
      ok: false,
      error: "invalid-input",
    });
  });

  it("accepts the device owner only", async () => {
    const { roundId } = await startLocal();
    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 400 }, 0, "lea")).toEqual({
      ok: false,
      error: "not-creator",
    });
    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 400 }, 0, "stranger")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect((await readRound(roundId)).status).toBe("running");
  });

  it("reveals, names who typed what, and books nothing", async () => {
    const { roundId } = await startLocal();
    const result = await submitLocal(roundId, { max: 100, lea: 50, tom: 400 });
    if (!result.ok) throw new Error(result.error);
    const { round } = result.data;

    expect(round.status).toBe("finished");
    expect(round.loserUids).toEqual(["tom"]);
    expect(round.resolvedBy).toBe("distance");
    const reveal = round.stages[0].reveal!;
    expect(reveal).toMatchObject({ reason: "local", truthMilli: 100_000, next: "decided" });
    const entered = Object.fromEntries(reveal.results.map((row) => [row.uid, row.enteredBy]));
    expect(entered).toEqual({ max: null, lea: "max", tom: "max" });
    for (const row of reveal.results) expect(row.answeredAfterMs).toBeNull();
    expect([...round.stages[0].submitted].sort()).toEqual(["lea", "max", "tom"]);

    // The response is the stored public document (plus its id).
    expect(await readRound(roundId)).toEqual({ ...round, id: undefined });
    expect(await expenses()).toEqual([]);
    expect(await messages()).toEqual([]);
    expect((await readGroup()).activeEstimateRound).toBeUndefined();
    expect(sentPushes).toEqual([]);
  });

  it("answers a replay of the same payload with the same round, and refuses another", async () => {
    const { roundId } = await startLocal();
    const first = await submitLocal(roundId, { max: 100, lea: 50, tom: 400 });
    if (!first.ok) throw new Error(first.error);
    const before = await readRound(roundId);

    const replay = await submitLocal(roundId, { max: 100, lea: 50, tom: 400 });
    expect(replay).toEqual(first);
    expect((await readRound(roundId)).updatedAt).toBe(before.updatedAt);

    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 399 })).toEqual({
      ok: false,
      error: "stage-closed",
    });
  });

  it("plays a Stechfrage with the public question only, then finishes", async () => {
    const { roundId } = await startLocal();
    const first = await submitLocal(roundId, { max: 100, lea: 50, tom: 200 });
    if (!first.ok) throw new Error(first.error);
    expect(first.data.round.status).toBe("running");
    const stechen = first.data.round.stages[1];
    expect(stechen).toMatchObject({
      index: 1,
      kind: "stechen",
      status: "guessing",
      slots: 1,
      closesAt: null,
    });
    expect(stechen.contenders).toEqual(["lea", "tom"]);
    expect(Object.keys(stechen.question).sort()).toEqual(STAGE_QUESTION_KEYS);
    expect(stechen.reveal).toBeNull();
    // Only the contested players answer; max may not.
    expect(await submitLocal(roundId, { max: 10, lea: 7, tom: 14 }, 1)).toEqual({
      ok: false,
      error: "guesses-unexpected",
    });
    expect(await submitLocal(roundId, { lea: 7, tom: 14 }, 0)).toEqual({
      ok: false,
      error: "stage-closed",
    });

    const second = await submitLocal(roundId, { lea: 7, tom: 14 }, 1);
    if (!second.ok) throw new Error(second.error);
    expect(second.data.round.status).toBe("finished");
    expect(second.data.round.resolvedBy).toBe("stechen");
    expect(second.data.round.loserUids).toEqual(["tom"]);
    const rows = second.data.round.stages[1].reveal!.results;
    expect(rows.every((row) => row.enteredBy === "max")).toBe(true);
  });

  it("can be called off by its creator only", async () => {
    const { roundId } = await startLocal();
    expect(await cancel("lea", roundId)).toEqual({ ok: false, error: "not-creator" });
    expect(await cancel("max", roundId)).toEqual({ ok: true, data: null });
    expect((await readRound(roundId)).status).toBe("cancelled");
    expect(await submitLocal(roundId, { max: 100, lea: 50, tom: 400 })).toEqual({
      ok: false,
      error: "round-not-running",
    });
  });

  it("is not an online round: the online actions refuse it", async () => {
    const { roundId } = await startLocal();
    expect(await guess("lea", roundId, 5)).toEqual({ ok: false, error: "wrong-mode" });
    expect(await close("max", roundId)).toEqual({ ok: false, error: "wrong-mode" });
  });
});
