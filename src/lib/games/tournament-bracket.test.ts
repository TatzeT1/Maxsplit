import { describe, expect, it } from "vitest";
import {
  MAX_TOURNAMENT_ENTRANTS,
  bracketLoserUids,
  claimMatch,
  createBracket,
  isBracketFinished,
  maxTournamentLoserCount,
  planBracket,
  recordMatchResult,
  releaseMatch,
  type BracketState,
} from "./tournament-bracket";
import type { TournamentMatch } from "@/lib/types";

function pool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

function depthOf(state: BracketState, matchId: string): number {
  const match = state.matches[matchId];
  const sourceDepths = match.sources.map((source) =>
    source.kind === "entrant" ? 0 : depthOf(state, source.matchId) + 1,
  );
  return Math.max(...sourceDepths);
}

/** Depth (in matches) of an entrant uid: how many matches must resolve before they reach the tree's final. */
function entrantDepth(state: BracketState, treeIndex: number, uid: string): number {
  const tree = state.trees[treeIndex];
  let depth = 0;
  let matchId: string | null = tree.finalMatchId;
  while (matchId) {
    const match: TournamentMatch = state.matches[matchId];
    const directHit = match.sources.some(
      (source) => source.kind === "entrant" && source.uid === uid,
    );
    if (directHit) return depth + 1;
    // Walk into whichever child subtree actually contains this uid.
    const childMatch = match.sources
      .filter((source): source is { kind: "match"; matchId: string } => source.kind === "match")
      .find((source) => treeContainsUid(state, source.matchId, uid));
    if (!childMatch) throw new Error(`uid ${uid} not found in tree ${treeIndex}`);
    matchId = childMatch.matchId;
    depth += 1;
  }
  throw new Error("unreachable");
}

function treeContainsUid(state: BracketState, matchId: string, uid: string): boolean {
  const match = state.matches[matchId];
  return match.sources.some((source) =>
    source.kind === "entrant" ? source.uid === uid : treeContainsUid(state, source.matchId, uid),
  );
}

/** Plays every match by picking `players[0]` as the winner every time, until the bracket is finished. */
function playToCompletion(state: BracketState): BracketState {
  let current = state;
  let claimSeq = 0;
  // Bounded by match count; a real bug (e.g. an infinite waiting match) would
  // otherwise hang the test suite instead of failing it.
  for (let guard = 0; guard < Object.keys(state.matches).length + 1; guard++) {
    if (isBracketFinished(current)) return current;
    const readyMatch = Object.values(current.matches).find((match) => match.status === "ready");
    if (!readyMatch) throw new Error("no ready match but bracket not finished");
    claimSeq += 1;
    const claimId = `claim${claimSeq}`;
    const claimed = claimMatch(
      current,
      readyMatch.id,
      { byUid: readyMatch.players[0]!, claimId, claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error(`claim failed: ${claimed.error}`);
    const reported = recordMatchResult(claimed, readyMatch.id, {
      claimId,
      winnerUid: readyMatch.players[0]!,
      attempts: 1,
      reportedBy: readyMatch.players[0]!,
      at: `t${claimSeq}`,
    });
    if ("error" in reported) throw new Error(`report failed: ${reported.error}`);
    current = reported;
  }
  throw new Error("playToCompletion did not converge");
}

describe("planBracket / createBracket structural properties", () => {
  for (let n = 2; n <= MAX_TOURNAMENT_ENTRANTS; n++) {
    for (let k = 1; k <= n - 1; k++) {
      it(`n=${n} k=${k}: every tree is balanced, sized right, and has the expected immediate matches`, () => {
        const plan = planBracket(n, k);
        const seedOrder = pool(n);
        const state = createBracket(seedOrder, k);

        expect(state.advance).toBe(plan.advance);
        expect(state.trees).toHaveLength(plan.treeSizes.length);

        // Tree sizes as even as possible, every tree >= 2, summing to n.
        const sizes = state.trees.map((tree) => tree.entrantUids.length);
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        for (const size of sizes) expect(size).toBeGreaterThanOrEqual(2);

        // n - treeCount matches total, matching plan.matchCount.
        expect(Object.keys(state.matches)).toHaveLength(plan.matchCount);

        // Every entrant appears in exactly one match's sources across the whole bracket.
        const allEntrants = Object.values(state.matches).flatMap((match) =>
          match.sources.filter((s) => s.kind === "entrant").map((s) => (s as { uid: string }).uid),
        );
        expect(new Set(allEntrants).size).toBe(allEntrants.length);
        expect(new Set(allEntrants)).toEqual(new Set(seedOrder));

        // Exactly floor(size/2) matches per tree are immediately playable (round 1 / status ready).
        const immediatelyReady = Object.values(state.matches).filter(
          (match) => match.status === "ready",
        ).length;
        const expectedReady = sizes.reduce((sum, size) => sum + Math.floor(size / 2), 0);
        expect(immediatelyReady).toBe(expectedReady);
        expect(immediatelyReady).toBe(plan.maxParallel);

        // Balanced: every entrant's depth is the tree's height or height-1.
        state.trees.forEach((tree, treeIndex) => {
          const height = depthOf(state, tree.finalMatchId) + 1;
          for (const uid of tree.entrantUids) {
            const depth = entrantDepth(state, treeIndex, uid);
            expect(depth === height || depth === height - 1).toBe(true);
          }
        });

        // Odd-size trees have exactly one bye entrant (a source that's a raw entrant one level below the top, feeding a non-round-1 match); even-size trees have none.
        for (const [index, size] of sizes.entries()) {
          const byeCount = Object.values(state.matches).filter(
            (match) =>
              match.treeIndex === index &&
              match.round > 1 &&
              match.sources.some((s) => s.kind === "entrant"),
          ).length;
          expect(byeCount).toBe(size % 2 === 0 ? 0 : 1);
        }
      });
    }
  }
});

describe("playing a bracket to completion", () => {
  for (const [n, k] of [
    [2, 1],
    [3, 1],
    [3, 2],
    [10, 1],
    [10, 3],
    [10, 5],
    [10, 9],
    [32, 16],
    [32, 31],
  ]) {
    it(`n=${n} k=${k}: produces exactly k distinct payers from the pool`, () => {
      const state = createBracket(pool(n), k);
      const finished = playToCompletion(state);
      expect(isBracketFinished(finished)).toBe(true);
      const losers = bracketLoserUids(finished);
      expect(losers).toHaveLength(k);
      expect(new Set(losers).size).toBe(k);
      for (const uid of losers) expect(pool(n)).toContain(uid);
    });
  }

  it("loser-advance mode (k <= n/2): the tree final's loser pays, not just any loser", () => {
    // n=4, k=1 -> one tree of 4, advance="loser".
    const state = createBracket(["a", "b", "c", "d"], 1);
    expect(state.advance).toBe("loser");
    const finished = playToCompletion(state);
    const losers = bracketLoserUids(finished);
    expect(losers).toHaveLength(1);
    // The final match is the one with next === null.
    const final = Object.values(finished.matches).find((m) => m.next === null)!;
    expect(losers[0]).toBe(final.result!.loserUid);
  });

  it("winner-advance mode (k > n/2): every match's loser pays, the tree champion goes free", () => {
    // n=4, k=3 -> classic single-elim, one champion, three payers.
    const state = createBracket(["a", "b", "c", "d"], 3);
    expect(state.advance).toBe("winner");
    const finished = playToCompletion(state);
    const losers = bracketLoserUids(finished);
    expect(losers).toHaveLength(3);
    const champion = ["a", "b", "c", "d"].find((uid) => !losers.includes(uid));
    expect(champion).toBeDefined();
  });
});

describe("maxTournamentLoserCount", () => {
  it("caps at pool size minus one", () => {
    expect(maxTournamentLoserCount(5)).toBe(4);
    expect(maxTournamentLoserCount(2)).toBe(1);
  });
});

describe("claimMatch", () => {
  it("claims a ready match", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const claimed = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    expect("error" in claimed).toBe(false);
    if (!("error" in claimed)) {
      expect(claimed.matches[matchId].status).toBe("playing");
      expect(claimed.matches[matchId].claim?.claimId).toBe("c1");
    }
  });

  it("refuses a second claim without takeover", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const first = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in first) throw new Error("unexpected error");
    const second = claimMatch(
      first,
      matchId,
      { byUid: "b", claimId: "c2", claimedAt: "t1" },
      { takeover: false },
    );
    expect(second).toEqual({ error: "match-claimed" });
  });

  it("takeover issues a fresh claim, invalidating the old one", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const first = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in first) throw new Error("unexpected error");
    const taken = claimMatch(
      first,
      matchId,
      { byUid: "b", claimId: "c2", claimedAt: "t1" },
      { takeover: true },
    );
    if ("error" in taken) throw new Error("unexpected error");
    expect(taken.matches[matchId].claim?.claimId).toBe("c2");
    // The old claimId can no longer report.
    const stale = recordMatchResult(taken, matchId, {
      claimId: "c1",
      winnerUid: "a",
      attempts: 1,
      reportedBy: "a",
      at: "t2",
    });
    expect(stale).toEqual({ error: "claim-lost" });
  });

  it("refuses a claim on a match that isn't ready yet", () => {
    const state = createBracket(["a", "b", "c"], 1);
    const waiting = Object.values(state.matches).find(
      (m: TournamentMatch) => m.status === "waiting",
    )!;
    const result = claimMatch(
      state,
      waiting.id,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    expect(result).toEqual({ error: "match-not-ready" });
  });
});

describe("releaseMatch", () => {
  it("returns a claimed match to ready", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const claimed = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error("unexpected error");
    const released = releaseMatch(claimed, matchId, "c1");
    if ("error" in released) throw new Error("unexpected error");
    expect(released.matches[matchId].status).toBe("ready");
    expect(released.matches[matchId].claim).toBeNull();
  });

  it("refuses to release with the wrong claimId", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const claimed = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error("unexpected error");
    expect(releaseMatch(claimed, matchId, "wrong")).toEqual({ error: "claim-lost" });
  });
});

describe("recordMatchResult error paths and idempotency", () => {
  it("refuses a result without a matching claim", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const result = recordMatchResult(state, matchId, {
      claimId: "never-claimed",
      winnerUid: "a",
      attempts: 1,
      reportedBy: "a",
      at: "t1",
    });
    expect(result).toEqual({ error: "claim-lost" });
  });

  it("refuses a winner who isn't in the match", () => {
    const state = createBracket(["a", "b", "c"], 1);
    const ready = Object.values(state.matches).find((m: TournamentMatch) => m.status === "ready")!;
    const claimed = claimMatch(
      state,
      ready.id,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error("unexpected error");
    const result = recordMatchResult(claimed, ready.id, {
      claimId: "c1",
      winnerUid: "c",
      attempts: 1,
      reportedBy: "a",
      at: "t1",
    });
    expect(result).toEqual({ error: "invalid-winner" });
  });

  it("refuses a report on a match that's still waiting on a source", () => {
    const state = createBracket(["a", "b", "c"], 1);
    const waiting = Object.values(state.matches).find(
      (m: TournamentMatch) => m.status === "waiting",
    )!;
    // Never claimed (can't be, while waiting), so this hits claim-lost — the
    // engine has no path to report on an unclaimed match at all.
    const result = recordMatchResult(state, waiting.id, {
      claimId: "anything",
      winnerUid: waiting.players[0] ?? "a",
      attempts: 1,
      reportedBy: "a",
      at: "t1",
    });
    expect(result).toEqual({ error: "claim-lost" });
  });

  it("is idempotent for a repeated report with the same claim and winner", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const claimed = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error("unexpected error");
    const report = { claimId: "c1", winnerUid: "a", attempts: 1, reportedBy: "a", at: "t1" };
    const first = recordMatchResult(claimed, matchId, report);
    if ("error" in first) throw new Error("unexpected error");
    const second = recordMatchResult(first, matchId, report);
    expect(second).toEqual(first);
  });

  it("refuses a conflicting report once a match is already done", () => {
    const state = createBracket(["a", "b"], 1);
    const matchId = Object.keys(state.matches)[0];
    const claimed = claimMatch(
      state,
      matchId,
      { byUid: "a", claimId: "c1", claimedAt: "t0" },
      { takeover: false },
    );
    if ("error" in claimed) throw new Error("unexpected error");
    const first = recordMatchResult(claimed, matchId, {
      claimId: "c1",
      winnerUid: "a",
      attempts: 1,
      reportedBy: "a",
      at: "t1",
    });
    if ("error" in first) throw new Error("unexpected error");
    const conflicting = recordMatchResult(first, matchId, {
      claimId: "c1",
      winnerUid: "b",
      attempts: 1,
      reportedBy: "a",
      at: "t2",
    });
    expect(conflicting).toEqual({ error: "match-finished" });
  });
});
