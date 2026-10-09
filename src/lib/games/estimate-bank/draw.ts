/**
 * Drawing a question: "Immer andere Fragen". Pure and data-free (no
 * `server-only` import): the bank and the shuffle are passed in, so the
 * server hands over `ESTIMATE_BANK` and `secureShuffle` and the tests hand
 * over a fixture and a deterministic shuffle. Never `Math.random`.
 *
 * The seen-set is updated at DRAW time — a question counts as seen the moment
 * it is shown — inside the transaction that writes the round, so two
 * concurrent rounds cannot get the same question or lose each other's update.
 * It exists so a group is not shown the same question twice in a row, not to
 * hide anything: the bank is public (docs/DECISIONS.md, ADR-006).
 */
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";

export interface EstimateDrawInput {
  bank: readonly EstimateQuestion[];
  /** `groups/{g}/estimateState/seen.seenIds` (chronological; `[]` when the document is missing). */
  seen: readonly string[];
  includeFun: boolean;
  /** Ids already used in THIS round (the main question and earlier Stechfragen). */
  exclude: readonly string[];
  /** Stechfrage: a question without a tolerance band is a cleaner tie-break. */
  preferNoTolerance?: boolean;
  /** `secureShuffle` in production — crypto randomness, never `Math.random`. */
  shuffle: <T>(items: T[]) => T[];
}

export interface EstimateDrawResult {
  question: EstimateQuestion;
  /** The NEW seen-set to store. */
  seen: string[];
  /** True iff the eligible pool was exhausted and restarted. */
  reset: boolean;
}

/** The eligible pool is empty even ignoring `seen`: a misconfigured bank. */
export class EstimatePoolEmptyError extends Error {
  constructor(message = "no eligible estimate question") {
    super(message);
    this.name = "EstimatePoolEmptyError";
  }
}

/** After a reset, how many of the latest eligible ids stay "seen" so the question played last cannot come straight back. */
const RECENT_KEPT_MAX = 10;

function eligibleRows(
  input: Pick<EstimateDrawInput, "bank" | "includeFun" | "exclude">,
): EstimateQuestion[] {
  const excluded = new Set(input.exclude);
  return input.bank.filter(
    (row) => (input.includeFun || row.tone === "standard") && !excluded.has(row.id),
  );
}

/**
 * True iff a draw with these arguments cannot throw (the eligible pool,
 * ignoring `seen`, is not empty). `finishStage` asks this BEFORE resolving a
 * stage, so a missing Stechfrage becomes a lot, never a failed transaction.
 */
export function hasEligibleStechfrage(
  input: Pick<EstimateDrawInput, "bank" | "includeFun" | "exclude">,
): boolean {
  return eligibleRows(input).length > 0;
}

/**
 * Draws without replacement from the unseen eligible rows; when none is left,
 * the eligible pool restarts (`reset: true`) — minus the most recent ones, and
 * without forgetting which rows of the OTHER tone were seen.
 */
export function drawEstimateQuestion(input: EstimateDrawInput): EstimateDrawResult {
  const eligible = eligibleRows(input);
  if (eligible.length === 0) throw new EstimatePoolEmptyError();

  // Prune ids the bank no longer knows (retired or removed), and duplicates (keep the latest).
  const known = new Set(input.bank.map((row) => row.id));
  const seenBase = input.seen.filter(
    (id, index, all) => known.has(id) && all.lastIndexOf(id) === index,
  );
  const seenSet = new Set(seenBase);
  const unseen = eligible.filter((row) => !seenSet.has(row.id));

  let pool: EstimateQuestion[];
  let base: string[];
  let reset: boolean;
  if (unseen.length > 0) {
    pool = unseen;
    base = seenBase;
    reset = false;
  } else {
    reset = true;
    const eligibleIds = new Set(eligible.map((row) => row.id));
    const keep = Math.min(RECENT_KEPT_MAX, Math.floor(eligible.length / 4));
    const recent = keep > 0 ? seenBase.filter((id) => eligibleIds.has(id)).slice(-keep) : [];
    const recentSet = new Set(recent);
    pool = eligible.filter((row) => !recentSet.has(row.id));
    base = [...seenBase.filter((id) => !eligibleIds.has(id)), ...recent];
  }

  if (input.preferNoTolerance && pool.some((row) => !row.tolerance)) {
    pool = pool.filter((row) => !row.tolerance);
  }

  const question = input.shuffle([...pool])[0];
  return { question, seen: [...base, question.id], reset };
}
