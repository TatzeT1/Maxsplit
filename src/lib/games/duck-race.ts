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
 *
 * The race is staged around one moment: the last duck that stays dry and the
 * first one that pays come in neck and neck (a "Fotofinish"), and the clock
 * runs in slow motion around their crossing. The plan keeps two clocks for
 * that — the *race clock* every finish time and keyframe is written in, and
 * the *screen clock* the dialog plays it on — joined by a monotone time warp
 * (`DuckTimeWarp`), so slowing the picture down can't reorder anything.
 */

/** Segments each duck's run is cut into for its progress keyframes. */
export const DUCK_PROGRESS_STEPS = 8;
/** The closest two ducks may cross the line: any tighter and the order reads as a coin toss on a phone. */
export const MIN_FINISH_GAP_SEC = 0.16;
/**
 * How far behind the last safe duck the first payer crosses, on the race
 * clock: the tightest gap the field allows anyway, which is a beak's length
 * at racing speed and, in slow motion, half a second on screen.
 */
export const PHOTO_FINISH_GAP_SEC = MIN_FINISH_GAP_SEC;
/** Race seconds per screen second at the photo finish. */
export const SLOW_MOTION_RATE = 0.3;
/** Race seconds of full slow motion before the last safe duck crosses… */
const SLOW_LEAD_SEC = 0.4;
/** …and after the first payer has. */
const SLOW_TRAIL_SEC = 0.08;
/** Race seconds over which the clock eases into slow motion and back out. */
const SLOW_RAMP_SEC = 0.3;
/** Knots per ease: each holds a constant rate, and six are fine enough that no step reads as a jolt. */
const SLOW_RAMP_STEPS = 6;
/** The keyframe from which the decisive pair swim side by side: the last quarter of the race. */
const NECK_AND_NECK_FROM = DUCK_PROGRESS_STEPS - 2;
/** How often the first payer noses ahead on the run-in, so the lead changes hands right at the end. */
const LATE_LEAD_CHANCE = 0.6;
/** The most the finish camera zooms in on the pair. */
const PHOTO_ZOOM_MAX = 1.7;
/** The pair's lanes stay at least this far (a fraction of the course width) from either edge when zoomed. */
const PHOTO_ZOOM_MARGIN = 0.14;
/** Screen seconds the camera takes to zoom in on the pair, and back out once the payer is home. */
const PHOTO_ZOOM_IN_SEC = 0.6;
const PHOTO_ZOOM_OUT_SEC = 0.6;
/** A beat between the payer crossing and the camera pulling back. */
const PHOTO_ZOOM_HOLD_SEC = 0.35;

/** How long the race takes from the start until the last duck is home; a little longer with more ducks. */
export function duckRaceDuration(duckCount: number): number {
  return Math.min(Math.max(6.5 + duckCount * 0.25, 7), 11);
}

export interface DuckPlan {
  uid: string;
  /** 0 = first across the line. */
  rank: number;
  /** Race-clock seconds after the start gun that this duck crosses the line. */
  finishSec: number;
  /** Progress along the course (0..1) at `DUCK_PROGRESS_STEPS + 1` equally spaced moments from the start to `finishSec`. Never decreases, starts at 0, ends at exactly 1. */
  progress: number[];
}

/**
 * The race clock against the screen clock. Knots in both, strictly
 * increasing from (0, 0); linear in between and 1:1 past the last knot, so
 * the warp is monotone both ways and order-preserving by construction.
 */
export interface DuckTimeWarp {
  race: number[];
  real: number[];
}

/** No slow motion: the screen shows the race clock as it is. */
export const IDENTITY_WARP: DuckTimeWarp = { race: [0], real: [0] };

/** The neck-and-neck finish between the last duck that stays dry and the first one that pays. */
export interface PhotoFinish {
  safeUid: string;
  payerUid: string;
  /** Race seconds: the safe duck's beak on the line — the frame the camera takes. */
  atSec: number;
  /** Where the payer is in that frame (0..1, just short of the line). */
  payerProgress: number;
  /** Race seconds of full slow motion, around both crossings (the clock eases in before and out after). */
  slowFromSec: number;
  slowToSec: number;
}

export interface DuckRace {
  ducks: DuckPlan[];
  /** When the last duck crosses the line, on the race clock. */
  totalSec: number;
  /** `null` with fewer than two ducks: nothing to decide. */
  photo: PhotoFinish | null;
  warp: DuckTimeWarp;
}

/**
 * `finishOrder` lists everyone first place to last; the last `payerCount` of
 * them pay (`duckRaceLosers`). `random` returns a number in `[0, 1)` and only
 * shapes the staging (overtakes, small timing wobble, a late lead), never the
 * order — `Math.random` would do, tests inject a seeded one.
 */
export function planDuckRace(
  finishOrder: readonly string[],
  random: () => number,
  payerCount = 1,
): DuckRace {
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

  const totalSec = ducks.length > 0 ? ducks[ducks.length - 1].finishSec : 0;
  if (count < 2) return { ducks, totalSec, photo: null, warp: IDENTITY_WARP };

  const payers = Math.min(Math.max(payerCount, 1), maxDuckLoserCount(count));
  const safe = ducks[count - payers - 1];
  const payer = ducks[count - payers];

  // Pull the last safe duck up to a beak ahead of the first payer. It only
  // ever moves later (the payer was at least `MIN_FINISH_GAP_SEC` behind it
  // already), so it stays clear of the duck before it.
  safe.finishSec = payer.finishSec - PHOTO_FINISH_GAP_SEC;

  // Side by side over the last quarter: the payer's own run is squeezed to
  // meet the safe duck there, then follows it to the line — a hair behind,
  // since its own clock runs a little longer.
  const meet = safe.progress[NECK_AND_NECK_FROM];
  const ownMeet = payer.progress[NECK_AND_NECK_FROM];
  for (let index = 1; index <= DUCK_PROGRESS_STEPS; index++) {
    payer.progress[index] =
      index <= NECK_AND_NECK_FROM ? (payer.progress[index] / ownMeet) * meet : safe.progress[index];
  }
  if (random() < LATE_LEAD_CHANCE) {
    // …or it noses ahead on the run-in and the safe duck out-lunges it at the line.
    const runIn = DUCK_PROGRESS_STEPS - 1;
    payer.progress[runIn] = safe.progress[runIn] + (1 - safe.progress[runIn]) * 0.5;
  }

  const slowFromSec = safe.finishSec - SLOW_LEAD_SEC;
  const slowToSec = payer.finishSec + SLOW_TRAIL_SEC;
  return {
    ducks,
    totalSec,
    photo: {
      safeUid: safe.uid,
      payerUid: payer.uid,
      atSec: safe.finishSec,
      payerProgress: duckProgressAt(payer, safe.finishSec),
      slowFromSec,
      slowToSec,
    },
    warp: slowMotionWarp(slowFromSec, slowToSec),
  };
}

/** Slope of the progress curve at keyframe `index`, in progress per keyframe step. */
function keyframeSlope(progress: readonly number[], index: number): number {
  // From a standing start: the gun goes and the ducks push off.
  if (index === 0) return 0;
  const before = progress[index] - progress[index - 1];
  if (index === progress.length - 1) return before;
  const after = progress[index + 1] - progress[index];
  // The harmonic mean of the neighbouring slopes (Fritsch–Butland) is never
  // more than twice either of them, which keeps a cubic between rising
  // keyframes from overshooting — so the duck never swims backwards.
  return before > 0 && after > 0 ? (2 * before * after) / (before + after) : 0;
}

/**
 * Where `duck` is (0..1) at `raceSec` on the race clock: its keyframes joined
 * by a monotone cubic, so the speed changes smoothly instead of kinking at
 * every keyframe, and progress never decreases. 0 before the gun, 1 from its
 * crossing on.
 */
export function duckProgressAt(duck: DuckPlan, raceSec: number): number {
  if (raceSec <= 0) return 0;
  if (raceSec >= duck.finishSec) return 1;
  const steps = duck.progress.length - 1;
  const position = (raceSec / duck.finishSec) * steps;
  const index = Math.min(Math.floor(position), steps - 1);
  const t = position - index;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * duck.progress[index] +
    (t3 - 2 * t2 + t) * keyframeSlope(duck.progress, index) +
    (3 * t2 - 2 * t3) * duck.progress[index + 1] +
    (t3 - t2) * keyframeSlope(duck.progress, index + 1)
  );
}

function smoothstep(x: number): number {
  const clamped = Math.min(Math.max(x, 0), 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Slow motion from `fromSec` to `toSec` on the race clock (at
 * `SLOW_MOTION_RATE`), easing in over `SLOW_RAMP_SEC` before and out over
 * the same after. Each ease is a few knots of constant rate.
 */
export function slowMotionWarp(fromSec: number, toSec: number): DuckTimeWarp {
  const race = [0];
  const real = [0];
  const knot = (raceAt: number, rate: number) => {
    const last = race.length - 1;
    if (raceAt <= race[last]) return;
    real.push(real[last] + (raceAt - race[last]) / rate);
    race.push(raceAt);
  };
  const rateAt = (slowness: number) => 1 + (SLOW_MOTION_RATE - 1) * smoothstep(slowness);

  const easeInFrom = Math.max(fromSec - SLOW_RAMP_SEC, 0);
  knot(easeInFrom, 1);
  for (let step = 1; step <= SLOW_RAMP_STEPS; step++) {
    const at = easeInFrom + ((fromSec - easeInFrom) * step) / SLOW_RAMP_STEPS;
    knot(at, rateAt((step - 0.5) / SLOW_RAMP_STEPS));
  }
  knot(toSec, SLOW_MOTION_RATE);
  for (let step = 1; step <= SLOW_RAMP_STEPS; step++) {
    knot(
      toSec + (SLOW_RAMP_SEC * step) / SLOW_RAMP_STEPS,
      rateAt(1 - (step - 0.5) / SLOW_RAMP_STEPS),
    );
  }
  return { race, real };
}

function warpAlong(from: readonly number[], to: readonly number[], at: number): number {
  if (at <= 0) return at;
  let index = from.length - 1;
  while (index > 0 && from[index] > at) index -= 1;
  if (index === from.length - 1) return to[index] + (at - from[index]);
  const share = (at - from[index]) / (from[index + 1] - from[index]);
  return to[index] + share * (to[index + 1] - to[index]);
}

/** Screen seconds after the gun at which the race clock reads `raceSec`. */
export function warpToReal(warp: DuckTimeWarp, raceSec: number): number {
  return warpAlong(warp.race, warp.real, raceSec);
}

/** What the race clock reads `realSec` screen seconds after the gun. */
export function warpToRace(warp: DuckTimeWarp, realSec: number): number {
  return warpAlong(warp.real, warp.race, realSec);
}

/** The race's beats on the screen clock, for the dialog's timers. */
export interface DuckRaceCues {
  /** Every crossing, first place first. */
  finishes: { uid: string; atSec: number }[];
  /** The photo finish: slow motion eases in at `slowFromSec`, the camera flashes at `flashSec`, the payer is home at `payerSec`, the clock is back to speed at `slowToSec` and the camera has pulled back out at `zoomOutEndSec`. */
  photo: {
    slowFromSec: number;
    flashSec: number;
    payerSec: number;
    slowToSec: number;
    zoomOutFromSec: number;
    zoomOutEndSec: number;
  } | null;
  /** The last duck is home. */
  endSec: number;
  /** When nothing on screen moves any more: the frame loop can stop. */
  settledSec: number;
}

export function duckRaceCues(race: DuckRace): DuckRaceCues {
  const toReal = (raceSec: number) => warpToReal(race.warp, raceSec);
  const endSec = toReal(race.totalSec);
  const finishes = race.ducks.map((duck) => ({ uid: duck.uid, atSec: toReal(duck.finishSec) }));
  if (!race.photo) return { finishes, photo: null, endSec, settledSec: endSec };

  const payerFinish = race.ducks.find((duck) => duck.uid === race.photo?.payerUid)?.finishSec;
  const payerSec = toReal(payerFinish ?? race.photo.atSec);
  const zoomOutFromSec = payerSec + PHOTO_ZOOM_HOLD_SEC;
  const zoomOutEndSec = zoomOutFromSec + PHOTO_ZOOM_OUT_SEC;
  return {
    finishes,
    photo: {
      // The ease-in starts SLOW_RAMP_SEC (race) before full slow motion.
      slowFromSec: toReal(Math.max(race.photo.slowFromSec - SLOW_RAMP_SEC, 0)),
      flashSec: toReal(race.photo.atSec),
      payerSec,
      slowToSec: toReal(race.photo.slowToSec + SLOW_RAMP_SEC),
      zoomOutFromSec,
      zoomOutEndSec,
    },
    endSec,
    settledSec: Math.max(endSec, zoomOutEndSec),
  };
}

/** How far the finish camera is zoomed in (0 = not at all, 1 = fully) `realSec` screen seconds after the gun. */
export function photoZoomAt(cues: DuckRaceCues, realSec: number): number {
  if (!cues.photo) return 0;
  const zoomIn = smoothstep((realSec - cues.photo.slowFromSec) / PHOTO_ZOOM_IN_SEC);
  const zoomOut = smoothstep((realSec - cues.photo.zoomOutFromSec) / PHOTO_ZOOM_OUT_SEC);
  return zoomIn * (1 - zoomOut);
}

/**
 * Where the finish camera zooms: as close as `PHOTO_ZOOM_MAX` while both
 * lanes of the pair stay on screen, `PHOTO_ZOOM_MARGIN` from the edges.
 * `originX` (0..1 of the course width) is the transform origin; it stays on
 * the course, so the zoomed water still fills the frame edge to edge. Lanes
 * are numbered from 0, left to right, out of `laneCount`.
 */
export function photoFinishFocus(
  laneCount: number,
  laneA: number,
  laneB: number,
): { scale: number; originX: number } {
  const xA = (laneA + 0.5) / laneCount;
  const xB = (laneB + 0.5) / laneCount;
  const left = Math.min(xA, xB);
  const right = Math.max(xA, xB);
  const middle = (left + right) / 2;
  // From the closest zoom down in 5 % steps until both lanes fit.
  const steps = Math.round((PHOTO_ZOOM_MAX - 1) / 0.05);
  for (let step = 0; step < steps; step++) {
    const scale = PHOTO_ZOOM_MAX - step * 0.05;
    // The origin that would centre the pair, kept on the course.
    const originX = Math.min(Math.max((0.5 - scale * middle) / (1 - scale), 0), 1);
    const shownLeft = originX + scale * (left - originX);
    const shownRight = originX + scale * (right - originX);
    if (shownLeft >= PHOTO_ZOOM_MARGIN - 1e-9 && shownRight <= 1 - PHOTO_ZOOM_MARGIN + 1e-9) {
      return { scale, originX };
    }
  }
  return { scale: 1, originX: middle };
}

/**
 * Everyone from first to last *right now*, `raceSec` into the race: the
 * ducks already home in the order they crossed, then the rest by how far
 * they've swum. Exact ties (everyone on the start line) go by `lanes`, left
 * to right — never by the finishing order, which would give the result away.
 */
export function duckStandings(race: DuckRace, raceSec: number, lanes: readonly string[]): string[] {
  return race.ducks
    .map((duck) => ({
      duck,
      home: raceSec >= duck.finishSec,
      progress: duckProgressAt(duck, raceSec),
      lane: lanes.indexOf(duck.uid),
    }))
    .sort((a, b) => {
      if (a.home && b.home) return a.duck.rank - b.duck.rank;
      if (a.home !== b.home) return a.home ? -1 : 1;
      return b.progress - a.progress || a.lane - b.lane;
    })
    .map(({ duck }) => duck.uid);
}

/** 👑 over the duck in front, 🏮 over the `payerCount` ducks that would pay if the race ended now. */
export interface DuckMarkers {
  leader: string | null;
  lanterns: string[];
}

export function duckMarkers(
  race: DuckRace,
  raceSec: number,
  lanes: readonly string[],
  payerCount: number,
): DuckMarkers {
  const standings = duckStandings(race, raceSec, lanes);
  if (standings.length < 2) return { leader: null, lanterns: [] };
  const payers = Math.min(Math.max(payerCount, 1), maxDuckLoserCount(standings.length));
  return { leader: standings[0], lanterns: standings.slice(standings.length - payers) };
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
