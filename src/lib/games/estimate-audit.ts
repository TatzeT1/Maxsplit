import type {
  EstimateAudit,
  EstimateAuditStage,
  EstimateChatLine,
  EstimateChatSummary,
  EstimatePrecedes,
  EstimateRound,
  EstimateStage,
  Expense,
} from "@/lib/types";
import { ESTIMATE_MAX_STECHEN, ESTIMATE_RULES_VERSION } from "@/lib/games/estimate-input";
import { classifyEstimate, lotPicks } from "@/lib/games/estimate-rules";
import { splitEqual } from "@/lib/money/split";

/**
 * The compact, re-verifiable record of a finished estimate round, and the
 * checks that replay it. Pure. Built by the server when an expense books the
 * round (online: the finishing transaction; one phone: the verified claim in
 * `addExpense`); replayed by tests and by the lazily loaded audit table.
 *
 * What it proves: the ARITHMETIC — these guesses and truths produce exactly
 * these booked payers, under the rules version the round was played with. What
 * it does not: that a one-phone table guessed honestly (the device owner types
 * every guess, and the audit says so via `createdBy` / `enteredBy`).
 *
 * Server and test only, plus the lazily loaded audit table (it replays
 * through `estimate-rules.ts`); it must stay out of the group page's initial
 * chunk (ESLint and `pnpm check:bank-leak`). No bank import: the audit holds
 * exactly the inputs of the ranking function, so the replay never needs a row.
 *
 * Spec C.11.
 */

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

function finishedStages(round: EstimateRound): (EstimateStage & {
  reveal: NonNullable<EstimateStage["reveal"]>;
})[] {
  const stages: (EstimateStage & { reveal: NonNullable<EstimateStage["reveal"]> })[] = [];
  for (const stage of round.stages) {
    if (stage.reveal === null)
      throw new Error(`stage ${stage.index} of ${round.id} is not revealed`);
    stages.push({ ...stage, reveal: stage.reveal });
  }
  return stages;
}

/**
 * `round.status` must be "finished". Names come from `round.entrants` plus the
 * creator, who need not be an entrant (a scorekeeper holding the phone): the
 * caller passes the name from `group.members`. An entrant's snapshot wins for
 * the creator too, so the audit shows the name the table played under.
 *
 * Throws `Error` for a round that is not finished (a caller bug, never user
 * input) and `RangeError` for a booked amount that is no integer.
 */
export function buildEstimateAudit(
  round: EstimateRound,
  booked: { amountMinor: number; currency: string },
  creator: { name: string; placeholder: boolean },
): EstimateAudit {
  const { loserUids, resolvedBy, finishedAt } = round;
  if (
    round.status !== "finished" ||
    loserUids === null ||
    resolvedBy === null ||
    finishedAt === null
  ) {
    throw new Error(`round ${round.id} is not finished: no audit`);
  }
  if (!Number.isSafeInteger(booked.amountMinor)) {
    throw new RangeError(`the booked amount is no integer: ${String(booked.amountMinor)}`);
  }
  const stages = finishedStages(round);
  const last = stages[stages.length - 1];

  const names: EstimateAudit["names"] = {};
  for (const [uid, entrant] of Object.entries(round.entrants)) {
    names[uid] = { name: entrant.displayName, placeholder: entrant.isPlaceholder };
  }
  if (!Object.hasOwn(names, round.createdBy)) {
    names[round.createdBy] = { name: creator.name, placeholder: creator.placeholder };
  }

  const auditStages: EstimateAuditStage[] = stages.map((stage) => {
    const { reveal, question } = stage;
    const guessesMilli: Record<string, number | null> = {};
    const enteredBy: Record<string, string> = {};
    for (const uid of stage.contenders) {
      const row = reveal.results.find((result) => result.uid === uid);
      guessesMilli[uid] = row ? row.guessMilli : null;
      if (row && row.enteredBy !== null) enteredBy[uid] = row.enteredBy;
    }
    return {
      kind: stage.kind,
      questionId: question.id,
      text: { de: question.text.de, en: question.text.en },
      unit: { de: question.unit.de, en: question.unit.en, symbol: question.unit.symbol },
      scale: question.scale,
      format: question.format,
      truthMilli: reveal.truthMilli,
      tolerance: reveal.tolerance === null ? null : { ...reveal.tolerance },
      asOf: reveal.asOf,
      sourceLabel: reveal.source.label,
      sourceUrl: reveal.source.url,
      definition: reveal.definition,
      reason: reveal.reason,
      guessesMilli,
      enteredBy,
      slots: stage.slots,
    };
  });

  return {
    rulesVersion: round.rulesVersion,
    roundId: round.id,
    mode: round.mode,
    createdBy: round.createdBy,
    finishedAt,
    resolvedBy,
    names,
    booked: {
      amountMinor: booked.amountMinor,
      currency: booked.currency,
      loserUids: [...loserUids],
    },
    stages: auditStages,
    shuffled: resolvedBy === "shuffle" && last.reveal.shuffled ? [...last.reveal.shuffled] : null,
  };
}

/**
 * One `EstimateChatLine` per stage that produced at least one payer (with
 * `byLot` flags and name snapshots, so the card never needs `nameOf`). The
 * payers of a stage are in booking order: the certain ones furthest first, the
 * lot's picks last.
 */
export function buildEstimateChatSummary(round: EstimateRound): EstimateChatSummary {
  if (round.resolvedBy === null) throw new Error(`round ${round.id} is not decided: no summary`);
  const lines: EstimateChatLine[] = [];
  for (const stage of round.stages) {
    const { reveal, question } = stage;
    if (reveal === null) continue;
    const byLot = new Set(reveal.lotPayers ?? []);
    const booking = [...reveal.payers, ...(reveal.lotPayers ?? [])];
    if (booking.length === 0) continue;
    lines.push({
      text: { de: question.text.de, en: question.text.en },
      unit: { de: question.unit.de, en: question.unit.en, symbol: question.unit.symbol },
      scale: question.scale,
      format: question.format,
      truthMilli: reveal.truthMilli,
      payers: booking.map((uid) => {
        const row = reveal.results.find((result) => result.uid === uid);
        return {
          uid,
          name: Object.hasOwn(round.entrants, uid) ? round.entrants[uid].displayName : "?",
          guessMilli: row ? row.guessMilli : null,
          distance: row ? row.distance : null,
          byLot: byLot.has(uid),
        };
      }),
    });
  }
  return { resolvedBy: round.resolvedBy, lines };
}

// ---------------------------------------------------------------------------
// Replaying
// ---------------------------------------------------------------------------

function sameSet(a: readonly string[], b: ReadonlySet<string>): boolean {
  return a.length === b.size && a.every((uid) => b.has(uid));
}

/** The rules of version 1 (this document): `null` for an audit that no round could have produced. */
function replayV1(audit: EstimateAudit): string[] | null {
  const { stages } = audit;
  if (stages.length < 1 || stages.length > ESTIMATE_MAX_STECHEN + 1) return null;

  const payers: string[] = [];
  let precedes: readonly EstimatePrecedes[] = [];
  let carried: { contested: string[]; slots: number } | null = null;

  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    if (stage.kind !== (index === 0 ? "main" : "stechen")) return null;
    const contenders = Object.keys(stage.guessesMilli);
    // Later stages are played by exactly the players, and for exactly the slots, the one before left open.
    if (carried !== null) {
      if (stage.slots !== carried.slots || !sameSet(carried.contested, new Set(contenders))) {
        return null;
      }
    }

    const classification = classifyEstimate({
      scale: stage.scale,
      truth: stage.truthMilli,
      tolerance: stage.tolerance,
      entries: contenders.map((uid) => ({ uid, guess: stage.guessesMilli[uid] })),
      payerCount: stage.slots,
      precedes,
    });
    payers.push(...classification.payers);

    const isLast = index === stages.length - 1;
    const { contested, slots } = classification;
    if (!isLast) {
      // The round only goes on while someone is contested — and not when nobody contested ever answered (the lot decides at once).
      if (contested.length === 0) return null;
      if (contested.every((uid) => stage.guessesMilli[uid] === null)) return null;
      carried = { contested, slots };
      precedes = classification.precedes;
      continue;
    }

    if (contested.length === 0) {
      if (audit.shuffled !== null) return null;
      return audit.resolvedBy === (index === 0 ? "distance" : "stechen") ? payers : null;
    }
    // Contested after the last stage: only the lot can have decided it, and its order is on the audit.
    if (audit.resolvedBy !== "shuffle" || audit.shuffled === null) return null;
    if (!sameSet(audit.shuffled, new Set(contested))) return null;
    payers.push(...lotPicks(audit.shuffled, classification.precedes, slots));
    return payers;
  }
  return null;
}

/** Replay per rules version. A later rules fix adds an entry and keeps the old ones, so an old verdict never flips. */
const REPLAYS: Readonly<Record<number, (audit: EstimateAudit) => string[] | null>> = {
  [ESTIMATE_RULES_VERSION]: replayV1,
};

/**
 * Re-runs `classifyEstimate` per stage, dispatching on `audit.rulesVersion`;
 * the payers in booking order (every stage's certain payers furthest first,
 * the lot's picks last). It carries each stage's `precedes` into the next one
 * exactly like the server does, and for the last stage's lot checks that
 * `audit.shuffled` is a permutation of the contested players. `null` if the
 * audit is internally impossible (a stage that does not follow from the one
 * before, a lot without an order, a resolution that contradicts the ranking,
 * an invalid number) or its `rulesVersion` is unknown. Never throws.
 */
export function replayEstimateAudit(audit: EstimateAudit): string[] | null {
  const replay = Object.hasOwn(REPLAYS, audit.rulesVersion) ? REPLAYS[audit.rulesVersion] : null;
  if (replay === null) return null;
  try {
    return replay(audit);
  } catch {
    // A tampered or malformed audit (non-numeric guess, a pair naming nobody, ...) is "impossible", never an exception in the UI.
    return null;
  }
}

/**
 * SELF-CONSISTENCY: the replay deep-equals `audit.booked.loserUids` (same set,
 * same order — the order is the order the bill was split in). Never looks at
 * the expense.
 */
export function verifyEstimateAudit(audit: EstimateAudit): boolean {
  const replayed = replayEstimateAudit(audit);
  const booked = audit.booked.loserUids;
  return (
    replayed !== null &&
    Array.isArray(booked) &&
    replayed.length === booked.length &&
    replayed.every((uid, index) => uid === booked[index])
  );
}

// ---------------------------------------------------------------------------
// Comparing with the live expense
// ---------------------------------------------------------------------------

/**
 * Checks the live expense against the audit. Never compares uids one-to-one:
 * `claimPlaceholder` rewrites `paidBy` / `splits` but not `expense.game`, so a
 * claimed placeholder keeps its old uid in `audit.names`.
 *
 * - `payers`: the uids that pay (a positive split) equal `audit.booked.loserUids`
 *   as sets, or every uid that does not match is a placeholder of the audit
 *   that an outsider took over (equally many on both sides; the new uids are
 *   unknown to the audit). A forged payer still fails.
 * - `equalSplit` (the money check): same currency, and the positive split
 *   amounts are exactly `splitEqual(expense.amountMinor, <the paying uids>)`.
 * - `amountChanged`: information only; a typo fix that keeps the equal split is fine.
 */
export function compareEstimateAuditToExpense(
  audit: EstimateAudit,
  expense: Pick<Expense, "amountMinor" | "currency" | "splits">,
): { payers: boolean; equalSplit: boolean; amountChanged: boolean } {
  const amountChanged = expense.amountMinor !== audit.booked.amountMinor;
  const entries = Object.entries(expense.splits);
  const amounts = entries.map(([, split]) => split.amountMinor);
  if (amounts.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    return { payers: false, equalSplit: false, amountChanged };
  }
  const expensePayers = entries.filter(([, split]) => split.amountMinor > 0).map(([uid]) => uid);

  const auditPayers = new Set(audit.booked.loserUids);
  const expenseSet = new Set(expensePayers);
  const unmatchedAudit = [...auditPayers].filter((uid) => !expenseSet.has(uid));
  const unmatchedExpense = expensePayers.filter((uid) => !auditPayers.has(uid));
  const payers =
    auditPayers.size === audit.booked.loserUids.length &&
    unmatchedAudit.length === unmatchedExpense.length &&
    unmatchedAudit.every(
      (uid) => Object.hasOwn(audit.names, uid) && audit.names[uid].placeholder === true,
    ) &&
    unmatchedExpense.every((uid) => !Object.hasOwn(audit.names, uid));

  let equalSplit = false;
  if (
    expense.currency === audit.booked.currency &&
    expensePayers.length > 0 &&
    Number.isSafeInteger(expense.amountMinor)
  ) {
    const expected = Object.values(splitEqual(expense.amountMinor, expensePayers)).sort(
      (a, b) => a - b,
    );
    const actual = amounts.filter((amount) => amount > 0).sort((a, b) => a - b);
    equalSplit = expected.length === actual.length && expected.every((v, i) => v === actual[i]);
  }
  return { payers, equalSplit, amountChanged };
}
