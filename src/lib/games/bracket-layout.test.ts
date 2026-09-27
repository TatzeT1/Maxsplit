import { describe, expect, it } from "vitest";
import { layoutTree } from "./bracket-layout";
import { MAX_TOURNAMENT_ENTRANTS, createBracket } from "./tournament-bracket";

function pool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

describe("layoutTree", () => {
  for (let n = 2; n <= MAX_TOURNAMENT_ENTRANTS; n++) {
    for (const k of [1, Math.max(1, Math.floor(n / 2)), n - 1]) {
      it(`n=${n} k=${k}: every tree's layout is internally consistent`, () => {
        const state = createBracket(pool(n), k);
        for (const [treeIndex, tree] of state.trees.entries()) {
          const treeMatches = Object.values(state.matches).filter((m) => m.treeIndex === treeIndex);
          const layout = layoutTree(treeMatches);

          // Round-1 rows are the integers 0..count-1, one per round-1 match.
          const round1Rows = layout.nodes.filter((n2) => n2.round === 1).map((n2) => n2.row);
          expect(new Set(round1Rows)).toEqual(new Set(round1Rows.map((_, i) => i)));
          expect(layout.rowCount).toBe(round1Rows.length);

          // Every match except the tree's final has exactly one outgoing edge, to its own `next`.
          const byId = new Map(treeMatches.map((m) => [m.id, m]));
          for (const match of treeMatches) {
            const outgoing = layout.edges.filter((e) => e.fromMatchId === match.id);
            if (match.id === tree.finalMatchId) {
              expect(outgoing).toHaveLength(0);
            } else {
              expect(outgoing).toHaveLength(1);
              expect(outgoing[0].toMatchId).toBe(match.next!.matchId);
            }
          }

          // A match's row is the average of its match-sources' rows (or equal
          // to the single one, when the other source is a bye).
          for (const node of layout.nodes) {
            const match = byId.get(node.matchId)!;
            const sourceRows = match.sources
              .filter((s): s is { kind: "match"; matchId: string } => s.kind === "match")
              .map((s) => layout.nodes.find((n2) => n2.matchId === s.matchId)!.row);
            if (sourceRows.length === 2) {
              expect(node.row).toBeCloseTo((sourceRows[0] + sourceRows[1]) / 2);
            } else if (sourceRows.length === 1) {
              expect(node.row).toBeCloseTo(sourceRows[0]);
            }
          }

          expect(layout.maxRound).toBe(Math.max(...treeMatches.map((m) => m.round)));
        }
      });
    }
  }
});
