/**
 * Pure Entenrennen planning for the luck mini-game. The result is decided
 * *first*: the caller draws the finishing order with `secureShuffle`, and the
 * last few ducks across the line are the payers. Everything here is staging —
 * turning a fixed finishing order into a race with overtakes that still ends
 * in exactly that order. Nothing in it can change who pays.
 *
 * Every duck gets a finish time (strictly later for every place, never closer
 * together than the eye can tell apart) and a monotone list of progress
 * keyframes that ends exactly on the line at that time, so ducks lead, fall
 * back and overtake on the way but can never swim backwards.
 */

/** Segments each duck's run is cut into for its progress keyframes. */
export const DUCK_PROGRESS_STEPS = 8;
/** The closest two ducks may cross the line: any tighter and the order reads as a coin toss on a phone. */
export const MIN_FINISH_GAP_SEC = 0.16;

/** How long the race takes from the start until the last duck is home; a little longer with more ducks. */
export function duckRaceDuration(duckCount: number): number {
  return Math.min(Math.max(6.5 + duckCount * 0.25, 7), 11);
}

export interface DuckPlan {
  uid: string;
  /** 0 = first across the line. */
  rank: number;
  /** Seconds after the start gun that this duck crosses the line. */
  finishSec: number;
  /** Progress along the course (0..1) at `DUCK_PROGRESS_STEPS + 1` equally spaced moments from the start to `finishSec`. Never decreases, starts at 0, ends at exactly 1. */
  progress: number[];
}

export interface DuckRace {
  ducks: DuckPlan[];
  /** When the last duck crosses the line. */
  totalSec: number;
}

/**
 * `finishOrder` lists everyone first place to last. `random` returns a number
 * in `[0, 1)` and only shapes the staging (overtakes, small timing wobble),
 * never the order — `Math.random` would do, tests inject a seeded one.
 */
export function planDuckRace(finishOrder: readonly string[], random: () => number): DuckRace {
  const count = finishOrder.length;
  const duration = duckRaceDuration(count);
  const firstAt = duration * 0.72;
  const step = count > 1 ? (duration - firstAt) / (count - 1) : 0;

  let previous = -Infinity;
  const ducks = finishOrder.map((uid, rank): DuckPlan => {
    // The winner and the last duck keep their slots; the ducks in between
    // wobble by up to a quarter step so the gaps are not a metronome.
    const edge = rank === 0 || rank === count - 1;
    const wobble = edge ? 0 : (random() - 0.5) * step * 0.5;
    const finishSec = Math.max(firstAt + step * rank + wobble, previous + MIN_FINISH_GAP_SEC);
    previous = finishSec;

    const weights = Array.from({ length: DUCK_PROGRESS_STEPS }, () => 0.4 + random() * 1.2);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const progress = [0];
    let covered = 0;
    weights.forEach((weight, index) => {
      covered += weight;
      progress.push(index === weights.length - 1 ? 1 : covered / total);
    });
    return { uid, rank, finishSec, progress };
  });

  return { ducks, totalSec: ducks.length > 0 ? ducks[ducks.length - 1].finishSec : 0 };
}

/** At least one duck has to stay dry. */
export function maxDuckLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

/** The payers: the last `count` ducks across the line, last place first (the one everybody is watching for). */
export function duckRaceLosers(finishOrder: readonly string[], count: number): string[] {
  const clamped = Math.min(Math.max(count, 1), maxDuckLoserCount(finishOrder.length));
  return finishOrder.slice(finishOrder.length - clamped).reverse();
}
