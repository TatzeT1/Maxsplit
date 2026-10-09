import type {
  EstimateDistance,
  EstimatePrecedes,
  EstimateReveal,
  EstimateResultRow,
  EstimateRound,
  EstimateScale,
  EstimateStage,
  EstimateTolerance,
} from "@/lib/types";
import { rowTolerance, rowTruthMilli } from "@/lib/games/estimate-bank/public";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import {
  ESTIMATE_MAX_MILLI,
  ESTIMATE_MAX_STECHEN,
  compareEstimateDistance,
  estimateDistance,
  roundPayers,
  type Milli,
} from "@/lib/games/estimate-input";

/**
 * The ranking and the Stechen state machine of the Schätzfragen game: who is
 * tied by the truth's band, who certainly pays or is certainly safe (by
 * possible rank), who plays the next Stechfrage, when the lot decides. Pure —
 * no clock, no randomness (the shuffle is injected), no React, no Firestore.
 *
 * Server and test only, plus the lazily loaded audit table: this module is the
 * classifier and must stay out of the group page's initial chunk (ESLint and
 * `pnpm check:bank-leak` enforce it). It may import the data-free
 * `estimate-bank/public`, never the bank itself.
 *
 * Everything that decides who pays is exact integer arithmetic on milli-units
 * (spec C.5 - C.8): sums stay below 2^53 (every value is at most
 * `ESTIMATE_MAX_MILLI`), products go through BigInt (`BigInt(x)` calls only —
 * the tsconfig target has no `10n` literals). No float, no logarithm.
 */

export interface EstimateEntry {
  uid: string;
  guess: Milli | null;
}

export interface EstimateRanked {
  uid: string;
  guess: Milli | null;
  distance: EstimateDistance | null;
  /** 1 = furthest. */
  rank: number;
}

export interface EstimateClassification {
  /** Nominal order, furthest first (display and tie-break order only). */
  ranked: EstimateRanked[];
  /** Certain payers, ranked order (furthest first). */
  payers: string[];
  /** Certain safe, ranked order. */
  safe: string[];
  /** Ranked order; the players the Stechfrage is for. */
  contested: string[];
  /** How many of `contested` still have to pay (0 iff contested is empty). */
  slots: number;
  /** Strict facts among `contested` (transitively closed): the relation the NEXT stage must respect. */
  precedes: EstimatePrecedes[];
}

// ---------------------------------------------------------------------------
// The truth's band and the tie predicate (spec C.6)
// ---------------------------------------------------------------------------

/** What `isEstimateTie` and the classifier need of a question, validated once. */
interface Band {
  scale: EstimateScale;
  truth: Milli;
  /** interval: the half-width in milli (0 without tolerance). */
  tau: number;
  /** ratio: `truth^2 * (1000 - p)^2` and `truth^2 * (1000 + p)^2`, the bounds of `10^6 * a * b` (p = permille). */
  low: bigint;
  high: bigint;
}

function assertMilli(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > ESTIMATE_MAX_MILLI) {
    throw new RangeError(`${label} is not an integer milli value in [0, 10^15]: ${String(value)}`);
  }
}

/** Throws `RangeError` for a value that is no valid truth, guess or tolerance for `scale`. */
function makeBand(scale: EstimateScale, truth: Milli, tolerance: EstimateTolerance | null): Band {
  assertMilli(truth, "truth");
  if (scale === "ratio" && truth <= 0)
    throw new RangeError("a ratio question needs a truth above zero");
  if (tolerance !== null && tolerance.kind !== scale) {
    throw new RangeError(`a ${tolerance.kind} tolerance does not fit a ${scale} question`);
  }
  if (scale === "interval") {
    const tau = tolerance?.kind === "interval" ? tolerance.milli : 0;
    assertMilli(tau, "tolerance");
    return { scale, truth, tau, low: BigInt(0), high: BigInt(0) };
  }
  const permille = tolerance?.kind === "ratio" ? tolerance.permille : 0;
  // A band reaching down to 0 (permille >= 1000) is no band of a ratio question.
  if (!Number.isInteger(permille) || permille < 0 || permille > 999) {
    throw new RangeError(`a ratio tolerance is whole permille in [0, 999]: ${String(permille)}`);
  }
  const square = BigInt(truth) * BigInt(truth);
  const down = BigInt(1000 - permille);
  const up = BigInt(1000 + permille);
  return { scale, truth, tau: 0, low: square * down * down, high: square * up * up };
}

function assertGuess(band: Band, guess: Milli | null, label: string): void {
  if (guess === null) return;
  assertMilli(guess, label);
  if (band.scale === "ratio" && guess <= 0) {
    throw new RangeError(`${label} of a ratio question must be above zero`);
  }
}

/** Two real guesses: equal, or the band contains the point at which their errors are equal. */
function tiedGuesses(band: Band, a: Milli, b: Milli): boolean {
  if (a === b) return true;
  if (band.scale === "interval") {
    // Equal errors at the midpoint (a + b) / 2: tied iff it lies in [truth - tau, truth + tau]. All integers < 2^53.
    return Math.abs(a + b - 2 * band.truth) <= 2 * band.tau;
  }
  // Equal errors at the geometric mean sqrt(a*b): tied iff it lies in [truth (1 - p), truth (1 + p)], squared and scaled by 10^6.
  const product = BigInt(1_000_000) * BigInt(a) * BigInt(b);
  return band.low <= product && product <= band.high;
}

/** A missing guess is infinitely far: tied only with another missing one. */
function tiedEntries(band: Band, a: Milli | null, b: Milli | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  return tiedGuesses(band, a, b);
}

/**
 * Two guesses are tied iff the truth's band does not settle who is closer (or
 * they are equal). A missing guess is infinitely far: tied only with another
 * missing one.
 *
 * interval: `a === b || |a + b - 2t| <= 2 tau`. ratio: `a === b ||
 * t^2 (1000 - p)^2 <= 10^6 a b <= t^2 (1000 + p)^2` (p = permille). The
 * errors of two different guesses are equal at exactly one truth: the midpoint
 * for intervals, the geometric mean for ratios.
 */
export function isEstimateTie(input: {
  scale: EstimateScale;
  truth: Milli;
  tolerance: EstimateTolerance | null;
  a: Milli | null;
  b: Milli | null;
}): boolean {
  const band = makeBand(input.scale, input.truth, input.tolerance);
  assertGuess(band, input.a, "a");
  assertGuess(band, input.b, "b");
  return tiedEntries(band, input.a, input.b);
}

/** `a` is further off than `b` at the nominal truth and the two are not tied (checked inputs). */
function strictlyFurther(
  band: Band,
  a: Milli | null,
  b: Milli | null,
  distanceA: EstimateDistance | null,
  distanceB: EstimateDistance | null,
): boolean {
  if (a === null) return b !== null;
  if (b === null || distanceA === null || distanceB === null) return false;
  if (tiedGuesses(band, a, b)) return false;
  // Not tied: the sign of the error gap is the same for every truth in the band, so the nominal truth decides for all.
  return compareEstimateDistance(distanceA, distanceB) > 0;
}

/** `a` is further off than `b` for EVERY truth in the band (and under every tie-break). `false` for a tie. `null` = no guess = infinitely far. */
export function isStrictlyFurther(input: {
  scale: EstimateScale;
  truth: Milli;
  tolerance: EstimateTolerance | null;
  a: Milli | null;
  b: Milli | null;
}): boolean {
  const band = makeBand(input.scale, input.truth, input.tolerance);
  assertGuess(band, input.a, "a");
  assertGuess(band, input.b, "b");
  const distance = (guess: Milli | null) =>
    guess === null ? null : estimateDistance(band.scale, guess, band.truth);
  return strictlyFurther(band, input.a, input.b, distance(input.a), distance(input.b));
}

// ---------------------------------------------------------------------------
// Classification of one stage (spec C.7)
// ---------------------------------------------------------------------------

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Adds the edge `from -> to` to a transitively closed relation (`reach[a * n + b]`), keeping it closed. */
function addClosedEdge(reach: Uint8Array, n: number, from: number, to: number): void {
  const above = [from];
  const below = [to];
  for (let x = 0; x < n; x += 1) {
    if (reach[x * n + from]) above.push(x);
    if (reach[to * n + x]) below.push(x);
  }
  for (const a of above) {
    for (const b of below) reach[a * n + b] = 1;
  }
}

/** Warshall's closure of `reach` in place. */
function closeRelation(reach: Uint8Array, n: number): void {
  for (let via = 0; via < n; via += 1) {
    for (let a = 0; a < n; a += 1) {
      if (!reach[a * n + via]) continue;
      for (let b = 0; b < n; b += 1) {
        if (reach[via * n + b]) reach[a * n + b] = 1;
      }
    }
  }
}

/**
 * Classification of one stage by possible rank. Throws `RangeError` for
 * duplicate uids, a `payerCount` outside `[1, entries.length - 1]`, a ratio
 * guess or truth <= 0, a tolerance of the wrong kind, a non-safe-integer milli,
 * and a `precedes` pair naming an unknown uid or forming a cycle.
 *
 * `R` = "x is certainly further off than y" (for every truth in the band, under
 * every tie-break): the inherited facts, plus every pair of this question that
 * is not tied and does not contradict an inherited fact. A player is a certain
 * payer iff at most `k - 1` others can be at least as far (`n - closer <= k`),
 * certain safe iff at least `k` others are certainly further (`1 + further > k`),
 * contested otherwise. Both tests are exact for the partial order `R`, so
 * exactly `slots` of the contested players pay under any resolution.
 */
export function classifyEstimate(input: {
  scale: EstimateScale;
  truth: Milli;
  tolerance: EstimateTolerance | null;
  entries: readonly EstimateEntry[];
  payerCount: number;
  /** Strict facts settled by earlier stages, among `entries` (default `[]`). */
  precedes?: readonly EstimatePrecedes[];
}): EstimateClassification {
  const { entries, payerCount } = input;
  const n = entries.length;
  const band = makeBand(input.scale, input.truth, input.tolerance);
  if (!Number.isInteger(payerCount) || payerCount < 1 || payerCount > n - 1) {
    throw new RangeError(`payerCount must be in [1, ${n - 1}], got ${String(payerCount)}`);
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.uid)) throw new RangeError(`duplicate uid: ${entry.uid}`);
    seen.add(entry.uid);
    assertGuess(band, entry.guess, `guess of ${entry.uid}`);
  }

  // 1. Nominal order: no guess first (by uid), then furthest first, equal distance -> smaller guess, then uid.
  const rows = entries.map((entry) => ({
    uid: entry.uid,
    guess: entry.guess,
    distance: entry.guess === null ? null : estimateDistance(band.scale, entry.guess, band.truth),
  }));
  rows.sort((x, y) => {
    if (x.distance === null || y.distance === null || x.guess === null || y.guess === null) {
      if (x.distance === null && y.distance === null) return compareText(x.uid, y.uid);
      return x.distance === null ? -1 : 1;
    }
    const byDistance = compareEstimateDistance(x.distance, y.distance);
    if (byDistance !== 0) return -byDistance;
    if (x.guess !== y.guess) return x.guess < y.guess ? -1 : 1;
    return compareText(x.uid, y.uid);
  });
  const ranked: EstimateRanked[] = rows.map((row, index) => ({ ...row, rank: index + 1 }));
  const indexOf = new Map(ranked.map((row, index) => [row.uid, index]));

  // 2. The strict relation R, transitively closed: inherited facts first, then this question's own.
  const reach = new Uint8Array(n * n);
  for (const fact of input.precedes ?? []) {
    const from = indexOf.get(fact.further);
    const to = indexOf.get(fact.closer);
    if (from === undefined || to === undefined) {
      throw new RangeError(`precedes names an unknown uid: ${fact.further} -> ${fact.closer}`);
    }
    reach[from * n + to] = 1;
  }
  closeRelation(reach, n);
  for (let i = 0; i < n; i += 1) {
    if (reach[i * n + i]) throw new RangeError("precedes contains a cycle");
  }
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // An earlier stage's fact is never reversed by a later question; a known pair needs no second look.
      if (reach[j * n + i] || reach[i * n + j]) continue;
      const x = ranked[i];
      const y = ranked[j];
      if (strictlyFurther(band, x.guess, y.guess, x.distance, y.distance)) {
        addClosedEdge(reach, n, i, j);
      }
    }
  }

  // 3-4. Count: who is certainly further / closer, and from that who certainly pays or is certainly safe.
  const payers: string[] = [];
  const safe: string[] = [];
  const contested: string[] = [];
  for (let u = 0; u < n; u += 1) {
    let further = 0;
    let closer = 0;
    for (let other = 0; other < n; other += 1) {
      if (reach[other * n + u]) further += 1;
      if (reach[u * n + other]) closer += 1;
    }
    if (n - closer <= payerCount) payers.push(ranked[u].uid);
    else if (1 + further > payerCount) safe.push(ranked[u].uid);
    else contested.push(ranked[u].uid);
  }
  const slots = payerCount - payers.length;
  // Exact for a partial order (maximum position of u = n - closer, minimum = 1 + further), so this is a bug check, never input.
  if (contested.length === 0 ? slots !== 0 : slots <= 0 || slots >= contested.length) {
    throw new Error(
      `classification invariant broken: ${payers.length} payers, ${contested.length} contested, k = ${payerCount}`,
    );
  }

  // 5. The facts the next stage must respect: R among the contested.
  const isContested = new Set(contested);
  const precedes: EstimatePrecedes[] = [];
  for (let i = 0; i < n; i += 1) {
    if (!isContested.has(ranked[i].uid)) continue;
    for (let j = 0; j < n; j += 1) {
      if (reach[i * n + j] && isContested.has(ranked[j].uid)) {
        precedes.push({ further: ranked[i].uid, closer: ranked[j].uid });
      }
    }
  }
  return { ranked, payers, safe, contested, slots, precedes };
}

// ---------------------------------------------------------------------------
// The lot (spec C.8)
// ---------------------------------------------------------------------------

/**
 * The picks of the lot: walk `shuffled` and take the first player whose
 * certainly-further players are all taken already; do that `slots` times. With
 * no `precedes` this is `shuffled.slice(0, slots)`. A pair that names a player
 * outside `shuffled` constrains nobody in the lot and is ignored.
 */
export function lotPicks(
  shuffled: readonly string[],
  precedes: readonly EstimatePrecedes[],
  slots: number,
): string[] {
  if (!Number.isInteger(slots) || slots < 0 || slots > shuffled.length) {
    throw new RangeError(`cannot pick ${String(slots)} of ${shuffled.length}`);
  }
  const members = new Set(shuffled);
  if (members.size !== shuffled.length) throw new RangeError("the lot holds a player twice");
  const waitsFor = new Map<string, string[]>();
  for (const fact of precedes) {
    if (!members.has(fact.further) || !members.has(fact.closer)) continue;
    const list = waitsFor.get(fact.closer);
    if (list) list.push(fact.further);
    else waitsFor.set(fact.closer, [fact.further]);
  }
  const taken: string[] = [];
  const takenSet = new Set<string>();
  const remaining = [...shuffled];
  while (taken.length < slots) {
    const at = remaining.findIndex((uid) =>
      (waitsFor.get(uid) ?? []).every((x) => takenSet.has(x)),
    );
    if (at < 0) throw new RangeError("precedes contains a cycle");
    const [pick] = remaining.splice(at, 1);
    taken.push(pick);
    takenSet.add(pick);
  }
  return taken;
}

// ---------------------------------------------------------------------------
// Resolving a stage and the Stechen state machine (spec C.8)
// ---------------------------------------------------------------------------

export interface EstimateStageInput {
  /** Provides the payers settled by EARLIER stages (`round.stages[0..stage.index-1].reveal`), the strict facts they left (`precedes`) and the display order. */
  round: Pick<EstimateRound, "order" | "stages" | "targetLoserCount" | "mode">;
  /** Status "guessing". */
  stage: EstimateStage;
  /** The secrets snapshot (the full row). */
  question: EstimateQuestion;
  /** Submitted guesses only; a contender without an entry has no guess. `by`/`at` fill `enteredBy` / `answeredAfterMs` of the result rows. */
  guesses: Record<string, { milli: Milli; at: string; by: string }>;
  /** ISO. */
  now: string;
  reason: EstimateReveal["reason"];
  /** False iff the bank has no eligible Stechfrage left (the caller checks BEFORE resolving). A contested stage then resolves by lot instead of failing the transaction. */
  stechenAvailable: boolean;
  /** Injected: `secureShuffle` in production, reversed/identity in tests. */
  shuffle: <T>(items: T[]) => T[];
}

export interface EstimateStageResolution {
  reveal: EstimateReveal;
  /** Iff `reveal.next === "stechen"`; the caller draws the question. */
  stechen: { contenders: string[]; slots: number } | null;
  /** Iff `reveal.next !== "stechen"`. */
  decided: {
    loserUids: string[];
    resolvedBy: "distance" | "stechen" | "shuffle";
  } | null;
}

/** `guess.at - stage.openedAt` for an online round, `null` for a local one or without a guess; never negative. */
function answeredAfterMs(
  mode: EstimateRound["mode"],
  guess: { at: string } | undefined,
  openedAt: string,
): number | null {
  if (mode !== "online" || guess === undefined) return null;
  const elapsed = Date.parse(guess.at) - Date.parse(openedAt);
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : null;
}

/**
 * Classifies a guessing stage and decides what happens next: decided, a
 * Stechfrage for the contested players, or the lot. See spec C.8 for the state
 * machine. Throws `Error` on a caller bug (a stage that is not guessing, the
 * wrong secrets, a shuffle that is no permutation, a payer count that does not
 * add up) and `RangeError` on invalid numbers — never returns a half-resolved
 * stage.
 */
export function resolveEstimateStage(input: EstimateStageInput): EstimateStageResolution {
  const { round, stage, question, guesses, now, reason, stechenAvailable, shuffle } = input;
  if (stage.status !== "guessing") throw new Error("only a guessing stage can be resolved");
  if (question.id !== stage.question.id) {
    throw new Error(`the secrets hold ${question.id}, the stage asks ${stage.question.id}`);
  }
  const earlier = round.stages.slice(0, stage.index);
  if (
    earlier.length !== stage.index ||
    earlier.some((earlierStage) => earlierStage.reveal === null)
  ) {
    throw new Error("every stage before this one must be revealed");
  }
  const previous = earlier[earlier.length - 1]?.reveal ?? null;

  const classification = classifyEstimate({
    scale: question.scale,
    truth: rowTruthMilli(question),
    tolerance: rowTolerance(question),
    entries: stage.contenders.map((uid) => ({
      uid,
      guess: Object.hasOwn(guesses, uid) ? guesses[uid].milli : null,
    })),
    payerCount: stage.slots,
    precedes: previous ? previous.precedes : [],
  });
  const { ranked, payers, safe, contested, slots, precedes } = classification;

  const fates = new Map<string, EstimateResultRow["fate"]>();
  for (const uid of payers) fates.set(uid, "pays");
  for (const uid of safe) fates.set(uid, "safe");
  for (const uid of contested) fates.set(uid, "contested");
  const results: EstimateResultRow[] = ranked.map((row) => {
    const guess = Object.hasOwn(guesses, row.uid) ? guesses[row.uid] : undefined;
    return {
      uid: row.uid,
      guessMilli: row.guess,
      distance: row.distance,
      rank: row.rank,
      fate: fates.get(row.uid) ?? "contested",
      enteredBy: guess === undefined || guess.by === row.uid ? null : guess.by,
      answeredAfterMs: answeredAfterMs(round.mode, guess, stage.openedAt),
    };
  });

  // The band, not an exact tie, keeps two players contested iff some contested distances differ.
  const contestedDistances = ranked.flatMap((row) =>
    fates.get(row.uid) === "contested" && row.distance !== null ? [row.distance] : [],
  );
  const bandTie = contestedDistances.some(
    (distance) => compareEstimateDistance(contestedDistances[0], distance) !== 0,
  );

  let next: EstimateReveal["next"];
  if (contested.length === 0) next = "decided";
  else if (contestedDistances.length === 0)
    next = "shuffle"; // nobody contested ever answered: no second chance
  else if (stage.index >= ESTIMATE_MAX_STECHEN) next = "shuffle";
  else if (!stechenAvailable) next = "shuffle";
  else next = "stechen";

  let shuffled: string[] | null = null;
  let lotPayers: string[] | null = null;
  if (next === "shuffle") {
    const order = shuffle([...contested]);
    const isPermutation =
      order.length === contested.length &&
      new Set(order).size === contested.length &&
      contested.every((uid) => order.includes(uid));
    if (!isPermutation)
      throw new Error("the shuffle must return a permutation of the contested players");
    shuffled = order;
    lotPayers = lotPicks(order, precedes, slots);
  }

  const primary =
    question.sources.find((source) => source.kind === "primary") ?? question.sources[0];
  if (!primary) throw new Error(`question ${question.id} has no source`);
  const reveal: EstimateReveal = {
    revealedAt: now,
    reason,
    truthMilli: rowTruthMilli(question),
    tolerance: rowTolerance(question),
    asOf: question.asOf,
    source: { label: primary.label, url: primary.url },
    sources: question.sources.map((source) => ({
      label: source.label,
      url: source.url,
      kind: source.kind,
    })),
    definition: question.definition,
    note: question.note ?? null,
    results,
    payers,
    safe,
    contested,
    slotsLeft: slots,
    precedes,
    bandTie,
    next,
    shuffled,
    lotPayers,
  };

  if (next === "stechen") {
    return { reveal, stechen: { contenders: [...contested], slots }, decided: null };
  }
  const loserUids = roundPayers([...earlier, { ...stage, status: "revealed", reveal }]);
  if (loserUids.length !== round.targetLoserCount || new Set(loserUids).size !== loserUids.length) {
    throw new Error(
      `the round decided ${loserUids.length} payers for a target of ${round.targetLoserCount}`,
    );
  }
  const resolvedBy = next === "shuffle" ? "shuffle" : stage.index === 0 ? "distance" : "stechen";
  return { reveal, stechen: null, decided: { loserUids, resolvedBy } };
}
