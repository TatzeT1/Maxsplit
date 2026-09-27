/**
 * Pure geometry for drawing one tournament tree (`tournament-bracket.ts`'s
 * output) as a real bracket: a row position per match, centered recursively
 * between the two matches that feed into it — the same "cascading" layout
 * every tournament bracket diagram uses — plus the parent/child edges to
 * connect with lines. No pixels and no DOM here; `BracketView` maps rows and
 * rounds onto actual coordinates.
 */

import type { TournamentMatch } from "@/lib/types";

export interface BracketNode {
  matchId: string;
  round: number;
  /** 0-based row in row-height units. Round-1 matches get integers (0, 1, 2, …); a later round's match is centered between its two feeders, so its row is often fractional (e.g. 0.5). */
  row: number;
}

export interface BracketEdge {
  fromMatchId: string;
  toMatchId: string;
}

export interface TreeLayout {
  nodes: BracketNode[];
  edges: BracketEdge[];
  maxRound: number;
  /** Row-1's match count — the tree's height in row-units, for sizing the drawing. */
  rowCount: number;
}

/** Extracts the ascending build-order suffix (`t0m3` -> 3) — stable, deterministic left-to-right order for a tree's own round-1 matches, since `tournament-bracket.ts` builds a tree's left subtree fully before its right one. */
function buildSequence(matchId: string): number {
  const match = /m(\d+)$/.exec(matchId);
  return match ? Number(match[1]) : 0;
}

/** `matches` must all belong to the same tree (caller filters by `treeIndex`). */
export function layoutTree(matches: TournamentMatch[]): TreeLayout {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const rowById = new Map<string, number>();

  const round1 = matches
    .filter((match) => match.round === 1)
    .sort((a, b) => buildSequence(a.id) - buildSequence(b.id));
  round1.forEach((match, index) => rowById.set(match.id, index));

  function rowFor(match: TournamentMatch): number {
    const cached = rowById.get(match.id);
    if (cached !== undefined) return cached;
    const childRows = match.sources
      .filter((source): source is { kind: "match"; matchId: string } => source.kind === "match")
      .map((source) => rowFor(byId.get(source.matchId)!));
    // A bye source (an entrant, not a match) has no row of its own — the
    // match just inherits its single real feeder's row instead of averaging.
    const row = childRows.length === 2 ? (childRows[0] + childRows[1]) / 2 : childRows[0];
    rowById.set(match.id, row);
    return row;
  }

  const edges: BracketEdge[] = [];
  for (const match of matches) {
    rowFor(match);
    if (match.next) edges.push({ fromMatchId: match.id, toMatchId: match.next.matchId });
  }

  return {
    nodes: matches.map((match) => ({
      matchId: match.id,
      round: match.round,
      row: rowById.get(match.id)!,
    })),
    edges,
    maxRound: Math.max(...matches.map((match) => match.round)),
    rowCount: round1.length,
  };
}
