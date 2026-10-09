// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ESTIMATE_MAX_MILLI, ESTIMATE_RULES_VERSION } from "@/lib/games/estimate-input";
import {
  buildEstimateAudit,
  buildEstimateChatSummary,
  compareEstimateAuditToExpense,
  replayEstimateAudit,
  verifyEstimateAudit,
} from "@/lib/games/estimate-audit";
import { resolveEstimateStage } from "@/lib/games/estimate-rules";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import { splitEqual } from "@/lib/money/split";
import type {
  EstimateAudit,
  EstimatePublicQuestion,
  EstimateRound,
  EstimateScale,
  EstimateStage,
  Expense,
} from "@/lib/types";
import { makeEstimateRow } from "@/test/estimate-bank-fixture";

// ---------------------------------------------------------------------------
// Helpers: real finished rounds, produced by the real state machine
// ---------------------------------------------------------------------------

/** Deterministic PRNG (mulberry32): no Math.random anywhere in these tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPENED = "2026-01-01T10:00:00.000Z";
const NOW = "2026-01-01T10:06:00.000Z";
const NAMES: Record<string, string> = {
  A: "Anna",
  B: "Ben",
  C: "Clara",
  D: "Dino",
  E: "Eva",
  F: "Finn",
};
const BOOKED = { amountMinor: 3000, currency: "EUR" } as const;
const reversed = <T>(items: T[]): T[] => [...items].reverse();

/** A row of `value` units; `tolerance` is the bank's decimal string (interval: units, ratio: percent). */
function rowOf(index: number, scale: EstimateScale, value: number, tolerance?: string) {
  return makeEstimateRow({
    id: `est-geo-${9001 + index}`,
    scale,
    value: String(value),
    ...(tolerance === undefined ? {} : { tolerance }),
  });
}

interface Plan {
  row: EstimateQuestion;
  /** Guesses in UNITS (null = none), keyed by contender. */
  guesses: Record<string, number | null>;
  /** Local rounds: who typed every guess of this stage (default: the player themself). */
  typedBy?: string;
}

interface PlayOptions {
  mode?: "local" | "online";
  entrants: string[];
  placeholders?: string[];
  createdBy?: string;
  k: number;
  /** Static plans (the last one is played with `stechenAvailable: false`) or a generator of the next stage. */
  plans: Plan[] | ((index: number, contenders: string[]) => Plan);
  shuffle?: <T>(items: T[]) => T[];
}

/** The public part of a row. Bounds are wide: the audit never looks at them (the unit-class table is the bank's business). */
function toPublicQuestion(row: EstimateQuestion): EstimatePublicQuestion {
  return {
    id: row.id,
    category: row.category,
    tone: row.tone,
    text: row.text,
    unit: row.unit,
    scale: row.scale,
    format: row.format,
    bounds: { minMilli: 0, maxMilli: ESTIMATE_MAX_MILLI },
  };
}

function guessingStage(
  row: EstimateQuestion,
  index: number,
  contenders: string[],
  slots: number,
): EstimateStage {
  return {
    index,
    kind: index === 0 ? "main" : "stechen",
    question: toPublicQuestion(row),
    contenders,
    slots,
    openedAt: OPENED,
    closesAt: null,
    lastCallAt: null,
    submitted: [],
    status: "guessing",
    reveal: null,
  };
}

function playRound(options: PlayOptions): EstimateRound {
  const mode = options.mode ?? "online";
  const order = options.entrants;
  const stages: EstimateStage[] = [];
  let contenders = [...order];
  let slots = options.k;
  let decided: { loserUids: string[]; resolvedBy: "distance" | "stechen" | "shuffle" } | null =
    null;

  for (let index = 0; decided === null; index += 1) {
    const plan =
      typeof options.plans === "function" ? options.plans(index, contenders) : options.plans[index];
    if (!plan) throw new Error(`no plan for stage ${index}: the round is not decided yet`);
    const stechenAvailable =
      typeof options.plans === "function" ? true : index < options.plans.length - 1;
    const guesses: Record<string, { milli: number; at: string; by: string }> = {};
    for (const [uid, units] of Object.entries(plan.guesses)) {
      if (units !== null) {
        guesses[uid] = {
          milli: units * 1000,
          at: "2026-01-01T10:00:04.000Z",
          by: plan.typedBy ?? uid,
        };
      }
    }
    const stage = guessingStage(plan.row, index, contenders, slots);
    const resolution = resolveEstimateStage({
      round: { order, stages, targetLoserCount: options.k, mode },
      stage,
      question: plan.row,
      guesses,
      now: NOW,
      reason: mode === "local" ? "local" : "all-in",
      stechenAvailable,
      shuffle: options.shuffle ?? reversed,
    });
    stages.push({
      ...stage,
      status: "revealed",
      submitted: mode === "online" ? Object.keys(guesses) : [],
      reveal: resolution.reveal,
    });
    if (resolution.stechen) {
      contenders = resolution.stechen.contenders;
      slots = resolution.stechen.slots;
    } else decided = resolution.decided;
  }
  if (typeof options.plans !== "function" && stages.length !== options.plans.length) {
    throw new Error(
      `the round was decided after ${stages.length} of ${options.plans.length} plans`,
    );
  }

  const placeholders = new Set(options.placeholders ?? []);
  return {
    id: "round-1",
    rulesVersion: ESTIMATE_RULES_VERSION,
    mode,
    status: "finished",
    createdBy: options.createdBy ?? order[0],
    createdAt: OPENED,
    updatedAt: NOW,
    finishedAt: NOW,
    cancelledAt: null,
    cancelledBy: null,
    entrants: Object.fromEntries(
      order.map((uid) => [
        uid,
        { displayName: NAMES[uid] ?? uid, isPlaceholder: placeholders.has(uid) },
      ]),
    ),
    order,
    targetLoserCount: options.k,
    includeFun: false,
    answerWindowMs: mode === "online" ? 300_000 : null,
    stages,
    loserUids: decided.loserUids,
    resolvedBy: decided.resolvedBy,
    stake: mode === "online" ? { description: "Pizza", ...BOOKED } : null,
    autoBook: null,
    expenseId: null,
    autoBookError: null,
  };
}

// --- the fixtures the spec names -------------------------------------------

/** Decided by distance: C is furthest off. */
function distanceRound(): EstimateRound {
  return playRound({
    entrants: ["A", "B", "C"],
    k: 1,
    plans: [{ row: rowOf(0, "interval", 100), guesses: { A: 90, B: 111, C: 140 } }],
  });
}

/** Two payers, decided by distance, one of the entrants a placeholder (a one-phone table). */
function placeholderRound(): EstimateRound {
  return playRound({
    mode: "local",
    entrants: ["A", "B", "C", "D"],
    placeholders: ["B"],
    createdBy: "A",
    k: 2,
    plans: [
      { row: rowOf(0, "interval", 100), guesses: { A: 100, B: 130, C: 70, D: 101 }, typedBy: "A" },
    ],
  });
}

/** E11: nothing certain in the main question, the Stechfrage must respect the inherited `precedes`. */
function stechenRound(): EstimateRound {
  return playRound({
    entrants: ["A", "B", "C", "D"],
    k: 2,
    plans: [
      { row: rowOf(0, "interval", 100, "10"), guesses: { A: 90, B: 110, C: 70, D: 130 } },
      { row: rowOf(1, "interval", 50), guesses: { A: 90, B: 55, C: 52, D: 58 } },
    ],
  });
}

/** n=2, k=1: a ratio tie, three tied Stechfragen, then the lot (reversed shuffle: B pays). */
function lotRound(): EstimateRound {
  return playRound({
    entrants: ["A", "B"],
    k: 1,
    plans: [
      { row: rowOf(0, "ratio", 100), guesses: { A: 50, B: 200 } },
      { row: rowOf(1, "interval", 10), guesses: { A: 7, B: 13 } },
      { row: rowOf(2, "interval", 10), guesses: { A: 8, B: 12 } },
      { row: rowOf(3, "interval", 10), guesses: { A: 9, B: 11 } },
    ],
  });
}

/** Both contested players never answered: the lot decides at once; the scorekeeper is no entrant. */
function absentRound(): EstimateRound {
  return playRound({
    entrants: ["A", "B", "C"],
    createdBy: "Z",
    k: 1,
    plans: [{ row: rowOf(0, "interval", 100), guesses: { A: 120, B: null, C: null } }],
  });
}

/** Lot after one Stechfrage, with `precedes` in the lot (C before A, D before B). */
function lotWithPrecedesRound(): EstimateRound {
  return playRound({
    entrants: ["A", "B", "C", "D"],
    k: 2,
    shuffle: (items) => [...items].sort().reverse(),
    plans: [
      { row: rowOf(0, "interval", 100, "10"), guesses: { A: 90, B: 110, C: 70, D: 130 } },
      // Everyone equally far from 50: the Stechfrage ties completely and the lot decides under the inherited facts.
      { row: rowOf(1, "interval", 50), guesses: { A: 40, B: 60, C: 40, D: 60 } },
    ],
  });
}

const FIXTURES: Record<string, () => EstimateRound> = {
  distance: distanceRound,
  placeholders: placeholderRound,
  stechen: stechenRound,
  lot: lotRound,
  absent: absentRound,
  lotWithPrecedes: lotWithPrecedesRound,
};

function auditOf(round: EstimateRound): EstimateAudit {
  const entrant = Object.hasOwn(round.entrants, round.createdBy);
  return buildEstimateAudit(round, BOOKED, {
    name: entrant ? NAMES[round.createdBy] : "Zoe",
    placeholder: false,
  });
}

/** What Firestore does to a document: JSON only, no `undefined`, no class instances. */
function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The expense the booking produces: the equal split among the payers in booking order. */
function expenseOf(
  audit: EstimateAudit,
  overrides: Partial<Pick<Expense, "amountMinor" | "currency">> = {},
): Pick<Expense, "amountMinor" | "currency" | "splits"> {
  const amountMinor = overrides.amountMinor ?? audit.booked.amountMinor;
  const shares = splitEqual(amountMinor, audit.booked.loserUids);
  return {
    amountMinor,
    currency: overrides.currency ?? audit.booked.currency,
    splits: Object.fromEntries(
      Object.entries(shares).map(([uid, amount]) => [
        uid,
        { rawValue: amount, amountMinor: amount },
      ]),
    ),
  };
}

function withSplits(
  expense: Pick<Expense, "amountMinor" | "currency" | "splits">,
  amounts: Record<string, number>,
): Pick<Expense, "amountMinor" | "currency" | "splits"> {
  return {
    ...expense,
    splits: Object.fromEntries(
      Object.entries(amounts).map(([uid, amount]) => [
        uid,
        { rawValue: amount, amountMinor: amount },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// The fixtures themselves (so a changed rule shows up here, not as a puzzling audit failure)
// ---------------------------------------------------------------------------

describe("fixtures", () => {
  it("play out as the spec's worked examples", () => {
    expect(distanceRound()).toMatchObject({ loserUids: ["C"], resolvedBy: "distance" });
    // B and C are both 30 off (an exact tie that fits the two slots): the smaller guess is ranked first.
    expect(placeholderRound().loserUids).toEqual(["C", "B"]);
    expect(placeholderRound().resolvedBy).toBe("distance");
    const stechen = stechenRound();
    expect(stechen.resolvedBy).toBe("stechen");
    expect(stechen.stages).toHaveLength(2);
    expect([...(stechen.loserUids ?? [])].sort()).toEqual(["A", "C"]);
    expect(stechen.stages[0].reveal?.precedes).toEqual(
      expect.arrayContaining([
        { further: "C", closer: "A" },
        { further: "D", closer: "B" },
      ]),
    );
    expect(lotRound()).toMatchObject({ loserUids: ["B"], resolvedBy: "shuffle" });
    expect(lotRound().stages).toHaveLength(4);
    expect(absentRound()).toMatchObject({ resolvedBy: "shuffle", stages: [expect.anything()] });
    expect(lotWithPrecedesRound().resolvedBy).toBe("shuffle");
  });
});

// ---------------------------------------------------------------------------
// buildEstimateAudit
// ---------------------------------------------------------------------------

describe("buildEstimateAudit", () => {
  it("holds exactly the inputs of the ranking and the booked money (online, by distance)", () => {
    const round = distanceRound();
    const audit = auditOf(round);
    const stage = round.stages[0];
    const question = stage.question;
    expect(audit).toEqual({
      rulesVersion: ESTIMATE_RULES_VERSION,
      roundId: "round-1",
      mode: "online",
      createdBy: "A",
      finishedAt: NOW,
      resolvedBy: "distance",
      names: {
        A: { name: "Anna", placeholder: false },
        B: { name: "Ben", placeholder: false },
        C: { name: "Clara", placeholder: false },
      },
      booked: { amountMinor: 3000, currency: "EUR", loserUids: ["C"] },
      stages: [
        {
          kind: "main",
          questionId: question.id,
          text: question.text,
          unit: question.unit,
          scale: "interval",
          format: "quantity",
          truthMilli: 100_000,
          tolerance: null,
          asOf: 2024,
          sourceLabel: "Fixture authority (fake)",
          sourceUrl: "https://example.org/fixture",
          definition: stage.reveal?.definition,
          reason: "all-in",
          guessesMilli: { A: 90_000, B: 111_000, C: 140_000 },
          enteredBy: {},
          slots: 1,
        },
      ],
      shuffled: null,
    });
  });

  it("is plain data: survives a JSON round trip unchanged (no undefined, no NaN)", () => {
    for (const make of Object.values(FIXTURES)) {
      const audit = auditOf(make());
      expect(wire(audit)).toStrictEqual(audit);
    }
  });

  it("does not alias the round (editing the audit never edits the round)", () => {
    const round = lotRound();
    const audit = auditOf(round);
    audit.booked.loserUids.push("X");
    audit.stages[0].unit.symbol = "changed";
    audit.stages[0].guessesMilli.A = 1;
    audit.shuffled?.reverse();
    expect(round.loserUids).toEqual(["B"]);
    expect(round.stages[0].question.unit.symbol).not.toBe("changed");
    expect(round.stages[0].reveal?.results.find((r) => r.uid === "A")?.guessMilli).toBe(50_000);
    expect(round.stages[3].reveal?.shuffled).toEqual(["B", "A"]);
  });

  it("copies tolerance, one stage per question and the Stechfragen's own truths", () => {
    const audit = auditOf(stechenRound());
    expect(audit.stages.map((s) => [s.kind, s.truthMilli, s.slots])).toEqual([
      ["main", 100_000, 2],
      ["stechen", 50_000, 2],
    ]);
    expect(audit.stages[0].tolerance).toEqual({ kind: "interval", milli: 10_000 });
    expect(audit.stages[1].tolerance).toBeNull();
    expect(audit.stages[0].questionId).not.toBe(audit.stages[1].questionId);
    expect(audit.resolvedBy).toBe("stechen");
  });

  it("records the lot: the order it produced, and `shuffled` only then", () => {
    const lot = auditOf(lotRound());
    expect(lot.shuffled).toEqual(["B", "A"]);
    expect(lot.resolvedBy).toBe("shuffle");
    expect(lot.stages).toHaveLength(4);
    expect(auditOf(distanceRound()).shuffled).toBeNull();
    expect(auditOf(stechenRound()).shuffled).toBeNull();
  });

  it("keeps a missing guess as null and an absent contender as a key", () => {
    const audit = auditOf(absentRound());
    expect(audit.stages[0].guessesMilli).toEqual({ A: 120_000, B: null, C: null });
    expect(audit.shuffled).toHaveLength(2);
    expect([...(audit.shuffled ?? [])].sort()).toEqual(["B", "C"]);
  });

  it("adds a creator who is no entrant (a scorekeeper) to `names`", () => {
    const audit = auditOf(absentRound());
    expect(audit.createdBy).toBe("Z");
    expect(audit.names.Z).toEqual({ name: "Zoe", placeholder: false });
    expect(Object.keys(audit.names).sort()).toEqual(["A", "B", "C", "Z"]);
    const placeholderCreator = buildEstimateAudit(absentRound(), BOOKED, {
      name: "Tom",
      placeholder: true,
    });
    expect(placeholderCreator.names.Z).toEqual({ name: "Tom", placeholder: true });
  });

  it("keeps the entrant snapshot of a creator who plays", () => {
    const audit = buildEstimateAudit(distanceRound(), BOOKED, {
      name: "Renamed since",
      placeholder: false,
    });
    expect(audit.names.A).toEqual({ name: "Anna", placeholder: false });
  });

  it("flags placeholders and says who typed which guess on a one-phone round", () => {
    const round = playRound({
      mode: "local",
      entrants: ["A", "B", "C"],
      placeholders: ["B", "C"],
      createdBy: "A",
      k: 1,
      plans: [
        {
          row: rowOf(0, "interval", 100),
          guesses: { A: 100, B: 130, C: 70 },
          typedBy: "A",
        },
      ],
    });
    const audit = auditOf(round);
    expect(audit.mode).toBe("local");
    expect(audit.names.B.placeholder).toBe(true);
    expect(audit.names.A.placeholder).toBe(false);
    // A typed their own guess; the others' were typed by A: only those are recorded.
    expect(audit.stages[0].enteredBy).toEqual({ B: "A", C: "A" });
    expect(audit.stages[0].reason).toBe("local");
  });

  it("books the money it is given (one phone: the claiming expense's amount)", () => {
    const audit = buildEstimateAudit(
      placeholderRound(),
      { amountMinor: 4711, currency: "CHF" },
      {
        name: "Anna",
        placeholder: false,
      },
    );
    expect(audit.booked).toEqual({ amountMinor: 4711, currency: "CHF", loserUids: ["C", "B"] });
  });

  it("refuses a round that is not finished, and an amount that is no integer", () => {
    const finished = distanceRound();
    const creator = { name: "Anna", placeholder: false };
    expect(() => buildEstimateAudit({ ...finished, status: "running" }, BOOKED, creator)).toThrow();
    expect(() => buildEstimateAudit({ ...finished, loserUids: null }, BOOKED, creator)).toThrow();
    expect(() => buildEstimateAudit({ ...finished, resolvedBy: null }, BOOKED, creator)).toThrow();
    expect(() => buildEstimateAudit({ ...finished, finishedAt: null }, BOOKED, creator)).toThrow();
    expect(() =>
      buildEstimateAudit({ ...finished, status: "cancelled" }, BOOKED, creator),
    ).toThrow();
    expect(() =>
      buildEstimateAudit(finished, { amountMinor: 30.5, currency: "EUR" }, creator),
    ).toThrow(RangeError);
    expect(() =>
      buildEstimateAudit(finished, { amountMinor: Number.NaN, currency: "EUR" }, creator),
    ).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// replayEstimateAudit / verifyEstimateAudit
// ---------------------------------------------------------------------------

describe("replayEstimateAudit", () => {
  it.each(Object.keys(FIXTURES))("equals round.loserUids for the %s fixture", (name) => {
    const round = FIXTURES[name]();
    const audit = auditOf(round);
    expect(replayEstimateAudit(audit)).toEqual(round.loserUids);
    // ... and still after the Firestore round trip.
    expect(replayEstimateAudit(wire(audit))).toEqual(round.loserUids);
    expect(verifyEstimateAudit(audit)).toBe(true);
    expect(verifyEstimateAudit(wire(audit))).toBe(true);
  });

  it("puts the payers in booking order: furthest first, stage by stage, the lot's picks last", () => {
    // A is 90 off, B 30 off, C 29 off, D 1 off; k=2 -> A, B in the main question.
    const round = playRound({
      entrants: ["A", "B", "C", "D"],
      k: 2,
      plans: [{ row: rowOf(0, "interval", 100), guesses: { A: 10, B: 130, C: 71, D: 101 } }],
    });
    expect(round.loserUids).toEqual(["A", "B"]);
    expect(replayEstimateAudit(auditOf(round))).toEqual(["A", "B"]);
    // The lot round pays the lot's pick, after the certain payers of earlier stages.
    const lot = lotWithPrecedesRound();
    expect(replayEstimateAudit(auditOf(lot))).toEqual(lot.loserUids);
    expect(lot.loserUids).toHaveLength(2);
  });

  it("carries `precedes` into the next stage (E11: without it the Stechfrage would pick A and D)", () => {
    const audit = auditOf(stechenRound());
    const payers = replayEstimateAudit(audit);
    expect(payers).not.toBeNull();
    expect([...(payers ?? [])].sort()).toEqual(["A", "C"]);
    // Without the inherited facts the ranking of the Stechfrage alone would pay A (40) and D (8).
    const alone = replayEstimateAudit({
      ...audit,
      stages: [{ ...audit.stages[1], kind: "main", slots: 2 }],
      booked: { ...audit.booked },
    });
    expect(alone).toBeNull(); // 4 players with 2 slots and nothing contested before: it is not even this round any more
  });

  it("respects the inherited facts in the lot", () => {
    const round = lotWithPrecedesRound();
    const lastReveal = round.stages[1].reveal;
    expect(lastReveal?.next).toBe("shuffle");
    // The lot walked the order of `shuffled` under the facts C -> A, D -> B: whatever it picked, the replay reproduces it.
    expect(replayEstimateAudit(auditOf(round))).toEqual(round.loserUids);
    const audit = auditOf(round);
    // A shuffle order that violates nothing the audit knows still replays; swapping the booked picks does not verify.
    const swapped: EstimateAudit = {
      ...audit,
      booked: { ...audit.booked, loserUids: [...audit.booked.loserUids].reverse() },
    };
    expect(verifyEstimateAudit(swapped)).toBe(false);
  });

  it("returns null, never throws, for an unknown rules version", () => {
    const audit = auditOf(distanceRound());
    for (const rulesVersion of [0, 2, 99, -1, 1.5, Number.NaN]) {
      expect(replayEstimateAudit({ ...audit, rulesVersion })).toBeNull();
      expect(verifyEstimateAudit({ ...audit, rulesVersion })).toBe(false);
    }
    // `constructor`-style keys of the dispatch table are no versions either.
    expect(
      replayEstimateAudit({ ...audit, rulesVersion: "toString" as unknown as number }),
    ).toBeNull();
  });

  describe("an audit no round could have produced", () => {
    const base = () => auditOf(stechenRound());

    it("has no stage, or more than four", () => {
      const audit = base();
      expect(replayEstimateAudit({ ...audit, stages: [] })).toBeNull();
      const five = Array.from({ length: 5 }, () => audit.stages[0]);
      expect(replayEstimateAudit({ ...audit, stages: five })).toBeNull();
    });

    it("runs past the third Stechfrage (the lot decides after it)", () => {
      const lot = auditOf(lotRound());
      expect(replayEstimateAudit(lot)).toEqual(["B"]);
      // A fifth stage that follows perfectly from the fourth (same players, same tie) is still no round.
      const fifth = { ...lot.stages[3] };
      expect(replayEstimateAudit({ ...lot, stages: [...lot.stages, fifth] })).toBeNull();
    });

    it("starts with a Stechfrage, or has a main question later", () => {
      const audit = base();
      expect(
        replayEstimateAudit({
          ...audit,
          stages: [{ ...audit.stages[0], kind: "stechen" }, audit.stages[1]],
        }),
      ).toBeNull();
      expect(
        replayEstimateAudit({
          ...audit,
          stages: [audit.stages[0], { ...audit.stages[1], kind: "main" }],
        }),
      ).toBeNull();
    });

    it("lets a Stechfrage be played by someone who was not contested", () => {
      const audit = base();
      const stage = audit.stages[1];
      const contenders = Object.keys(stage.guessesMilli);
      // Replace one contender: the set no longer equals the contested set of stage 0.
      const swapped = Object.fromEntries(
        contenders.map((uid, i) => [i === 0 ? "Q" : uid, stage.guessesMilli[uid]]),
      );
      expect(
        replayEstimateAudit({
          ...audit,
          stages: [audit.stages[0], { ...stage, guessesMilli: swapped }],
        }),
      ).toBeNull();
      // Drop one contender.
      const fewer = Object.fromEntries(
        contenders.slice(1).map((uid) => [uid, stage.guessesMilli[uid]]),
      );
      expect(
        replayEstimateAudit({
          ...audit,
          stages: [audit.stages[0], { ...stage, guessesMilli: fewer }],
        }),
      ).toBeNull();
    });

    it("changes the number of slots between stages", () => {
      const audit = base();
      expect(
        replayEstimateAudit({
          ...audit,
          stages: [audit.stages[0], { ...audit.stages[1], slots: 1 }],
        }),
      ).toBeNull();
    });

    it("goes on after a stage that decided everything", () => {
      const audit = auditOf(distanceRound());
      const extra = { ...audit.stages[0], kind: "stechen" as const };
      expect(replayEstimateAudit({ ...audit, stages: [audit.stages[0], extra] })).toBeNull();
    });

    it("stops after a contested stage without a lot, or with a lot nobody drew", () => {
      const audit = auditOf(stechenRound());
      // Only stage 0: its contested players are still open and no lot is recorded.
      expect(
        replayEstimateAudit({ ...audit, stages: [audit.stages[0]], resolvedBy: "distance" }),
      ).toBeNull();
      const lot = auditOf(lotRound());
      expect(replayEstimateAudit({ ...lot, shuffled: null })).toBeNull();
      expect(replayEstimateAudit({ ...lot, resolvedBy: "stechen" })).toBeNull();
      expect(replayEstimateAudit({ ...lot, resolvedBy: "distance" })).toBeNull();
    });

    it("records a lot order that is no permutation of the contested players", () => {
      const lot = auditOf(lotRound());
      for (const shuffled of [["B"], ["B", "B"], ["B", "A", "C"], ["A", "Q"], []]) {
        expect(replayEstimateAudit({ ...lot, shuffled })).toBeNull();
      }
      // Both orders of the real two are possible audits (they just book different payers).
      expect(replayEstimateAudit({ ...lot, shuffled: ["A", "B"] })).toEqual(["A"]);
    });

    it("records a lot although the ranking decided", () => {
      const audit = auditOf(distanceRound());
      expect(replayEstimateAudit({ ...audit, shuffled: ["A", "B"] })).toBeNull();
    });

    it("misstates how the round was resolved", () => {
      const distance = auditOf(distanceRound());
      expect(replayEstimateAudit({ ...distance, resolvedBy: "stechen" })).toBeNull();
      expect(replayEstimateAudit({ ...distance, resolvedBy: "shuffle" })).toBeNull();
      const stechen = auditOf(stechenRound());
      expect(replayEstimateAudit({ ...stechen, resolvedBy: "distance" })).toBeNull();
    });

    it("lets a stage run on although every contested player never answered (the lot decides at once)", () => {
      const absent = auditOf(absentRound());
      const second = {
        ...absent.stages[0],
        kind: "stechen" as const,
        guessesMilli: { B: 100_000, C: 101_000 },
        slots: 1,
      };
      expect(
        replayEstimateAudit({
          ...absent,
          stages: [absent.stages[0], second],
          resolvedBy: "stechen",
          shuffled: null,
        }),
      ).toBeNull();
    });

    it("holds numbers no player could have typed, without throwing", () => {
      const audit = auditOf(distanceRound());
      const stage = audit.stages[0];
      const broken: Partial<EstimateAudit["stages"][number]>[] = [
        { guessesMilli: { A: Number.NaN, B: 1, C: 2 } },
        { guessesMilli: { A: 1.5, B: 1, C: 2 } },
        { guessesMilli: { A: -1, B: 1, C: 2 } },
        { guessesMilli: { A: 10 ** 16, B: 1, C: 2 } },
        { guessesMilli: { A: "90" as unknown as number, B: 1, C: 2 } },
        { guessesMilli: { A: undefined as unknown as number, B: 1, C: 2 } },
        { truthMilli: -5 },
        { truthMilli: Number.POSITIVE_INFINITY },
        { slots: 0 },
        { slots: 3 },
        { slots: 1.5 },
        { tolerance: { kind: "ratio", permille: 20 } },
        { tolerance: { kind: "interval", milli: -1 } },
        { guessesMilli: undefined as unknown as Record<string, number | null> },
      ];
      for (const patch of broken) {
        const tampered = { ...audit, stages: [{ ...stage, ...patch }] };
        expect(() => replayEstimateAudit(tampered)).not.toThrow();
        expect(replayEstimateAudit(tampered)).toBeNull();
        expect(verifyEstimateAudit(tampered)).toBe(false);
      }
      // A ratio question with a guess of zero has no distance.
      const ratio = auditOf(lotRound());
      expect(
        replayEstimateAudit({
          ...ratio,
          stages: [
            { ...ratio.stages[0], guessesMilli: { A: 0, B: 200_000 } },
            ...ratio.stages.slice(1),
          ],
        }),
      ).toBeNull();
      // Nothing at all.
      expect(replayEstimateAudit({} as unknown as EstimateAudit)).toBeNull();
    });
  });
});

describe("verifyEstimateAudit: tampering", () => {
  it("rejects a changed guess that changes who pays", () => {
    const audit = auditOf(distanceRound()); // C pays (140 vs 100); A=90, B=111.
    expect(verifyEstimateAudit(audit)).toBe(true);
    // C "really" guessed 101: now B is furthest (11) and pays - the booked C no longer follows.
    const tampered: EstimateAudit = {
      ...audit,
      stages: [
        { ...audit.stages[0], guessesMilli: { ...audit.stages[0].guessesMilli, C: 101_000 } },
      ],
    };
    expect(replayEstimateAudit(tampered)).toEqual(["B"]);
    expect(verifyEstimateAudit(tampered)).toBe(false);
  });

  it("rejects a changed truth that changes who pays", () => {
    const audit = auditOf(distanceRound());
    // Truth 150 instead of 100: A (60 off) is now furthest, C is the closest.
    const tampered: EstimateAudit = {
      ...audit,
      stages: [{ ...audit.stages[0], truthMilli: 150_000 }],
    };
    expect(replayEstimateAudit(tampered)).toEqual(["A"]);
    expect(verifyEstimateAudit(tampered)).toBe(false);
  });

  it("rejects a changed truth deep in a Stechen chain", () => {
    const audit = auditOf(lotRound());
    expect(verifyEstimateAudit(audit)).toBe(true);
    // The last Stechfrage's truth moved: 9 and 11 are no tie any more, the lot is not what decided.
    const stages = audit.stages.map((s, i) => (i === 3 ? { ...s, truthMilli: 9_000 } : s));
    expect(replayEstimateAudit({ ...audit, stages })).toBeNull();
    expect(verifyEstimateAudit({ ...audit, stages })).toBe(false);
  });

  it("rejects a swapped payer", () => {
    const audit = auditOf(distanceRound());
    for (const swapped of ["A", "B"]) {
      const tampered: EstimateAudit = {
        ...audit,
        booked: { ...audit.booked, loserUids: [swapped] },
      };
      expect(verifyEstimateAudit(tampered)).toBe(false);
    }
    const two = auditOf(placeholderRound()); // B, C pay
    expect(verifyEstimateAudit({ ...two, booked: { ...two.booked, loserUids: ["B", "D"] } })).toBe(
      false,
    );
    // The right payers plus a surplus one at the end (every prefix position still matches).
    expect(
      verifyEstimateAudit({
        ...two,
        booked: { ...two.booked, loserUids: [...two.booked.loserUids, "D"] },
      }),
    ).toBe(false);
    // A payer dropped, a payer added, a stranger booked.
    expect(verifyEstimateAudit({ ...two, booked: { ...two.booked, loserUids: ["B"] } })).toBe(
      false,
    );
    expect(
      verifyEstimateAudit({ ...two, booked: { ...two.booked, loserUids: ["B", "C", "D"] } }),
    ).toBe(false);
    expect(verifyEstimateAudit({ ...two, booked: { ...two.booked, loserUids: ["B", "Q"] } })).toBe(
      false,
    );
  });

  it("rejects the right payers in the wrong order (the order is the order the bill was split in)", () => {
    const two = auditOf(placeholderRound());
    expect(two.booked.loserUids).toEqual(["C", "B"]);
    expect(verifyEstimateAudit({ ...two, booked: { ...two.booked, loserUids: ["B", "C"] } })).toBe(
      false,
    );
  });

  it("rejects the other lot outcome and a different resolution", () => {
    const lot = auditOf(lotRound());
    expect(verifyEstimateAudit({ ...lot, booked: { ...lot.booked, loserUids: ["A"] } })).toBe(
      false,
    );
    expect(verifyEstimateAudit({ ...lot, shuffled: ["A", "B"] })).toBe(false);
    expect(verifyEstimateAudit({ ...lot, resolvedBy: "stechen" })).toBe(false);
  });

  it("does not look at the money: a changed booked amount or currency still verifies", () => {
    const audit = auditOf(distanceRound());
    expect(
      verifyEstimateAudit({
        ...audit,
        booked: { ...audit.booked, amountMinor: 1, currency: "USD" },
      }),
    ).toBe(true);
  });

  it("accepts an untouched audit of every fixture, and of every claimed placeholder's old uid", () => {
    for (const make of Object.values(FIXTURES)) {
      expect(verifyEstimateAudit(auditOf(make()))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// compareEstimateAuditToExpense
// ---------------------------------------------------------------------------

describe("compareEstimateAuditToExpense", () => {
  it("passes for the equal split of the booking", () => {
    for (const make of Object.values(FIXTURES)) {
      const audit = auditOf(make());
      expect(compareEstimateAuditToExpense(audit, expenseOf(audit))).toEqual({
        payers: true,
        equalSplit: true,
        amountChanged: false,
      });
    }
  });

  it("fails the money check for a hand-edited split: 34,00 / 1,00 / 1,00", () => {
    const round = playRound({
      entrants: ["A", "B", "C", "D"],
      k: 3,
      plans: [{ row: rowOf(0, "interval", 100), guesses: { A: 10, B: 130, C: 70, D: 101 } }],
    });
    const audit = buildEstimateAudit(
      round,
      { amountMinor: 3600, currency: "EUR" },
      {
        name: "Anna",
        placeholder: false,
      },
    );
    expect(audit.booked.loserUids).toHaveLength(3);
    const [first, second, third] = audit.booked.loserUids;
    const edited = withSplits(expenseOf(audit), { [first]: 3400, [second]: 100, [third]: 100 });
    expect(compareEstimateAuditToExpense(audit, edited)).toEqual({
      payers: true,
      equalSplit: false,
      amountChanged: false,
    });
    // An unequal split that still adds up to the bill.
    expect(
      compareEstimateAuditToExpense(
        audit,
        withSplits(expenseOf(audit), { [first]: 1300, [second]: 1200, [third]: 1100 }),
      ).equalSplit,
    ).toBe(false);
  });

  it("fails the money check when the split no longer adds up to the bill", () => {
    const audit = auditOf(placeholderRound()); // B, C
    const short = withSplits(expenseOf(audit), { B: 1500, C: 1400 });
    expect(compareEstimateAuditToExpense(audit, short).equalSplit).toBe(false);
    const over = withSplits(expenseOf(audit), { B: 1500, C: 1600 });
    expect(compareEstimateAuditToExpense(audit, over).equalSplit).toBe(false);
  });

  it("accepts the odd cent on any payer: only the multiset of amounts is the equal split", () => {
    const audit = buildEstimateAudit(
      placeholderRound(),
      { amountMinor: 1001, currency: "EUR" },
      {
        name: "Anna",
        placeholder: false,
      },
    );
    const split = expenseOf(audit);
    expect(
      Object.values(split.splits)
        .map((s) => s.amountMinor)
        .sort(),
    ).toEqual([500, 501]);
    expect(
      compareEstimateAuditToExpense(audit, withSplits(split, { B: 501, C: 500 })).equalSplit,
    ).toBe(true);
    expect(
      compareEstimateAuditToExpense(audit, withSplits(split, { B: 500, C: 501 })).equalSplit,
    ).toBe(true);
    expect(
      compareEstimateAuditToExpense(audit, withSplits(split, { B: 502, C: 499 })).equalSplit,
    ).toBe(false);
  });

  it("fails the money check for another currency", () => {
    const audit = auditOf(distanceRound());
    const usd = expenseOf(audit, { currency: "USD" });
    expect(compareEstimateAuditToExpense(audit, usd)).toEqual({
      payers: true,
      equalSplit: false,
      amountChanged: false,
    });
  });

  it("reports an amount typo that keeps the equal split: still fine, but `amountChanged`", () => {
    const audit = auditOf(placeholderRound());
    const fixed = expenseOf(audit, { amountMinor: 3100 });
    expect(compareEstimateAuditToExpense(audit, fixed)).toEqual({
      payers: true,
      equalSplit: true,
      amountChanged: true,
    });
    // The amount changed but the split stayed: that is the money check failing, and the change reported.
    const stale = withSplits(expenseOf(audit), { B: 1500, C: 1500 });
    expect(compareEstimateAuditToExpense(audit, { ...stale, amountMinor: 3100 })).toEqual({
      payers: true,
      equalSplit: false,
      amountChanged: true,
    });
  });

  describe("payers", () => {
    it("fails for a forged real payer", () => {
      const audit = auditOf(distanceRound()); // C pays, a real account
      const forged = withSplits(expenseOf(audit), { A: 3000 });
      expect(compareEstimateAuditToExpense(audit, forged).payers).toBe(false);
      // A stranger in a real account's place (the account is no placeholder, so nothing was claimed).
      const stranger = withSplits(expenseOf(audit), { Q: 3000 });
      expect(compareEstimateAuditToExpense(audit, stranger).payers).toBe(false);
    });

    it("fails when someone is missing or added", () => {
      const audit = auditOf(placeholderRound()); // B, C
      expect(
        compareEstimateAuditToExpense(audit, withSplits(expenseOf(audit), { B: 3000 })).payers,
      ).toBe(false);
      expect(
        compareEstimateAuditToExpense(
          audit,
          withSplits(expenseOf(audit), { B: 1000, C: 1000, A: 1000 }),
        ).payers,
      ).toBe(false);
      expect(compareEstimateAuditToExpense(audit, withSplits(expenseOf(audit), {})).payers).toBe(
        false,
      );
    });

    it("fails when a placeholder payer is simply gone (nobody took their place)", () => {
      const audit = auditOf(placeholderRound()); // C, B(placeholder)
      const gone = withSplits(expenseOf(audit), { C: 3000 });
      expect(compareEstimateAuditToExpense(audit, gone).payers).toBe(false);
    });

    it("ignores a zero entry: only a positive split pays", () => {
      const audit = auditOf(placeholderRound());
      const withZero = withSplits(expenseOf(audit), { B: 1500, C: 1500, A: 0 });
      expect(compareEstimateAuditToExpense(audit, withZero)).toMatchObject({
        payers: true,
        equalSplit: true,
      });
    });

    it("tolerates a placeholder claimed after booking (the uid swapped, `names[ph].placeholder`)", () => {
      const audit = auditOf(placeholderRound()); // B is a placeholder and pays first
      expect(audit.names.B.placeholder).toBe(true);
      // `claimPlaceholder` rewrote B to the joining account's uid; the audit still says B.
      const claimed = withSplits(expenseOf(audit), { "real-uid": 1500, C: 1500 });
      expect(compareEstimateAuditToExpense(audit, claimed)).toEqual({
        payers: true,
        equalSplit: true,
        amountChanged: false,
      });
      // The audit itself never flipped: it still replays to its own booking.
      expect(verifyEstimateAudit(audit)).toBe(true);
    });

    it("tolerates two placeholders claimed at once", () => {
      const round = playRound({
        mode: "local",
        entrants: ["A", "B", "C", "D"],
        placeholders: ["B", "C"],
        k: 2,
        plans: [{ row: rowOf(0, "interval", 100), guesses: { A: 100, B: 130, C: 70, D: 101 } }],
      });
      const audit = auditOf(round);
      const claimed = withSplits(expenseOf(audit), { "new-1": 1500, "new-2": 1500 });
      expect(compareEstimateAuditToExpense(audit, claimed)).toMatchObject({
        payers: true,
        equalSplit: true,
      });
    });

    it("does not tolerate a swap for a real account, only for a placeholder", () => {
      const audit = auditOf(placeholderRound()); // B placeholder, C real
      const swappedReal = withSplits(expenseOf(audit), { B: 1500, "real-uid": 1500 });
      expect(compareEstimateAuditToExpense(audit, swappedReal).payers).toBe(false);
    });

    it("does not tolerate a swap for someone who played (a uid the audit knows)", () => {
      const audit = auditOf(placeholderRound());
      // B (placeholder) replaced by A, who is in the audit: a forged payer, not a claim.
      const forged = withSplits(expenseOf(audit), { A: 1500, C: 1500 });
      expect(compareEstimateAuditToExpense(audit, forged).payers).toBe(false);
      // ... also when B is replaced by the other entrant who did not pay.
      const forged2 = withSplits(expenseOf(audit), { D: 1500, C: 1500 });
      expect(compareEstimateAuditToExpense(audit, forged2).payers).toBe(false);
    });

    it("does not tolerate a claim that changes the number of payers", () => {
      const audit = auditOf(placeholderRound());
      const merged = withSplits(expenseOf(audit), { "real-uid": 3000 }); // the known gap (K.22): reported, not hidden
      expect(compareEstimateAuditToExpense(audit, merged).payers).toBe(false);
    });
  });

  describe("malformed expenses are reported, never thrown", () => {
    const audit = auditOf(placeholderRound());
    it.each([
      ["negative", { B: 3100, C: -100 }],
      ["fractional", { B: 1500.5, C: 1499.5 }],
      ["not a number", { B: Number.NaN, C: 1500 }],
    ])("%s split amounts", (_label, amounts) => {
      const result = compareEstimateAuditToExpense(audit, withSplits(expenseOf(audit), amounts));
      expect(result.payers).toBe(false);
      expect(result.equalSplit).toBe(false);
    });

    it("a non-integer bill", () => {
      const result = compareEstimateAuditToExpense(audit, {
        ...expenseOf(audit),
        amountMinor: 3000.5,
      });
      expect(result.equalSplit).toBe(false);
      expect(result.amountChanged).toBe(true);
    });

    it("an expense nobody pays", () => {
      expect(
        compareEstimateAuditToExpense(audit, withSplits(expenseOf(audit), { B: 0, C: 0 })),
      ).toEqual({
        payers: false,
        equalSplit: false,
        amountChanged: false,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// buildEstimateChatSummary
// ---------------------------------------------------------------------------

describe("buildEstimateChatSummary", () => {
  it("has one line per stage that produced a payer, with the deciding numbers", () => {
    const round = distanceRound();
    const summary = buildEstimateChatSummary(round);
    expect(summary.resolvedBy).toBe("distance");
    expect(summary.lines).toHaveLength(1);
    const [line] = summary.lines;
    expect(line).toMatchObject({
      text: round.stages[0].question.text,
      unit: round.stages[0].question.unit,
      scale: "interval",
      format: "quantity",
      truthMilli: 100_000,
    });
    expect(line.payers).toEqual([
      {
        uid: "C",
        name: "Clara",
        guessMilli: 140_000,
        distance: { kind: "interval", diffMilli: 40_000, direction: "high" },
        byLot: false,
      },
    ]);
  });

  it("omits a stage that produced no payer and lists the payers of a Stechfrage", () => {
    const round = stechenRound();
    expect(round.stages[0].reveal?.payers).toEqual([]);
    const summary = buildEstimateChatSummary(round);
    expect(summary.resolvedBy).toBe("stechen");
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0].truthMilli).toBe(50_000);
    expect(summary.lines[0].text).toEqual(round.stages[1].question.text);
    expect(summary.lines[0].payers.map((p) => p.uid)).toEqual(round.stages[1].reveal?.payers);
    expect(summary.lines[0].payers.every((p) => !p.byLot)).toBe(true);
    // The booking order is the order of the lines' payers.
    expect(summary.lines.flatMap((line) => line.payers.map((p) => p.uid))).toEqual(round.loserUids);
  });

  it("flags the lot's picks and keeps them last in their stage", () => {
    const round = lotRound();
    const summary = buildEstimateChatSummary(round);
    expect(summary.resolvedBy).toBe("shuffle");
    expect(summary.lines).toHaveLength(1);
    expect(summary.lines[0].truthMilli).toBe(10_000); // the last Stechfrage, where the lot fell
    expect(summary.lines[0].payers).toEqual([
      {
        uid: "B",
        name: "Ben",
        guessMilli: 11_000,
        distance: { kind: "interval", diffMilli: 1000, direction: "high" },
        byLot: true,
      },
    ]);
  });

  it("flags a lot pick without a guess: no guess, no distance", () => {
    const summary = buildEstimateChatSummary(absentRound());
    const picks = summary.lines.flatMap((line) => line.payers);
    expect(picks).toHaveLength(1);
    expect(picks[0]).toMatchObject({ guessMilli: null, distance: null, byLot: true });
  });

  it("mixes certain payers and lot picks of one stage, certain first", () => {
    const round = playRound({
      entrants: ["A", "B", "C", "D"],
      k: 2,
      shuffle: reversed,
      plans: [
        // C is certainly the furthest (off by 50); A and B tie exactly (40 each side), D is close.
        { row: rowOf(0, "interval", 100), guesses: { A: 60, B: 140, C: 150, D: 99 } },
      ],
    });
    const summary = buildEstimateChatSummary(round);
    const [line] = summary.lines;
    expect(line.payers.map((p) => [p.uid, p.byLot])).toEqual([
      ["C", false],
      ["B", true],
    ]);
    expect(line.payers.map((p) => p.uid)).toEqual(round.loserUids);
  });

  it("takes the names from the snapshot of the round, so a departed member or claimed placeholder still has one", () => {
    const summary = buildEstimateChatSummary(placeholderRound());
    expect(summary.lines[0].payers.map((p) => p.name)).toEqual(["Clara", "Ben"]);
  });

  it("is plain data", () => {
    for (const make of Object.values(FIXTURES)) {
      const summary = buildEstimateChatSummary(make());
      expect(wire(summary)).toStrictEqual(summary);
    }
  });

  it("refuses a round that is not decided", () => {
    expect(() => buildEstimateChatSummary({ ...distanceRound(), resolvedBy: null })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Property: every round the state machine can play audits and replays
// ---------------------------------------------------------------------------

describe("random rounds", () => {
  it("replay to exactly the booked payers; any single booked swap breaks the verdict", () => {
    const rand = seeded(20260101);
    const int = (below: number) => Math.floor(rand() * below);
    let stechen = 0;
    let lots = 0;
    let multiStage = 0;

    for (let run = 0; run < 400; run += 1) {
      const n = 2 + int(5);
      const entrants = ["A", "B", "C", "D", "E", "F"].slice(0, n);
      const k = 1 + int(n - 1);
      const scale: EstimateScale = rand() < 0.5 ? "interval" : "ratio";
      const round = playRound({
        entrants,
        k,
        mode: rand() < 0.3 ? "local" : "online",
        shuffle: <T>(items: T[]): T[] => {
          const out = [...items];
          for (let i = out.length - 1; i > 0; i -= 1) {
            const j = int(i + 1);
            [out[i], out[j]] = [out[j], out[i]];
          }
          return out;
        },
        plans: (index, contenders) => {
          const truth = 20 + int(80);
          // Interval stages sometimes carry a tolerance; ratio stages a percentage band.
          const tolerance =
            rand() < 0.4
              ? scale === "interval"
                ? String(1 + int(12))
                : String(1 + int(15))
              : undefined;
          const guesses: Record<string, number | null> = {};
          for (const uid of contenders) {
            if (rand() < 0.2) guesses[uid] = null;
            else if (scale === "interval") guesses[uid] = Math.max(0, truth + int(9) - 4);
            else guesses[uid] = Math.max(1, Math.round(truth * [0.5, 0.8, 1, 1.25, 2][int(5)]));
          }
          return { row: rowOf(index, scale, truth, tolerance), guesses };
        },
      });
      if (round.stages.length > 1) multiStage += 1;
      if (round.resolvedBy === "stechen") stechen += 1;
      if (round.resolvedBy === "shuffle") lots += 1;

      const audit = auditOf(round);
      const replayed = replayEstimateAudit(wire(audit));
      expect(replayed, `run ${run}: replay`).toEqual(round.loserUids);
      expect(verifyEstimateAudit(audit), `run ${run}: verify`).toBe(true);
      expect(audit.booked.loserUids).toHaveLength(k);
      expect(compareEstimateAuditToExpense(audit, expenseOf(audit))).toEqual({
        payers: true,
        equalSplit: true,
        amountChanged: false,
      });

      // Booking someone else (a non-payer in place of a payer) never verifies.
      const bystander = entrants.find((uid) => !audit.booked.loserUids.includes(uid));
      if (bystander !== undefined) {
        const loserUids = [...audit.booked.loserUids];
        loserUids[int(loserUids.length)] = bystander;
        expect(verifyEstimateAudit({ ...audit, booked: { ...audit.booked, loserUids } })).toBe(
          false,
        );
        // ... and the live expense of that forged booking fails the payers check against the true audit.
        const forged = withSplits(
          expenseOf(audit),
          Object.fromEntries(Object.entries(splitEqual(audit.booked.amountMinor, loserUids))),
        );
        expect(compareEstimateAuditToExpense(audit, forged).payers).toBe(false);
      }

      // The chat summary lists exactly the payers, in booking order.
      const lines = buildEstimateChatSummary(round).lines;
      expect(lines.flatMap((line) => line.payers.map((p) => p.uid))).toEqual(round.loserUids);
    }
    // The generator reached the interesting paths, or the loop proves little.
    expect(multiStage).toBeGreaterThan(20);
    expect(stechen).toBeGreaterThan(5);
    expect(lots).toBeGreaterThan(5);
  });
});
