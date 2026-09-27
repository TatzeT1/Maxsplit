import { describe, expect, it } from "vitest";
import {
  bracketLoserUids,
  claimMatch,
  createBracket,
  isBracketFinished,
  recordMatchResult,
  type BracketState,
} from "./tournament-bracket";
import {
  bracketProgress,
  entrantStanding,
  matchFates,
  pendingSourceMatch,
} from "./tournament-status";

function pool(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

/** Plays the first ready match, alternating which slot wins so both fates get exercised. */
function playOne(state: BracketState, step: number): BracketState {
  const ready = Object.values(state.matches).find((match) => match.status === "ready");
  if (!ready) throw new Error("no ready match");
  const claimId = `c${step}`;
  const claimed = claimMatch(
    state,
    ready.id,
    { byUid: "host", claimId, claimedAt: "t0" },
    { takeover: false },
  );
  if ("error" in claimed) throw new Error(claimed.error);
  const winnerUid = ready.players[step % 2]!;
  const reported = recordMatchResult(claimed, ready.id, {
    claimId,
    winnerUid,
    attempts: 1,
    reportedBy: "host",
    at: `t${String(step).padStart(3, "0")}`,
  });
  if ("error" in reported) throw new Error(reported.error);
  return reported;
}

describe("matchFates", () => {
  it("loser mode: winners are always safe; only a final's loser pays", () => {
    expect(matchFates("loser", { next: { matchId: "x", slot: 0 } })).toEqual({
      win: "safe",
      loss: "advances",
    });
    expect(matchFates("loser", { next: null })).toEqual({ win: "safe", loss: "pays" });
  });

  it("winner mode: losers always pay; only a final's winner is safe", () => {
    expect(matchFates("winner", { next: { matchId: "x", slot: 1 } })).toEqual({
      win: "advances",
      loss: "pays",
    });
    expect(matchFates("winner", { next: null })).toEqual({ win: "safe", loss: "pays" });
  });
});

describe("entrantStanding agrees with the engine at every step", () => {
  for (let n = 3; n <= 12; n++) {
    for (let k = 1; k <= n - 1; k++) {
      it(`n=${n} k=${k}`, () => {
        const seedOrder = pool(n);
        let state = createBracket(seedOrder, k);
        let step = 0;
        for (;;) {
          const standings = seedOrder.map((uid) => entrantStanding(state, uid));
          const payers = new Set(bracketLoserUids(state));

          for (const [index, standing] of standings.entries()) {
            const uid = seedOrder[index];
            expect(standing).not.toBeNull();
            // Paying here means paying in the engine's own payout, and vice versa.
            expect(standing!.kind === "pays").toBe(payers.has(uid));
            if (standing!.kind === "active") {
              expect(standing!.match.status).not.toBe("done");
              expect(standing!.match.players).toContain(uid);
              if (standing!.match.status === "waiting") {
                const source = pendingSourceMatch(state, standing!.match);
                expect(source).not.toBeNull();
                expect(source!.status).not.toBe("done");
              }
            }
          }

          const progress = bracketProgress(state);
          expect(progress.totalCount).toBe(Object.keys(state.matches).length);

          if (isBracketFinished(state)) {
            expect(progress.currentRound).toBeNull();
            expect(standings.filter((s) => s!.kind === "pays")).toHaveLength(k);
            expect(standings.filter((s) => s!.kind === "safe")).toHaveLength(n - k);
            break;
          }
          expect(progress.currentRound).not.toBeNull();
          step += 1;
          state = playOne(state, step);
        }
      });
    }
  }

  it("a spectator has no standing", () => {
    const state = createBracket(pool(4), 1);
    expect(entrantStanding(state, "someone-else")).toBeNull();
  });
});
