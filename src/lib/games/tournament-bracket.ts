/**
 * Pure bracket engine for the "Turniermodus" — a real tournament tree for the
 * four duel mini-games (Tic-Tac-Toe, Connect Four, Memory-Duell,
 * Reaktionsduell), as an alternative to the knockout ladder
 * (`knockout-ladder.ts`) for pools of 3 or more. Unlike the ladder, a
 * bracket's matches within a round are mutually independent, so several
 * pairs can play their own match on their own device at the same time —
 * that parallelism is the whole point.
 *
 * No randomness and no `Date.now()` live here: the caller draws the shuffled
 * `seedOrder` (via `secureShuffle`, server-side — see
 * `lib/actions/tournaments.ts`) and passes in every timestamp, so this stays
 * fully deterministic and unit-testable, the same way `knockout-ladder.ts` is.
 *
 * ## Bracket shape
 *
 * The pool is split into one or more independent "trees" (contiguous chunks
 * of `seedOrder`), each built as a balanced binary tree of matches over its
 * entrants (`buildTree`): a lone entrant is a bye that free-advances to its
 * parent match; two entrants are a leaf match; more than two are split at the
 * even size nearest half (ties favor the larger side) and built recursively.
 * This is the same shape regardless of who "should" advance — that part is
 * `advance` below, applied only when a result comes in.
 *
 * ## Who pays
 *
 * `advance` picks itself from how many people should pay (`targetLoserCount`
 * of `poolSize`), automatically, in `planBracket`/`createBracket`:
 *
 * - `"loser"` ("Verlierer spielt weiter"), when `targetLoserCount <=
 *   poolSize / 2`: a match's WINNER is safe and done; the LOSER keeps
 *   playing. The pool is split into `targetLoserCount` trees, and each
 *   tree's *final* loser is the one who pays — so everyone plays at least
 *   once, and a person can only ever lose the specific match that ends their
 *   tree's run.
 * - `"winner"` (classic), when `targetLoserCount > poolSize / 2`: a match's
 *   LOSER is immediately locked in as a payer; the WINNER advances. The pool
 *   is split into `poolSize - targetLoserCount` trees, and each tree's
 *   champion goes free.
 *
 * Both modes use the exact same tree shape and produce exactly
 * `targetLoserCount` payers; only the interpretation of a result differs,
 * which is why `recordMatchResult` is the only place `advance` is read.
 */

import type {
  Tournament,
  TournamentAdvance,
  TournamentMatch,
  TournamentMatchStatus,
  TournamentSlotSource,
} from "@/lib/types";

/** Firestore documents stay small and legible; also caps a tree's height for the drawing. */
export const MAX_TOURNAMENT_ENTRANTS = 32;

export type BracketState = Pick<
  Tournament,
  "advance" | "targetLoserCount" | "trees" | "matches" | "seedOrder"
>;

export type BracketError = {
  error:
    | "match-not-found"
    | "match-not-ready"
    | "match-claimed"
    | "match-finished"
    | "claim-lost"
    | "invalid-winner";
};

export interface BracketPlan {
  advance: TournamentAdvance;
  treeSizes: number[];
  matchCount: number;
  roundCount: number;
  /** How many matches can be played at once, right at the start — the "10 Leute, mehrere Spiele gleichzeitig" number. */
  maxParallel: number;
}

/** At least one person has to stay unbeaten, same rule the knockout ladder uses for its "how many pay" stepper. */
export function maxTournamentLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

function pickAdvance(poolSize: number, targetLoserCount: number): TournamentAdvance {
  return targetLoserCount <= Math.floor(poolSize / 2) ? "loser" : "winner";
}

function treeCountFor(
  advance: TournamentAdvance,
  poolSize: number,
  targetLoserCount: number,
): number {
  return advance === "loser" ? targetLoserCount : poolSize - targetLoserCount;
}

/** Splits `total` into `parts` contiguous sizes, as even as possible (difference <= 1), larger parts first. */
function partitionSizes(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const remainder = total % parts;
  return Array.from({ length: parts }, (_, i) => (i < remainder ? base + 1 : base));
}

/** The even split of `len` closest to `len / 2`; a tie (both even neighbors equidistant) favors the larger (left) side. */
function evenSplit(len: number): [number, number] {
  const half = len / 2;
  const lower = Math.floor(half / 2) * 2;
  const upper = lower + 2;
  const distLower = half - lower;
  const distUpper = upper - half;
  const left = distUpper <= distLower ? upper : lower;
  return [left, len - left];
}

function refPlayer(ref: TournamentSlotSource): string | null {
  return ref.kind === "entrant" ? ref.uid : null;
}

/** Recursively builds one tree's matches over `entrants`, mutating `matches`. Returns the root (final match) reference and its height. */
function buildTree(
  entrants: string[],
  treeIndex: number,
  counter: { n: number },
  matches: Record<string, TournamentMatch>,
): { ref: TournamentSlotSource; height: number } {
  if (entrants.length === 1) {
    return { ref: { kind: "entrant", uid: entrants[0] }, height: 0 };
  }

  let left: { ref: TournamentSlotSource; height: number };
  let right: { ref: TournamentSlotSource; height: number };
  if (entrants.length === 2) {
    left = { ref: { kind: "entrant", uid: entrants[0] }, height: 0 };
    right = { ref: { kind: "entrant", uid: entrants[1] }, height: 0 };
  } else {
    const [leftSize] = evenSplit(entrants.length);
    left = buildTree(entrants.slice(0, leftSize), treeIndex, counter, matches);
    right = buildTree(entrants.slice(leftSize), treeIndex, counter, matches);
  }

  const id = `t${treeIndex}m${counter.n++}`;
  const height = 1 + Math.max(left.height, right.height);
  const players: [string | null, string | null] = [refPlayer(left.ref), refPlayer(right.ref)];
  const status: TournamentMatchStatus = players[0] && players[1] ? "ready" : "waiting";

  matches[id] = {
    id,
    treeIndex,
    round: height,
    sources: [left.ref, right.ref],
    players,
    next: null,
    status,
    claim: null,
    result: null,
  };
  if (left.ref.kind === "match") matches[left.ref.matchId].next = { matchId: id, slot: 0 };
  if (right.ref.kind === "match") matches[right.ref.matchId].next = { matchId: id, slot: 1 };

  return { ref: { kind: "match", matchId: id }, height };
}

/** A quick summary for the setup step — "4 Runden · 9 Spiele · bis zu 5 gleichzeitig". */
export function planBracket(poolSize: number, targetLoserCount: number): BracketPlan {
  const advance = pickAdvance(poolSize, targetLoserCount);
  const treeCount = treeCountFor(advance, poolSize, targetLoserCount);
  const treeSizes = partitionSizes(poolSize, treeCount);
  return {
    advance,
    treeSizes,
    matchCount: poolSize - treeCount,
    roundCount: Math.max(...treeSizes.map((size) => Math.ceil(Math.log2(Math.max(size, 1))))),
    maxParallel: treeSizes.reduce((sum, size) => sum + Math.floor(size / 2), 0),
  };
}

/** `seedOrder` must already be shuffled — see the module doc. */
export function createBracket(seedOrder: string[], targetLoserCount: number): BracketState {
  const advance = pickAdvance(seedOrder.length, targetLoserCount);
  const treeCount = treeCountFor(advance, seedOrder.length, targetLoserCount);
  const sizes = partitionSizes(seedOrder.length, treeCount);

  const matches: Record<string, TournamentMatch> = {};
  const trees: BracketState["trees"] = [];
  let offset = 0;
  for (let treeIndex = 0; treeIndex < treeCount; treeIndex++) {
    const size = sizes[treeIndex];
    const entrantUids = seedOrder.slice(offset, offset + size);
    offset += size;
    const built = buildTree(entrantUids, treeIndex, { n: 0 }, matches);
    if (built.ref.kind !== "match") {
      throw new Error("A tree of size >= 2 must resolve to a final match");
    }
    trees.push({ entrantUids, finalMatchId: built.ref.matchId });
  }

  return { advance, targetLoserCount, trees, matches, seedOrder };
}

export function claimMatch(
  state: BracketState,
  matchId: string,
  claim: { byUid: string; claimId: string; claimedAt: string },
  opts: { takeover: boolean },
): BracketState | BracketError {
  const match = state.matches[matchId];
  if (!match) return { error: "match-not-found" };
  if (match.status === "done") return { error: "match-finished" };
  if (match.status === "waiting") return { error: "match-not-ready" };
  if (match.status === "playing" && !opts.takeover) return { error: "match-claimed" };
  return {
    ...state,
    matches: { ...state.matches, [matchId]: { ...match, status: "playing", claim } },
  };
}

export function releaseMatch(
  state: BracketState,
  matchId: string,
  claimId: string,
): BracketState | BracketError {
  const match = state.matches[matchId];
  if (!match) return { error: "match-not-found" };
  if (!match.claim || match.claim.claimId !== claimId) return { error: "claim-lost" };
  return {
    ...state,
    matches: { ...state.matches, [matchId]: { ...match, status: "ready", claim: null } },
  };
}

/** Idempotent for a repeat report with the same `claimId` and `winnerUid` (a network retry after the first one actually landed). */
export function recordMatchResult(
  state: BracketState,
  matchId: string,
  report: { claimId: string; winnerUid: string; attempts: number; reportedBy: string; at: string },
): BracketState | BracketError {
  const match = state.matches[matchId];
  if (!match) return { error: "match-not-found" };
  if (match.status === "done") {
    const same =
      match.result &&
      match.claim?.claimId === report.claimId &&
      match.result.winnerUid === report.winnerUid;
    return same ? state : { error: "match-finished" };
  }
  if (!match.claim || match.claim.claimId !== report.claimId) return { error: "claim-lost" };
  const [a, b] = match.players;
  if (report.winnerUid !== a && report.winnerUid !== b) return { error: "invalid-winner" };
  const loserUid = (report.winnerUid === a ? b : a) as string;

  let matches: Record<string, TournamentMatch> = {
    ...state.matches,
    [matchId]: {
      ...match,
      status: "done",
      result: {
        winnerUid: report.winnerUid,
        loserUid,
        attempts: report.attempts,
        reportedBy: report.reportedBy,
        finishedAt: report.at,
      },
    },
  };

  if (match.next) {
    const advancingUid = state.advance === "loser" ? loserUid : report.winnerUid;
    const nextMatch = matches[match.next.matchId];
    const nextPlayers = [...nextMatch.players] as [string | null, string | null];
    nextPlayers[match.next.slot] = advancingUid;
    const nextStatus: TournamentMatchStatus =
      nextPlayers[0] && nextPlayers[1] ? "ready" : "waiting";
    matches = {
      ...matches,
      [match.next.matchId]: { ...nextMatch, players: nextPlayers, status: nextStatus },
    };
  }

  return { ...state, matches };
}

export function isBracketFinished(state: BracketState): boolean {
  return Object.values(state.matches).every((match) => match.status === "done");
}

/**
 * Elimination order: in `"loser"` mode, only a tree's final-match loser pays;
 * in `"winner"` mode, every match's loser pays. Ordered by `finishedAt`, ties
 * broken by `seedOrder` — matters because `splitEqual` breaks its own
 * rounding-remainder ties by input order.
 */
export function bracketLoserUids(state: BracketState): string[] {
  const payerMatches = Object.values(state.matches).filter(
    (match): match is TournamentMatch & { result: NonNullable<TournamentMatch["result"]> } =>
      match.result !== null && (state.advance === "winner" || match.next === null),
  );
  payerMatches.sort((a, b) => {
    const byTime = a.result.finishedAt.localeCompare(b.result.finishedAt);
    if (byTime !== 0) return byTime;
    return state.seedOrder.indexOf(a.result.loserUid) - state.seedOrder.indexOf(b.result.loserUid);
  });
  return payerMatches.map((match) => match.result.loserUid);
}
