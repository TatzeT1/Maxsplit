import { describe, expect, it } from "vitest";
import { assignPinLanes, layoutNumberLine } from "./estimate-axis";

/** Seeded PRNG (mulberry32): the fuzz cases are the same on every run. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ESTIMATE_BOUNDS for a count and for a year (milli). */
const COUNT_BOUNDS = { minMilli: 1000, maxMilli: 10 ** 15 };
/** No clamping in the way: 1 milli .. the global maximum. */
const WIDE_BOUNDS = { minMilli: 1, maxMilli: 10 ** 15 };
const YEAR_BOUNDS = { minMilli: 0, maxMilli: 2_100_000 };
const PERCENT_BOUNDS = { minMilli: 0, maxMilli: 100_000 };
const TEMP_BOUNDS = { minMilli: 0, maxMilli: 10_000_000 };

function ratio(truthMilli: number, guessesMilli: number[], bounds = COUNT_BOUNDS) {
  return layoutNumberLine({ scale: "ratio", bounds, truthMilli, guessesMilli });
}

function interval(
  truthMilli: number,
  guessesMilli: number[],
  bounds = TEMP_BOUNDS,
  format?: "quantity" | "year",
) {
  return layoutNumberLine({ scale: "interval", bounds, truthMilli, guessesMilli, format });
}

function expectSaneTicks(layout: ReturnType<typeof layoutNumberLine>): void {
  const { ticks, domain } = layout;
  expect(ticks.length).toBeGreaterThanOrEqual(3);
  expect(ticks.length).toBeLessThanOrEqual(7);
  for (const [i, tick] of ticks.entries()) {
    expect(Number.isInteger(tick.milli)).toBe(true);
    expect(tick.position).toBeGreaterThanOrEqual(0);
    expect(tick.position).toBeLessThanOrEqual(1);
    expect(tick.position).toBe(layout.position(tick.milli));
    expect(tick.milli).toBeGreaterThanOrEqual(domain.loMilli * (1 - 1e-9));
    expect(tick.milli).toBeLessThanOrEqual(domain.hiMilli * (1 + 1e-9));
    if (i > 0) {
      expect(tick.milli).toBeGreaterThan(ticks[i - 1]!.milli);
      expect(tick.position).toBeGreaterThan(ticks[i - 1]!.position);
    }
  }
}

describe("layoutNumberLine: ratio rows", () => {
  it("covers truth and guesses with 12 % padding of the log span on each side", () => {
    // 1 .. 100 units = 10^3 .. 10^5 milli: span 2 decades, padding 0.24 -> [2.76, 5.24]
    const layout = ratio(10_000, [1_000, 100_000], WIDE_BOUNDS);
    expect(layout.scale).toBe("ratio");
    expect(Math.log10(layout.domain.loMilli)).toBeCloseTo(2.76, 9);
    expect(Math.log10(layout.domain.hiMilli)).toBeCloseTo(5.24, 9);
    expect(layout.position(1_000)).toBeCloseTo(0.24 / 2.48, 9);
    expect(layout.position(10_000)).toBeCloseTo(0.5, 9);
    expect(layout.position(100_000)).toBeCloseTo(1 - 0.24 / 2.48, 9);
  });

  it("places 1, 10 and 100 (and every decade) equidistantly", () => {
    const layout = ratio(10_000, [1_000, 100_000, 1_000_000, 10_000_000]);
    const p = [1_000, 10_000, 100_000, 1_000_000, 10_000_000].map((m) => layout.position(m));
    const steps = p.slice(1).map((x, i) => x - p[i]!);
    for (const step of steps) expect(step).toBeCloseTo(steps[0]!, 12);
    expect(steps[0]).toBeGreaterThan(0);
  });

  it("is strictly increasing across the domain and clamps outside it", () => {
    const layout = ratio(50_000, [2_000, 800_000]);
    let previous = -1;
    for (let log = 3; log < 6; log += 0.05) {
      const p = layout.position(10 ** log);
      expect(p).toBeGreaterThanOrEqual(previous);
      previous = p;
    }
    expect(layout.position(1)).toBe(0);
    expect(layout.position(10 ** 15)).toBe(1);
    expect(layout.position(0)).toBe(0);
    expect(layout.position(-5)).toBe(0);
    expect(layout.position(Number.NaN)).toBe(0);
    expect(layout.position(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("clamps the padded domain to the bounds, without clipping a value on the bound", () => {
    const low = ratio(1_000, [1_000, 5_000]);
    expect(low.domain.loMilli).toBe(1_000);
    expect(low.position(1_000)).toBe(0);
    expect(low.position(5_000)).toBeGreaterThan(0);
    expect(low.position(5_000)).toBeLessThan(1);

    const high = ratio(10 ** 12, [10 ** 11, 10 ** 12], { minMilli: 1000, maxMilli: 10 ** 12 });
    expect(high.domain.hiMilli).toBeCloseTo(10 ** 12, 0);
    expect(high.position(10 ** 12)).toBe(1);
    expect(high.position(10 ** 11)).toBeGreaterThan(0);
  });

  it("never lets a value fall outside the domain, even for inconsistent bounds", () => {
    const layout = ratio(1_000_000, [10, 10 ** 9], { minMilli: 1_000, maxMilli: 10_000 });
    expect(layout.position(10)).toBe(0);
    expect(layout.position(10 ** 9)).toBe(1);
    const p = layout.position(1_000_000);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("gives equal guesses, or a lone value, a line of positive width with the value centred", () => {
    for (const layout of [
      ratio(20_000, [20_000, 20_000, 20_000]),
      ratio(20_000, [20_000]),
      ratio(20_000, []),
    ]) {
      // 0.3 decades of span + 2 x 0.036 padding... centred: 0.372 decades in all
      const width = Math.log10(layout.domain.hiMilli) - Math.log10(layout.domain.loMilli);
      expect(width).toBeCloseTo(0.3 * 1.24, 9);
      expect(layout.position(20_000)).toBeCloseTo(0.5, 9);
    }
  });

  it("handles a guess on the truth and a guess far from it", () => {
    const layout = ratio(300_000, [300_000, 3_000]);
    expect(layout.position(300_000)).toBeGreaterThan(layout.position(3_000));
    expect(layout.position(3_000)).toBeCloseTo(0.12 / 1.24, 9);
    expect(layout.position(300_000)).toBeCloseTo(1 - 0.12 / 1.24, 9);
  });

  it("survives values below 1 milli and a zero lower bound (log10 stays finite)", () => {
    const layout = ratio(1, [0, 1], { minMilli: 0, maxMilli: 10 ** 15 });
    expect(Number.isFinite(layout.domain.loMilli)).toBe(true);
    expect(layout.domain.loMilli).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(layout.position(1))).toBe(true);
    expect(layout.position(0)).toBe(0);
  });

  it("ignores non-finite values, and lays out the bounds when nothing finite is left", () => {
    const withJunk = ratio(10_000, [Number.NaN, 1_000, Number.POSITIVE_INFINITY]);
    expect(withJunk.position(10_000)).toBeCloseTo(ratio(10_000, [1_000]).position(10_000), 12);
    const none = ratio(Number.NaN, []);
    expect(none.domain.loMilli).toBeCloseTo(1_000, 6);
    expect(none.domain.hiMilli).toBeCloseTo(10 ** 15, -3);
  });

  describe("ticks", () => {
    it("are the decades when there are at least three, equidistant on the axis", () => {
      const layout = ratio(100_000, [1_000, 10_000_000]);
      expect(layout.ticks.map((t) => t.milli)).toEqual([
        1_000, 10_000, 100_000, 1_000_000, 10_000_000,
      ]);
      const gaps = layout.ticks.slice(1).map((t, i) => t.position - layout.ticks[i]!.position);
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 12);
      expectSaneTicks(layout);
    });

    it("add 2 and 5 when fewer than three decades fit", () => {
      // 10^3 .. 4*10^4 milli: only 10^3 and 10^4 are decades
      const layout = ratio(10_000, [1_000, 40_000]);
      expect(layout.ticks.map((t) => t.milli)).toEqual([
        1_000, 2_000, 5_000, 10_000, 20_000, 50_000,
      ]);
      expectSaneTicks(layout);
    });

    it("thin the decades by units (every 3rd) when there are more than seven", () => {
      const layout = ratio(10 ** 8, [1, 10 ** 15], { minMilli: 1, maxMilli: 10 ** 15 });
      expect(layout.ticks.map((t) => t.milli)).toEqual([
        1,
        10 ** 3,
        10 ** 6,
        10 ** 9,
        10 ** 12,
        10 ** 15,
      ]);
      expectSaneTicks(layout);
    });

    it("use round numbers on a domain narrower than a decade", () => {
      // 1.1 .. 9.6 thousand milli
      const layout = ratio(5_000, [3_000, 8_000]);
      expect(layout.ticks.length).toBeGreaterThanOrEqual(3);
      for (const t of layout.ticks) expect(t.milli % 500).toBe(0);
      expectSaneTicks(layout);
    });

    it("hold 3..7 whole-milli ticks for 4 000 random ratio domains", () => {
      const next = rng(20250611);
      for (let i = 0; i < 4_000; i++) {
        // values anywhere between 10 milli and 10^15 milli, clustered or spread
        const centre = 1 + next() * 13.5;
        const spread = next() < 0.4 ? next() * 0.2 : next() * 6;
        const n = 1 + Math.floor(next() * 6);
        const guesses = Array.from({ length: n }, () =>
          Math.max(10, Math.min(10 ** 15, Math.round(10 ** (centre + (next() - 0.5) * spread)))),
        );
        const truth = Math.max(
          10,
          Math.min(10 ** 15, Math.round(10 ** (centre + (next() - 0.5) * spread))),
        );
        const layout = ratio(truth, guesses, { minMilli: 1, maxMilli: 10 ** 15 });
        expectSaneTicks(layout);
        for (const v of [truth, ...guesses]) {
          const p = layout.position(v);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});

describe("layoutNumberLine: interval rows", () => {
  it("is linear with 12 % padding of the span", () => {
    // 10 .. 30 degrees: span 20 000 milli, padding 2 400 -> [7 600, 32 400]
    const layout = interval(20_000, [10_000, 30_000]);
    expect(layout.scale).toBe("interval");
    expect(layout.domain.loMilli).toBeCloseTo(7_600, 9);
    expect(layout.domain.hiMilli).toBeCloseTo(32_400, 9);
    expect(layout.position(10_000)).toBeCloseTo(2_400 / 24_800, 9);
    expect(layout.position(20_000)).toBeCloseTo(0.5, 9);
    expect(layout.position(30_000)).toBeCloseTo(1 - 2_400 / 24_800, 9);
    // linear: equal differences map to equal distances
    const d1 = layout.position(15_000) - layout.position(10_000);
    const d2 = layout.position(30_000) - layout.position(25_000);
    expect(d1).toBeCloseTo(d2, 12);
  });

  it("clamps positions outside the domain", () => {
    const layout = interval(20_000, [10_000, 30_000]);
    expect(layout.position(-1_000_000)).toBe(0);
    expect(layout.position(10 ** 9)).toBe(1);
    expect(layout.position(Number.NaN)).toBe(0);
  });

  it("holds a zero guess on the lower bound (a year 0, 0 %, 0 degrees)", () => {
    const layout = interval(1_969_000, [0, 1_950_000], YEAR_BOUNDS, "year");
    expect(layout.domain.loMilli).toBe(0);
    expect(layout.position(0)).toBe(0);
    expect(layout.position(1_969_000)).toBeGreaterThan(layout.position(1_950_000));
    expect(layout.position(1_969_000)).toBeLessThan(1);
    expectSaneTicks(layout);

    const percent = interval(0, [0, 0], PERCENT_BOUNDS);
    expect(percent.domain.loMilli).toBe(0);
    expect(percent.position(0)).toBe(0);
    expect(percent.domain.hiMilli).toBeGreaterThan(0);
    expectSaneTicks(percent);
  });

  it("uses at least one unit, and 2 % of the truth, as the span", () => {
    // lone value: span 1 000, padding 120 -> 1 240 wide, centred
    const lone = interval(20_000, [20_000]);
    expect(lone.domain.hiMilli - lone.domain.loMilli).toBeCloseTo(1_240, 9);
    expect(lone.position(20_000)).toBeCloseTo(0.5, 9);
    // 2 % of a 1 969 000 truth = 39 380 > the guesses' 1 000 span
    const near = interval(1_969_000, [1_968_500, 1_969_500], YEAR_BOUNDS);
    expect(near.domain.hiMilli - near.domain.loMilli).toBeCloseTo(39_380 * 1.24, 6);
  });

  it("makes a year row at least 5 years wide when it is told it is a year", () => {
    // year 100: 2 % of the truth is only 2 000 milli
    const plain = interval(100_000, [100_000], YEAR_BOUNDS);
    expect(plain.domain.hiMilli - plain.domain.loMilli).toBeCloseTo(2_000 * 1.24, 9);
    const year = interval(100_000, [100_000], YEAR_BOUNDS, "year");
    expect(year.domain.hiMilli - year.domain.loMilli).toBeCloseTo(5_000 * 1.24, 9);
    // whole years on the ticks
    for (const t of year.ticks) expect(t.milli % 1_000).toBe(0);
    expectSaneTicks(year);
  });

  it("clamps to the bounds and keeps a value on the bound inside", () => {
    const layout = interval(100_000, [100_000, 99_000], PERCENT_BOUNDS);
    expect(layout.domain.hiMilli).toBe(100_000);
    expect(layout.position(100_000)).toBe(1);
    expect(layout.position(99_000)).toBeLessThan(1);
    expect(Math.max(...layout.ticks.map((t) => t.milli))).toBeLessThanOrEqual(100_000);
    expectSaneTicks(layout);
  });

  it("copes with equal guesses and a guess on the truth", () => {
    for (const layout of [
      interval(42_000, [42_000, 42_000]),
      interval(42_000, [42_000]),
      interval(42_000, [40_000, 40_000, 40_000]),
      interval(42_000, []),
    ]) {
      expect(layout.domain.hiMilli).toBeGreaterThan(layout.domain.loMilli);
      expect(layout.position(42_000)).toBeGreaterThan(0);
      expect(layout.position(42_000)).toBeLessThan(1);
      expectSaneTicks(layout);
    }
  });

  describe("ticks", () => {
    it("are nice steps: whole decades of years for 1900..2020", () => {
      const layout = interval(1_969_000, [1_900_000, 2_020_000], YEAR_BOUNDS, "year");
      // domain 1 885.6 .. 2 034.4 -> 7 ticks max, 20-year steps
      expect(layout.ticks.map((t) => t.milli)).toEqual([
        1_900_000, 1_920_000, 1_940_000, 1_960_000, 1_980_000, 2_000_000, 2_020_000,
      ]);
      expectSaneTicks(layout);
    });

    it("are evenly spread on the line", () => {
      const layout = interval(20_000, [10_000, 30_000]);
      const gaps = layout.ticks.slice(1).map((t, i) => t.position - layout.ticks[i]!.position);
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 12);
    });

    it("hold 3..7 whole-milli ticks for 4 000 random interval domains", () => {
      const next = rng(7_000_001);
      const classes = [
        { bounds: TEMP_BOUNDS, format: "quantity" as const, scale: 10_000_000 },
        { bounds: PERCENT_BOUNDS, format: "quantity" as const, scale: 100_000 },
        { bounds: YEAR_BOUNDS, format: "year" as const, scale: 2_100_000 },
      ];
      for (let i = 0; i < 4_000; i++) {
        const c = classes[i % classes.length]!;
        const centre = next() * c.scale;
        const spread = (next() < 0.4 ? next() * 0.01 : next()) * c.scale;
        const pick = () =>
          Math.max(0, Math.min(c.scale, Math.round(centre + (next() - 0.5) * spread)));
        const guesses = Array.from({ length: 1 + Math.floor(next() * 6) }, pick);
        const truth = pick();
        const layout = interval(truth, guesses, c.bounds, c.format);
        expectSaneTicks(layout);
        for (const v of [truth, ...guesses]) {
          expect(layout.position(v)).toBeGreaterThanOrEqual(0);
          expect(layout.position(v)).toBeLessThanOrEqual(1);
        }
        // the data itself is never clipped
        expect(layout.domain.loMilli).toBeLessThanOrEqual(Math.min(truth, ...guesses));
        expect(layout.domain.hiMilli).toBeGreaterThanOrEqual(Math.max(truth, ...guesses));
      }
    });
  });
});

describe("layoutNumberLine: determinism", () => {
  it("returns the same layout for the same input, whatever the guess order", () => {
    const a = layoutNumberLine({
      scale: "ratio",
      bounds: COUNT_BOUNDS,
      truthMilli: 8_848_000,
      guessesMilli: [5_000_000, 9_000_000, 100_000_000, 1_000_000],
    });
    const b = layoutNumberLine({
      scale: "ratio",
      bounds: COUNT_BOUNDS,
      truthMilli: 8_848_000,
      guessesMilli: [1_000_000, 100_000_000, 9_000_000, 5_000_000],
    });
    expect(b.domain).toEqual(a.domain);
    expect(b.ticks).toEqual(a.ticks);
    for (const m of [1, 10 ** 3, 8_848_000, 10 ** 9]) expect(b.position(m)).toBe(a.position(m));
  });
});

describe("assignPinLanes", () => {
  const pin = (id: string, position: number) => ({ id, position });

  it("puts three near-identical guesses in lanes 0, 1, 2", () => {
    expect(assignPinLanes([pin("a", 0.5), pin("b", 0.5), pin("c", 0.51)], 0.06)).toEqual({
      a: 0,
      b: 1,
      c: 2,
    });
  });

  it("keeps pins that are far enough apart on lane 0", () => {
    expect(assignPinLanes([pin("a", 0.1), pin("b", 0.3), pin("c", 0.9)], 0.06)).toEqual({
      a: 0,
      b: 0,
      c: 0,
    });
  });

  it("treats exactly minGap as far enough, and just under it as a collision", () => {
    expect(assignPinLanes([pin("a", 0.25), pin("b", 0.5)], 0.25)).toEqual({ a: 0, b: 0 });
    expect(assignPinLanes([pin("a", 0.25), pin("b", 0.4999)], 0.25)).toEqual({ a: 0, b: 1 });
  });

  it("reuses the first lane that has cleared", () => {
    expect(
      assignPinLanes([pin("a", 0.1), pin("b", 0.12), pin("c", 0.3), pin("d", 0.31)], 0.06),
    ).toEqual({ a: 0, b: 1, c: 0, d: 1 });
  });

  it("falls back to the last lane when no lane fits", () => {
    const pins = ["a", "b", "c", "d", "e", "f"].map((id) => pin(id, 0.5));
    expect(assignPinLanes(pins, 0.06)).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 3, f: 3 });
    expect(assignPinLanes(pins, 0.06, 2)).toEqual({ a: 0, b: 1, c: 1, d: 1, e: 1, f: 1 });
    expect(assignPinLanes(pins, 0.06, 1)).toEqual({ a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 });
  });

  it("does not depend on the order of the input", () => {
    const pins = [pin("m", 0.4), pin("a", 0.4), pin("z", 0.42), pin("k", 0.9), pin("b", 0.1)];
    const expected = assignPinLanes(pins, 0.06);
    expect(expected).toEqual({ b: 0, a: 0, m: 1, z: 2, k: 0 });
    const next = rng(99);
    for (let i = 0; i < 50; i++) {
      const shuffled = [...pins].sort(() => next() - 0.5);
      expect(assignPinLanes(shuffled, 0.06)).toEqual(expected);
    }
  });

  it("is stable for equal positions: the smaller id takes the lower lane", () => {
    expect(assignPinLanes([pin("u2", 0.3), pin("u1", 0.3)], 0.06)).toEqual({ u1: 0, u2: 1 });
  });

  it("returns {} for no pins and ignores a minGap of 0 (everyone on lane 0)", () => {
    expect(assignPinLanes([], 0.06)).toEqual({});
    expect(assignPinLanes([pin("a", 0.5), pin("b", 0.5)], 0)).toEqual({ a: 0, b: 0 });
    expect(assignPinLanes([pin("a", 0.5), pin("b", 0.5)], Number.NaN)).toEqual({ a: 0, b: 0 });
  });

  it("copes with a bad maxLanes and a non-finite position", () => {
    const pins = [pin("a", 0.5), pin("b", 0.5)];
    expect(assignPinLanes(pins, 0.06, 0)).toEqual({ a: 0, b: 0 });
    expect(assignPinLanes(pins, 0.06, Number.NaN)).toEqual({ a: 0, b: 1 });
    expect(assignPinLanes([pin("a", Number.NaN), pin("b", 0)], 0.06)).toEqual({ a: 0, b: 1 });
  });

  it("is safe for ids that are object keys", () => {
    const lanes = assignPinLanes([pin("__proto__", 0.5), pin("constructor", 0.5)], 0.06);
    expect(Object.keys(lanes).sort()).toEqual(["__proto__", "constructor"]);
    expect(Object.getOwnPropertyDescriptor(lanes, "__proto__")?.value).toBe(0);
    expect(lanes.constructor).toBe(1);
  });

  it("never lets two pins on the same lane sit closer than minGap (except the overflow lane)", () => {
    const next = rng(31337);
    for (let i = 0; i < 2_000; i++) {
      const n = 1 + Math.floor(next() * 12);
      const maxLanes = 1 + Math.floor(next() * 5);
      const minGap = next() * 0.3;
      // clustered: many pins land in the same neighbourhood
      const pins = Array.from({ length: n }, (_, k) =>
        pin(`p${k}`, next() < 0.5 ? 0.4 + next() * 0.1 : next()),
      );
      const lanes = assignPinLanes(pins, minGap, maxLanes);
      expect(Object.keys(lanes)).toHaveLength(n);
      for (const lane of Object.values(lanes)) {
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThan(maxLanes);
      }
      for (let lane = 0; lane < maxLanes - 1; lane++) {
        const positions = pins
          .filter((p) => lanes[p.id] === lane)
          .map((p) => p.position)
          .sort((a, b) => a - b);
        for (let j = 1; j < positions.length; j++) {
          expect(positions[j]! - positions[j - 1]!).toBeGreaterThanOrEqual(minGap);
        }
      }
    }
  });

  it("keeps up to four name labels apart on a 320 px phone", () => {
    // 320 px screen, 16 px gutters, 280 px track, a name label up to 56 px wide
    const minGap = 56 / 280;
    const next = rng(320);
    for (let i = 0; i < 2_000; i++) {
      const n = 1 + Math.floor(next() * 4);
      const pins = Array.from({ length: n }, (_, k) => pin(`p${k}`, 0.3 + next() * 0.15));
      const lanes = assignPinLanes(pins, minGap);
      // four pins or fewer always get a lane of their own when they crowd
      for (let lane = 0; lane < 4; lane++) {
        const px = pins
          .filter((p) => lanes[p.id] === lane)
          .map((p) => p.position * 280)
          .sort((a, b) => a - b);
        for (let j = 1; j < px.length; j++)
          expect(px[j]! - px[j - 1]!).toBeGreaterThanOrEqual(56 - 1e-9);
      }
    }
  });
});
