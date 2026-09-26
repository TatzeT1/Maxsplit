/**
 * Pure judging logic for the Reaktionsduell (reaction-speed duel): both
 * players tap their own half of the screen once they're ready, a "Los!"
 * signal appears after a random delay, and whoever taps first *after* the
 * signal wins — tapping before it is an instant false start.
 *
 * Timing constants and delay randomness live here so the board component
 * only has to record raw timestamps and call `judgeReaction`.
 */

/** How long after both players are ready before the signal appears — randomized so it can't be anticipated. */
export const REACTION_MIN_DELAY_MS = 1500;
export const REACTION_MAX_DELAY_MS = 5000;

/** Taps this close together can't be honestly ordered by touch hardware — treated as a dead heat, not a photo finish. */
export const REACTION_TIE_WINDOW_MS = 16;

/** How long the board waits after the first tap for a possible near-simultaneous second one, before judging. */
export const REACTION_SETTLE_MS = 60;

export type ReactionVerdict =
  { kind: "win"; winner: 0 | 1; reason: "faster" | "falseStart" } | { kind: "tooClose" };

/**
 * `taps[i]` is player `i`'s tap timestamp, or `null` if they haven't tapped
 * (yet, or at all within the settle window). Returns `null` only when
 * neither player has tapped — the board shouldn't be calling this yet.
 */
export function judgeReaction(input: {
  signalAt: number | null;
  taps: [number | null, number | null];
}): ReactionVerdict | null {
  const { signalAt, taps } = input;
  const isFalseStart = (tap: number) => signalAt === null || tap < signalAt;

  if (taps[0] === null && taps[1] === null) return null;

  if (taps[0] === null || taps[1] === null) {
    const tapper: 0 | 1 = taps[0] === null ? 1 : 0;
    const other: 0 | 1 = tapper === 0 ? 1 : 0;
    const tap = taps[tapper] as number;
    return isFalseStart(tap)
      ? { kind: "win", winner: other, reason: "falseStart" }
      : { kind: "win", winner: tapper, reason: "faster" };
  }

  const [tapA, tapB] = taps as [number, number];
  const earliest: 0 | 1 = tapA <= tapB ? 0 : 1;
  const other: 0 | 1 = earliest === 0 ? 1 : 0;
  const gapMs = Math.abs(tapA - tapB);
  const earliestFalse = isFalseStart(taps[earliest] as number);
  const otherFalse = isFalseStart(taps[other] as number);

  if (earliestFalse) {
    if (otherFalse && gapMs <= REACTION_TIE_WINDOW_MS) return { kind: "tooClose" };
    return { kind: "win", winner: other, reason: "falseStart" };
  }
  if (!otherFalse && gapMs <= REACTION_TIE_WINDOW_MS) return { kind: "tooClose" };
  return { kind: "win", winner: earliest, reason: "faster" };
}
