/**
 * Hand-built estimate documents for the component tests: a public question, and
 * revealed stages whose results are computed with the real `estimateDistance`
 * so the rows are consistent. Synthetic ("Testberg"), never bank content. Test
 * support only — nothing in the app imports this file.
 */
import { estimateDistance } from "@/lib/games/estimate-input";
import type {
  EstimateAudit,
  EstimatePublicQuestion,
  EstimateReveal,
  EstimateResultRow,
  EstimateRound,
  EstimateStage,
  ExpenseSplit,
  GroupMember,
} from "@/lib/types";

export const RATIO_QUESTION: EstimatePublicQuestion = {
  id: "est-geo-9001",
  category: "geography",
  tone: "standard",
  text: { de: "Wie hoch ist der Testberg?", en: "How high is Mount Test?" },
  unit: { de: "Meter", en: "metres", symbol: "m" },
  scale: "ratio",
  format: "quantity",
  bounds: { minMilli: 1000, maxMilli: 10_000_000_000 },
};

export const YEAR_QUESTION: EstimatePublicQuestion = {
  id: "est-his-9002",
  category: "history",
  tone: "standard",
  text: {
    de: "In welchem Jahr wurde die Testbrücke eröffnet?",
    en: "In which year did Test Bridge open?",
  },
  unit: { de: "Jahr", en: "year", symbol: "" },
  scale: "interval",
  format: "year",
  bounds: { minMilli: 0, maxMilli: 2_100_000 },
};

export const DEGREES_QUESTION: EstimatePublicQuestion = {
  id: "est-sci-9003",
  category: "science",
  tone: "standard",
  text: { de: "Wie heiß ist der Testofen?", en: "How hot is the test oven?" },
  unit: { de: "Grad", en: "degrees", symbol: "°C" },
  scale: "interval",
  format: "quantity",
  bounds: { minMilli: 0, maxMilli: 1_000_000_000 },
};

export function member(displayName: string): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
  };
}

export const MEMBERS: Record<string, GroupMember> = {
  lea: member("Lea"),
  max: member("Max"),
  ben: member("Ben"),
  tom: member("Tom"),
};

export const ENTRANTS: EstimateRound["entrants"] = Object.fromEntries(
  Object.entries(MEMBERS).map(([uid, m]) => [
    uid,
    { displayName: m.displayName, isPlaceholder: false },
  ]),
);

export interface RowSpec {
  uid: string;
  /** `null` = no guess. */
  guess: number | null;
  fate: EstimateResultRow["fate"];
  enteredBy?: string | null;
  answeredAfterMs?: number | null;
}

/** Rows in the order given (= ranked, furthest first), ranks 1..n. */
export function makeResults(
  question: Pick<EstimatePublicQuestion, "scale">,
  truthMilli: number,
  rows: readonly RowSpec[],
): EstimateResultRow[] {
  return rows.map((row, index) => ({
    uid: row.uid,
    guessMilli: row.guess,
    distance: row.guess === null ? null : estimateDistance(question.scale, row.guess, truthMilli),
    rank: index + 1,
    fate: row.fate,
    enteredBy: row.enteredBy ?? null,
    answeredAfterMs: row.answeredAfterMs ?? null,
  }));
}

export const TRUTH_SOURCE = { label: "Testamt (fiktiv)", url: "https://example.org/testberg" };

export function makeReveal(
  question: Pick<EstimatePublicQuestion, "scale">,
  truthMilli: number,
  rows: readonly RowSpec[],
  overrides: Partial<EstimateReveal> = {},
): EstimateReveal {
  const results = makeResults(question, truthMilli, rows);
  return {
    revealedAt: "2026-05-01T10:00:00.000Z",
    reason: "local",
    truthMilli,
    tolerance: null,
    asOf: 2024,
    source: TRUTH_SOURCE,
    sources: [
      { ...TRUTH_SOURCE, kind: "primary" },
      { label: "Zweitquelle (fiktiv)", url: "https://example.com/testberg", kind: "secondary" },
    ],
    definition: "Height of the fictional Mount Test. Fixture data, not a fact.",
    note: null,
    results,
    payers: results.filter((r) => r.fate === "pays").map((r) => r.uid),
    safe: results.filter((r) => r.fate === "safe").map((r) => r.uid),
    contested: results.filter((r) => r.fate === "contested").map((r) => r.uid),
    slotsLeft: 0,
    precedes: [],
    bandTie: false,
    next: "decided",
    shuffled: null,
    lotPayers: null,
    ...overrides,
  };
}

export function makeStage(
  question: EstimatePublicQuestion,
  contenders: string[],
  reveal: EstimateReveal | null,
  overrides: Partial<EstimateStage> = {},
): EstimateStage {
  return {
    index: 0,
    kind: "main",
    question,
    contenders,
    slots: 1,
    openedAt: "2026-05-01T09:59:00.000Z",
    closesAt: null,
    lastCallAt: null,
    submitted: reveal ? contenders : [],
    status: reveal ? "revealed" : "guessing",
    reveal,
    ...overrides,
  };
}

export function makeRound(
  stages: EstimateStage[],
  overrides: Partial<EstimateRound> = {},
): EstimateRound {
  return {
    id: "round1",
    rulesVersion: 1,
    mode: "local",
    status: "running",
    createdBy: "lea",
    createdAt: "2026-05-01T09:59:00.000Z",
    updatedAt: "2026-05-01T10:00:00.000Z",
    finishedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    entrants: ENTRANTS,
    order: ["lea", "max", "ben", "tom"],
    targetLoserCount: 1,
    includeFun: false,
    answerWindowMs: null,
    stages,
    loserUids: null,
    resolvedBy: null,
    stake: null,
    autoBook: null,
    expenseId: null,
    autoBookError: null,
    ...overrides,
  };
}

/** Truth 2 962 m; Max guessed 1 200 m, Lea 2 900 m, Ben 8 000 m (furthest, factor 2.7). */
export function decidedRound(): EstimateRound {
  const truth = 2_962_000;
  const reveal = makeReveal(
    RATIO_QUESTION,
    truth,
    [
      { uid: "ben", guess: 8_000_000, fate: "pays" },
      { uid: "max", guess: 1_200_000, fate: "safe" },
      { uid: "lea", guess: 2_900_000, fate: "safe" },
    ],
    { slotsLeft: 0, next: "decided" },
  );
  return makeRound([makeStage(RATIO_QUESTION, ["lea", "max", "ben"], reveal)], {
    status: "finished",
    finishedAt: "2026-05-01T10:00:00.000Z",
    loserUids: ["ben"],
    resolvedBy: "distance",
    order: ["lea", "max", "ben"],
  });
}

/** The spec's E2b: truth 100, tolerance 1, A = 90, B = 111 — outside the band, both contested. */
export function bandTieRound(): EstimateRound {
  const truth = 100_000;
  const reveal = makeReveal(
    DEGREES_QUESTION,
    truth,
    [
      { uid: "max", guess: 111_000, fate: "contested" },
      { uid: "lea", guess: 90_000, fate: "contested" },
      { uid: "ben", guess: 100_000, fate: "safe" },
    ],
    {
      tolerance: { kind: "interval", milli: 1000 },
      bandTie: true,
      slotsLeft: 1,
      next: "stechen",
    },
  );
  return makeRound([makeStage(DEGREES_QUESTION, ["lea", "max", "ben"], reveal)], {
    order: ["lea", "max", "ben"],
  });
}

/** A one-stage audit of `decidedRound` (Ben pays 30,00 €). */
export function decidedAudit(overrides: Partial<EstimateAudit> = {}): EstimateAudit {
  return {
    rulesVersion: 1,
    roundId: "round1",
    mode: "online",
    createdBy: "lea",
    finishedAt: "2026-05-01T10:00:00.000Z",
    resolvedBy: "distance",
    names: {
      lea: { name: "Lea", placeholder: false },
      max: { name: "Max", placeholder: false },
      ben: { name: "Ben", placeholder: false },
    },
    booked: { amountMinor: 3000, currency: "EUR", loserUids: ["ben"] },
    stages: [
      {
        kind: "main",
        questionId: RATIO_QUESTION.id,
        text: RATIO_QUESTION.text,
        unit: RATIO_QUESTION.unit,
        scale: "ratio",
        format: "quantity",
        truthMilli: 2_962_000,
        tolerance: null,
        asOf: 2024,
        sourceLabel: TRUTH_SOURCE.label,
        sourceUrl: TRUTH_SOURCE.url,
        definition: "Height of the fictional Mount Test. Fixture data, not a fact.",
        reason: "all-in",
        guessesMilli: { lea: 2_900_000, max: 1_200_000, ben: 8_000_000 },
        enteredBy: {},
        slots: 1,
      },
    ],
    shuffled: null,
    ...overrides,
  };
}

/** `splits` of an expense from uid -> amount (minor units). */
export function makeSplits(amounts: Record<string, number>): Record<string, ExpenseSplit> {
  return Object.fromEntries(
    Object.entries(amounts).map(([uid, amountMinor]) => [
      uid,
      { rawValue: amountMinor, amountMinor },
    ]),
  );
}
