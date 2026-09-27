/**
 * Read-only, per-person interpretation of a tournament bracket for the
 * tournament screen: what winning or losing a given match means, where each
 * entrant stands right now, and how far along the whole bracket is.
 *
 * Nothing here decides anything — `tournament-bracket.ts` does that. These
 * helpers only restate its rules (`recordMatchResult`'s "who advances",
 * `bracketLoserUids`' "who pays") from one person's point of view, so the
 * screen can say "you're safe" or "you pay" with the exact same logic the
 * payout uses. Pure and deterministic, like the engine itself.
 */

import type { Tournament, TournamentAdvance, TournamentMatch } from "@/lib/types";

/** What a match result means for one of its two players. */
export type MatchFate = "safe" | "pays" | "advances";

/**
 * What winning and what losing `match` means — the same interpretation
 * `recordMatchResult` (who advances) and `bracketLoserUids` (who pays) apply.
 * In `"loser"` mode every winner is safe and only a tree final's loser pays;
 * in `"winner"` mode every loser pays and only a tree final's winner is safe.
 */
export function matchFates(
  advance: TournamentAdvance,
  match: Pick<TournamentMatch, "next">,
): { win: MatchFate; loss: MatchFate } {
  const isFinal = match.next === null;
  return advance === "loser"
    ? { win: "safe", loss: isFinal ? "pays" : "advances" }
    : { win: isFinal ? "safe" : "advances", loss: "pays" };
}

/** A decided match's fate for `uid`, or `undefined` if the match isn't decided or `uid` didn't play it. */
export function fateInMatch(
  advance: TournamentAdvance,
  match: TournamentMatch,
  uid: string,
): MatchFate | undefined {
  if (!match.result) return undefined;
  const fates = matchFates(advance, match);
  if (match.result.winnerUid === uid) return fates.win;
  if (match.result.loserUid === uid) return fates.loss;
  return undefined;
}

export type EntrantStanding =
  | { kind: "safe"; decidedIn: TournamentMatch }
  | { kind: "pays"; decidedIn: TournamentMatch }
  /** Still in the bracket: `match` is the one undecided match they sit in (ready, playing, or waiting on an opponent). */
  | { kind: "active"; match: TournamentMatch };

type BracketView = Pick<Tournament, "advance" | "matches">;

/**
 * Where `uid` stands right now, or `null` if they aren't in this bracket at
 * all (a spectator). An entrant is always in exactly one of: decided
 * (safe/pays), or sitting in exactly one undecided match — the bracket
 * places a player into their next match the moment their previous one ends.
 */
export function entrantStanding(tournament: BracketView, uid: string): EntrantStanding | null {
  const matches = Object.values(tournament.matches);
  for (const match of matches) {
    const fate = fateInMatch(tournament.advance, match, uid);
    if (fate === "safe") return { kind: "safe", decidedIn: match };
    if (fate === "pays") return { kind: "pays", decidedIn: match };
  }
  const current = matches.find((match) => match.status !== "done" && match.players.includes(uid));
  return current ? { kind: "active", match: current } : null;
}

/**
 * For a match that's still waiting on one of its players: the match that
 * player will come out of (the other slot's source), or `null` if both slots
 * are already known or the open slot is somehow not fed by a match.
 */
export function pendingSourceMatch(
  tournament: Pick<Tournament, "matches">,
  match: TournamentMatch,
): TournamentMatch | null {
  const openSlot = match.players.findIndex((uid) => uid === null);
  if (openSlot === -1) return null;
  const source = match.sources[openSlot];
  return source.kind === "match" ? (tournament.matches[source.matchId] ?? null) : null;
}

export interface BracketProgress {
  doneCount: number;
  totalCount: number;
  /** The lowest round that still has an undecided match — "where the action is". `null` once everything is decided. */
  currentRound: number | null;
  /** The tallest tree's round count — for "Runde 2 von 3". */
  roundCount: number;
}

export function bracketProgress(tournament: Pick<Tournament, "matches">): BracketProgress {
  const matches = Object.values(tournament.matches);
  const open = matches.filter((match) => match.status !== "done");
  return {
    doneCount: matches.length - open.length,
    totalCount: matches.length,
    currentRound: open.length > 0 ? Math.min(...open.map((match) => match.round)) : null,
    roundCount: matches.length > 0 ? Math.max(...matches.map((match) => match.round)) : 0,
  };
}
