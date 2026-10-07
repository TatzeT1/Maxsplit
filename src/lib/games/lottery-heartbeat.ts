/**
 * The lottery's Herzklopfen: a heartbeat that speeds up as the odds of the
 * next tap catching a laughing face rise.
 *
 * Only public information goes in — how many laughing faces are still out
 * there (the found slots show it) and how many faces are still on the board
 * (anyone can count them) — so the beat can't give away *where* a laughing
 * face sits. Every face on the board has the same chance, `payLeft /
 * facesLeft`, and that is exactly what the tempo follows.
 */

/** A calm resting pulse, for a big board with one laughing face hidden in it. */
export const HEARTBEAT_MIN_BPM = 60;
/** Racing, for the moment every face left laughs. */
export const HEARTBEAT_MAX_BPM = 160;

export interface LotteryHeartbeat {
  /** The chance that the next tap catches a laughing face, 0..1. */
  odds: number;
  /** Beats per minute. */
  bpm: number;
  /** 0..1: how loud and hard each beat is, rising with the odds. */
  intensity: number;
}

/**
 * The heartbeat for `payLeft` laughing faces among `facesLeft` untapped
 * faces, or `null` once nothing is left to find. The tempo follows the square
 * root of the odds, so the early taps on a big board are already audibly
 * different from each other instead of all sitting at the floor.
 */
export function lotteryHeartbeat(payLeft: number, facesLeft: number): LotteryHeartbeat | null {
  if (!(payLeft > 0) || !(facesLeft > 0)) return null;
  const odds = Math.min(payLeft / facesLeft, 1);
  const intensity = Math.sqrt(odds);
  const bpm = Math.round(HEARTBEAT_MIN_BPM + (HEARTBEAT_MAX_BPM - HEARTBEAT_MIN_BPM) * intensity);
  return { odds, bpm, intensity };
}
