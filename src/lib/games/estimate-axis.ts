import type { EstimateFormat, EstimateScale } from "@/lib/types";

/**
 * Display math for the reveal's number line (spec C.10). Client-safe, pure and
 * deterministic (no clock, no randomness) and DISPLAY ONLY: `log10` appears
 * here and nowhere that decides who pays. Must not import the question bank.
 */

export interface AxisLayout {
  scale: EstimateScale;
  domain: { loMilli: number; hiMilli: number };
  /** 0..1, clamped. ratio: log10 axis (display only!). interval: linear. */
  position: (milli: number) => number;
  /**
   * 3..7 round numbers: ratio -> 1·10^n (+2·/5· when fewer than 3 decades); interval -> nice linear steps.
   * Always whole milli (`formatEstimate*` takes integers), ascending and inside the domain. A domain too
   * narrow to hold three whole milli values (a 1-milli ratio row) yields fewer.
   */
  ticks: { milli: number; position: number }[];
}

/** Padding on each side, as a share of the span. */
const PAD = 0.12;
/** ratio: the narrowest span, in decades (a single value still gets a line to sit on). */
const MIN_LOG_SPAN = 0.3;
/** interval: the narrowest span (1 unit), and its share of the truth. */
const MIN_INTERVAL_SPAN_MILLI = 1000;
const TRUTH_SPAN_SHARE = 0.02;
/** interval, years: at least 5 years wide, ticks on whole years. */
const MIN_YEAR_SPAN_MILLI = 5000;
const YEAR_MILLI = 1000;
/** `ESTIMATE_MILLI` = 10^3: the unit exponent of a milli exponent k is k - 3. */
const UNIT_EXPONENT_OFFSET = 3;

const MIN_TICKS = 3;
const MAX_TICKS = 7;
/** Slack for comparing a float log with an integer exponent. */
const EPS = 1e-9;

const DEFAULT_MAX_LANES = 4;

function clamp01(x: number): number {
  if (!(x > 0)) return 0; // also NaN
  return x < 1 ? x : 1;
}

/**
 * `[lo, hi]` around the data `[dataLo, dataHi]`: the data's span (at least
 * `minSpan`) centred on its midpoint, padded by 12 % of the span each side,
 * then clamped to the bounds. The clamp never clips the data itself, and
 * bounds too tight to draw a line in (or garbage) are ignored.
 */
function paddedDomain(
  dataLo: number,
  dataHi: number,
  minSpan: number,
  boundLo: number,
  boundHi: number,
): { lo: number; hi: number } {
  const span = Math.max(dataHi - dataLo, minSpan);
  const mid = (dataLo + dataHi) / 2;
  const half = span / 2 + span * PAD;
  const wantLo = mid - half;
  const wantHi = mid + half;
  const lo = Math.min(Math.max(wantLo, boundLo), dataLo);
  const hi = Math.max(Math.min(wantHi, boundHi), dataHi);
  // NaN bounds fail this comparison too.
  if (!(hi - lo >= (wantHi - wantLo) * 0.1)) return { lo: wantLo, hi: wantHi };
  return { lo, hi };
}

/**
 * Multiples of a 1-2-5 step inside `[lo, hi]`, as many as fit in `MAX_TICKS`
 * (the smallest such step, i.e. the most ticks). Whole numbers only: a step
 * below 1 is never tried. A second pass adds 2.5 for the ranges where 1-2-5
 * jumps from eight ticks to two; if nothing yields three, the finest
 * acceptable result is returned (possibly short, possibly empty).
 */
function niceLinearTicks(lo: number, hi: number, minStep: number): number[] {
  if (!(hi - lo > 0)) return [];
  let finest: number[] | null = null;
  for (const mantissas of [
    [1, 2, 5],
    [1, 2, 2.5, 5],
  ]) {
    search: for (let k = 0; k <= 16; k++) {
      for (const m of mantissas) {
        const step = m * 10 ** k;
        if (!Number.isInteger(step) || step < minStep) continue;
        const first = Math.ceil(lo / step - EPS);
        const last = Math.floor(hi / step + EPS);
        const count = last - first + 1;
        if (count > MAX_TICKS) continue;
        if (count < MIN_TICKS) {
          // Larger steps only get sparser.
          if (finest === null && count > 0) finest = ticksOf(first, last, step);
          break search;
        }
        return ticksOf(first, last, step);
      }
    }
  }
  return finest ?? [];
}

function ticksOf(first: number, last: number, step: number): number[] {
  const out: number[] = [];
  for (let i = first; i <= last; i++) out.push(i * step);
  return out;
}

/** m·10^k milli for the given mantissas, ascending, whose log lies in `[lo, hi]`. */
function mantissaTicks(mantissas: readonly number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let k = Math.max(0, Math.floor(lo)); k <= Math.ceil(hi); k++) {
    for (const m of mantissas) {
      const milli = m * 10 ** k;
      const log = Math.log10(milli);
      if (log >= lo - EPS && log <= hi + EPS) out.push(milli);
    }
  }
  return out;
}

/** Tick values (milli) for a log domain `[lo, hi]` given as log10 of milli. */
function ratioTickValues(lo: number, hi: number): number[] {
  // 1. Whole decades, thinned to every 2nd/3rd/... UNIT decade (1, 100, 10 000 or 1, 1 000, 1 000 000)
  //    when there are more than seven.
  const decades: number[] = [];
  for (let k = Math.max(0, Math.ceil(lo - EPS)); k <= Math.floor(hi + EPS); k++) decades.push(k);
  if (decades.length >= MIN_TICKS) {
    for (let stride = 1; ; stride++) {
      const kept = decades.filter((k) => (k - UNIT_EXPONENT_OFFSET) % stride === 0);
      if (kept.length <= MAX_TICKS) return kept.map((k) => 10 ** k);
    }
  }
  // 2. Fewer than three decades: add the 2s and 5s (1, 2, 5, 10, 20, 50, ...), or just the 5s when
  //    that is too many.
  for (const mantissas of [
    [1, 2, 5],
    [1, 5],
  ]) {
    const ticks = mantissaTicks(mantissas, lo, hi);
    if (ticks.length >= MIN_TICKS && ticks.length <= MAX_TICKS) return ticks;
  }
  // 3. Under about one decade wide: round numbers on the linear scale, placed on the log axis.
  return niceLinearTicks(10 ** lo, 10 ** hi, 1);
}

/**
 * Where the reveal's pins and ticks sit on the line.
 *
 * ratio: log10 axis; interval: linear. The domain covers the truth and every
 * guess, padded by 12 % of the span on each side (a ratio span is at least 0.3
 * decades; an interval span at least 1 unit, 2 % of the truth, and for
 * `format: "year"` 5 years, so a lone value still sits on a line with some
 * length), clamped to `bounds` — but never so far that a value falls outside.
 * Equal guesses, a guess on the truth, a single guess and a zero (interval
 * rows) all produce a valid layout.
 *
 * `format` is optional and only widens a year row's minimum span; pass the
 * question's format.
 */
export function layoutNumberLine(input: {
  scale: EstimateScale;
  bounds: { minMilli: number; maxMilli: number };
  truthMilli: number;
  guessesMilli: readonly number[];
  format?: EstimateFormat;
}): AxisLayout {
  const { scale, bounds, truthMilli, guessesMilli, format } = input;
  const values = [truthMilli, ...guessesMilli].filter((v) => Number.isFinite(v));
  // Garbage in (no finite value at all): lay out the whole allowed range.
  if (values.length === 0) values.push(bounds.minMilli, bounds.maxMilli);

  if (scale === "ratio") {
    // A ratio value is at least 1 milli; clamp so log10 is always finite.
    const logs = values.map((v) => Math.log10(Math.max(v, 1)));
    const { lo, hi } = paddedDomain(
      Math.min(...logs),
      Math.max(...logs),
      MIN_LOG_SPAN,
      Math.log10(Math.max(bounds.minMilli, 1)),
      Math.log10(Math.max(bounds.maxMilli, 1)),
    );
    const width = hi - lo;
    const position = (milli: number): number =>
      milli > 0 ? clamp01((Math.log10(milli) - lo) / width) : 0;
    return {
      scale,
      domain: { loMilli: 10 ** lo, hiMilli: 10 ** hi },
      position,
      ticks: ratioTickValues(lo, hi).map((milli) => ({ milli, position: position(milli) })),
    };
  }

  const minSpan = Math.max(
    MIN_INTERVAL_SPAN_MILLI,
    TRUTH_SPAN_SHARE * Math.abs(truthMilli),
    format === "year" ? MIN_YEAR_SPAN_MILLI : 0,
  );
  const { lo, hi } = paddedDomain(
    Math.min(...values),
    Math.max(...values),
    Number.isFinite(minSpan) ? minSpan : MIN_INTERVAL_SPAN_MILLI,
    bounds.minMilli,
    bounds.maxMilli,
  );
  const width = hi - lo;
  const position = (milli: number): number => clamp01((milli - lo) / width);
  return {
    scale,
    domain: { loMilli: lo, hiMilli: hi },
    position,
    ticks: niceLinearTicks(lo, hi, format === "year" ? YEAR_MILLI : 1).map((milli) => ({
      milli,
      position: position(milli),
    })),
  };
}

/**
 * Lane (0-based) per pin id so near-identical positions stack instead of
 * overlapping. `minGap` is a fraction of the axis (the label width over the
 * track width: about 0.2 for a 56 px name on a 280 px track at 320 px wide;
 * 0.06 only keeps bare pins apart).
 *
 * Pins are visited by position, then id (so the result never depends on the
 * input order), and each takes the first lane whose last pin is at least
 * `minGap` away; if none fits it takes the last lane (`maxLanes`, default 4),
 * so more than `maxLanes` pins inside one `minGap` window overlap there.
 * A repeated id keeps the lane of its last occurrence.
 */
export function assignPinLanes(
  pins: readonly { id: string; position: number }[],
  minGap: number,
  maxLanes: number = DEFAULT_MAX_LANES,
): Record<string, number> {
  const gap = minGap > 0 ? minGap : 0; // also NaN
  // More lanes than pins are never needed: some lane is always still empty.
  const laneCount = Math.min(
    Number.isFinite(maxLanes) ? Math.max(1, Math.floor(maxLanes)) : DEFAULT_MAX_LANES,
    Math.max(1, pins.length),
  );
  const sorted = pins
    .map((pin) => ({ id: pin.id, position: Number.isFinite(pin.position) ? pin.position : 0 }))
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const lastInLane: number[] = Array.from({ length: laneCount }, () => -Infinity);
  const entries: [string, number][] = [];
  for (const pin of sorted) {
    let lane = laneCount - 1;
    for (let l = 0; l < laneCount; l++) {
      if (pin.position - lastInLane[l] >= gap) {
        lane = l;
        break;
      }
    }
    lastInLane[lane] = pin.position;
    entries.push([pin.id, lane]);
  }
  // `fromEntries` defines own properties, so an id such as "__proto__" is safe.
  return Object.fromEntries(entries);
}
