/**
 * Pure Schnick-Schnack-Schnuck (rock-paper-scissors) rules for the duel
 * mini-game. A match is "first to two round wins"; a drawn round is simply
 * played again, so the *match* never ends level and `onDraw` is never needed.
 *
 * Both players choose at the same time. On one phone that is an honour-system
 * split screen; online the picks stay secret until both are in (see
 * `online-match.ts`, which keeps the pending picks in `liveSecrets`).
 */

export const RPS_HANDS = ["rock", "paper", "scissors"] as const;
export type RpsHand = (typeof RPS_HANDS)[number];

/** Round wins needed to take the match. */
export const RPS_ROUNDS_TO_WIN = 2;

export function isRpsHand(value: unknown): value is RpsHand {
  return typeof value === "string" && (RPS_HANDS as readonly string[]).includes(value);
}

const BEATS: Record<RpsHand, RpsHand> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

/** Who takes one round: `0` = the first hand, `1` = the second, `null` = the same hand (played again). */
export function judgeRpsRound(first: RpsHand, second: RpsHand): 0 | 1 | null {
  if (first === second) return null;
  return BEATS[first] === second ? 0 : 1;
}

/** One revealed round. Plain fields rather than a tuple: it is stored in Firestore, which has no nested arrays. */
export interface RpsRound {
  p0: RpsHand;
  p1: RpsHand;
}

/** Round wins per player; drawn rounds count for nobody. */
export function rpsScore(rounds: readonly RpsRound[]): [number, number] {
  const score: [number, number] = [0, 0];
  for (const round of rounds) {
    const winner = judgeRpsRound(round.p0, round.p1);
    if (winner !== null) score[winner] += 1;
  }
  return score;
}

/** `0` or `1` once that player has `RPS_ROUNDS_TO_WIN` round wins, otherwise `null`. */
export function rpsMatchWinner(rounds: readonly RpsRound[]): 0 | 1 | null {
  const [a, b] = rpsScore(rounds);
  if (a >= RPS_ROUNDS_TO_WIN) return 0;
  if (b >= RPS_ROUNDS_TO_WIN) return 1;
  return null;
}
