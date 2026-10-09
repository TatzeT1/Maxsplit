// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ESTIMATE_MAX_MILLI,
  ESTIMATE_MAX_STECHEN,
  compareEstimateDistance,
  estimateDistance,
  isEstimateDecided,
  roundPayers,
} from "@/lib/games/estimate-input";
import {
  classifyEstimate,
  isEstimateTie,
  isStrictlyFurther,
  lotPicks,
  resolveEstimateStage,
  type EstimateClassification,
  type EstimateStageResolution,
} from "@/lib/games/estimate-rules";
import { secureShuffle } from "@/lib/games/random";
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";
import type {
  EstimatePrecedes,
  EstimatePublicQuestion,
  EstimateRound,
  EstimateScale,
  EstimateStage,
  EstimateTolerance,
} from "@/lib/types";
import { makeEstimateRow } from "@/test/estimate-bank-fixture";

/** Deterministic PRNG (mulberry32): no Math.random anywhere in these tests. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rand: () => number, below: number): number {
  return Math.floor(rand() * below);
}

function pick<T>(rand: () => number, items: readonly T[]): T {
  return items[int(rand, items.length)];
}

/** Fisher-Yates driven by a seeded generator (the injected "shuffle" of these tests). */
function seededShuffle(rand: () => number): <T>(items: T[]) => T[] {
  return <T>(items: T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = int(rand, i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
}

const reverse = <T>(items: T[]): T[] => [...items].reverse();

const interval = (milli: number): EstimateTolerance => ({ kind: "interval", milli });
const ratio = (permille: number): EstimateTolerance => ({ kind: "ratio", permille });

// ---------------------------------------------------------------------------
// The reference model: independent of the production code, brute force.
//
// It never uses the closed-form tie test. It sweeps the truth across the whole
// band on an exact grid (interval: every integer in [t - tau, t + tau]; ratio:
// t * (1000 + d) / 1000 for every whole permille d in [-p, p], kept as the
// fraction num/den) and asks, for two guesses, whether one is further off at
// EVERY grid truth ("certainly further"). All values in these games are small
// (< 10^7), so every cross product stays below 2^53 and plain numbers are exact.
// Who certainly pays or is certainly safe is then read off by enumerating every
// possible payer set (the first k of every linear extension of the relation).
// ---------------------------------------------------------------------------

interface RefGame {
  scale: EstimateScale;
  /** The nominal truth, milli. */
  t: number;
  /** interval: half-width in milli; ratio: permille. 0 = no tolerance. */
  tol: number;
  entries: [string, number | null][];
  k: number;
  /** Strict facts of earlier stages: [further, closer]. */
  inherited: [string, string][];
}

interface Truth {
  num: number;
  den: number;
}

/** An error as the fraction n/d (ratio: hi/lo; interval: |diff|/1); `null` = infinite. */
type Err = { n: number; d: number } | null;

function refGrid(game: RefGame): Truth[] {
  const out: Truth[] = [];
  if (game.scale === "interval") {
    for (let truth = game.t - game.tol; truth <= game.t + game.tol; truth += 1) {
      out.push({ num: truth, den: 1 });
    }
  } else {
    for (let d = -game.tol; d <= game.tol; d += 1) {
      out.push({ num: game.t * (1000 + d), den: 1000 });
    }
  }
  return out;
}

function refError(scale: EstimateScale, guess: number | null, truth: Truth): Err {
  if (guess === null) return null;
  if (scale === "interval") return { n: Math.abs(guess * truth.den - truth.num), d: truth.den };
  const scaled = guess * truth.den;
  return scaled >= truth.num ? { n: scaled, d: truth.num } : { n: truth.num, d: scaled };
}

/** +1: `a` is the further error. */
function refCompare(a: Err, b: Err): number {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return Math.sign(a.n * b.d - b.n * a.d);
}

function refClose(pairs: Set<string>): Set<string> {
  const out = new Set(pairs);
  for (let changed = true; changed;) {
    changed = false;
    for (const ab of [...out]) {
      for (const bc of [...out]) {
        const [a, b] = ab.split(">");
        const [b2, c] = bc.split(">");
        if (b === b2 && !out.has(`${a}>${c}`)) {
          out.add(`${a}>${c}`);
          changed = true;
        }
      }
    }
  }
  return out;
}

interface RefResult {
  ranked: string[];
  payers: string[];
  safe: string[];
  contested: string[];
  slots: number;
  /** "further>closer" among the contested. */
  precedes: string[];
  /** The whole relation R, "x>y". */
  relation: Set<string>;
}

function refClassify(game: RefGame): RefResult {
  const grid = refGrid(game);
  const errors = grid.map((truth) =>
    Object.fromEntries(
      game.entries.map(([uid, guess]) => [uid, refError(game.scale, guess, truth)]),
    ),
  );
  const guessOf = Object.fromEntries(game.entries);
  const centre = errors[(grid.length - 1) / 2];

  // Nominal order: missing first (by uid), then furthest first, smaller guess, uid.
  const order = game.entries
    .map(([uid]) => uid)
    .sort((x, y) => {
      const c = refCompare(centre[x], centre[y]);
      if (c !== 0) return -c;
      const gx = guessOf[x];
      const gy = guessOf[y];
      if (gx !== null && gy !== null && gx !== gy) return gx < gy ? -1 : 1;
      return x < y ? -1 : 1;
    });

  const strictlyFurther = (x: string, y: string) =>
    errors.every((table) => refCompare(table[x], table[y]) > 0);

  let relation = refClose(
    new Set(game.inherited.map(([further, closer]) => `${further}>${closer}`)),
  );
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const [x, y] = [order[i], order[j]];
      if (relation.has(`${y}>${x}`)) continue;
      if (strictlyFurther(x, y)) relation = refClose(new Set([...relation, `${x}>${y}`]));
    }
  }

  // Every possible payer set: the first k of any linear extension (furthest first) of the relation.
  const tops = new Set<string>();
  const walk = (placed: string[]) => {
    if (placed.length === game.k) {
      tops.add([...placed].sort().join(","));
      return;
    }
    for (const u of order) {
      if (placed.includes(u)) continue;
      if (order.every((x) => !relation.has(`${x}>${u}`) || placed.includes(x)))
        walk([...placed, u]);
    }
  };
  walk([]);
  const sets = [...tops].map((key) => new Set(key.split(",")));
  const payers = order.filter((u) => sets.every((s) => s.has(u)));
  const safe = order.filter((u) => sets.every((s) => !s.has(u)));
  const contested = order.filter((u) => !payers.includes(u) && !safe.includes(u));
  const precedes = [...relation].filter((pair) => {
    const [x, y] = pair.split(">");
    return contested.includes(x) && contested.includes(y);
  });
  return {
    ranked: order,
    payers,
    safe,
    contested,
    slots: game.k - payers.length,
    precedes: precedes.sort(),
    relation,
  };
}

/** Every payer set that some truth in the band and some tie-break among exactly equal players can produce (no inherited facts). */
function refFeasiblePayerSets(game: RefGame): Set<string>[] {
  const out: Set<string>[] = [];
  for (const truth of refGrid(game)) {
    const errs = game.entries.map(([uid, guess]) => ({
      uid,
      err: refError(game.scale, guess, truth),
    }));
    errs.sort((a, b) => -refCompare(a.err, b.err));
    const cutoff = errs[game.k - 1].err;
    const above = errs.filter((e) => refCompare(e.err, cutoff) > 0).map((e) => e.uid);
    const group = errs.filter((e) => refCompare(e.err, cutoff) === 0).map((e) => e.uid);
    const need = game.k - above.length;
    const choose = (from: number, picked: string[]) => {
      if (picked.length === need) {
        out.push(new Set([...above, ...picked]));
        return;
      }
      for (let i = from; i < group.length; i += 1) choose(i + 1, [...picked, group[i]]);
    };
    choose(0, []);
  }
  return out;
}

function toTolerance(game: RefGame): EstimateTolerance | null {
  if (game.tol === 0) return null;
  return game.scale === "interval" ? interval(game.tol) : ratio(game.tol);
}

function runClassify(
  game: RefGame,
  entries: readonly [string, number | null][] = game.entries,
): EstimateClassification {
  return classifyEstimate({
    scale: game.scale,
    truth: game.t,
    tolerance: toTolerance(game),
    entries: entries.map(([uid, guess]) => ({ uid, guess })),
    payerCount: game.k,
    precedes: game.inherited.map(([further, closer]) => ({ further, closer })),
  });
}

function pairKey(p: EstimatePrecedes): string {
  return `${p.further}>${p.closer}`;
}

// Thousands of games run through the hot loops below. Building a failure label
// (usually the JSON of a whole game) for every single `expect` would dominate
// the runtime, so these helpers build it only when the check actually fails.

/** `expect(actual).toEqual(expected)`, with a label that is only built on failure. */
function same(actual: unknown, expected: unknown, label: () => string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    expect(actual, label()).toEqual(expected);
}

/** Fails with `label()` unless `condition`. */
function holds(condition: boolean, label: () => string): void {
  if (!condition) throw new Error(label());
}

/** The production result must be exactly what the brute-force reference says. */
function expectMatchesReference(
  game: RefGame,
  result: EstimateClassification,
  label: () => string,
): RefResult {
  const ref = refClassify(game);
  same(
    result.ranked.map((r) => r.uid),
    ref.ranked,
    () => `ranked ${label()}`,
  );
  same(result.payers, ref.payers, () => `payers ${label()}`);
  same(result.safe, ref.safe, () => `safe ${label()}`);
  same(result.contested, ref.contested, () => `contested ${label()}`);
  same(result.slots, ref.slots, () => `slots ${label()}`);
  same(result.precedes.map(pairKey).sort(), ref.precedes, () => `precedes ${label()}`);
  return ref;
}

// ---------------------------------------------------------------------------
// Random games
// ---------------------------------------------------------------------------

const RATIO_FACTORS: readonly [number, number][] = [
  [1, 3],
  [1, 2],
  [3, 4],
  [1, 1],
  [5, 4],
  [2, 1],
  [3, 1],
  [5, 2],
  [11, 10],
  [9, 10],
  [101, 100],
  [99, 100],
  [7, 5],
  [5, 7],
];

function genGame(
  rand: () => number,
  options: { minPlayers?: number; maxPlayers?: number; missing?: number; inherited?: boolean } = {},
): RefGame {
  const { minPlayers = 2, maxPlayers = 6, missing = 0.12, inherited = false } = options;
  const scale: EstimateScale = rand() < 0.62 ? "interval" : "ratio";
  const n = minPlayers + int(rand, maxPlayers - minPlayers + 1);
  const k = 1 + int(rand, n - 1);
  const guesses: (number | null)[] = [];
  let t: number;
  let tol: number;
  if (scale === "interval") {
    t = 40 + int(rand, 121);
    tol = pick(rand, [0, 0, 3, 8, 15]);
  } else {
    t = pick(rand, [100, 1000]);
    tol = pick(rand, [0, 0, 5, 20, 50, 100]);
  }
  for (let i = 0; i < n; i += 1) {
    const r = rand();
    let guess: number | null;
    if (r < missing) guess = null;
    else if (scale === "interval") {
      if (r < 0.55) guess = Math.max(0, t + int(rand, 61) - 30);
      else if (r < 0.7 && guesses.length > 0 && guesses[guesses.length - 1] !== null) {
        guess = Math.max(0, 2 * t - (guesses[guesses.length - 1] as number)); // the exact mirror image
      } else guess = int(rand, 251);
    } else if (r < 0.7 && guesses.length > 0 && guesses[guesses.length - 1] !== null) {
      const last = guesses[guesses.length - 1] as number;
      guess = (t * t) % last === 0 ? (t * t) / last : t; // the exact geometric mirror, when whole
    } else {
      const [num, den] = pick(rand, RATIO_FACTORS);
      guess = Math.max(1, Math.floor((t * num) / den));
    }
    guesses.push(guess);
  }
  const entries = guesses.map((guess, i): [string, number | null] => [`u${i}`, guess]);
  const facts: [string, string][] = [];
  if (inherited) {
    const order = seededShuffle(rand)(entries.map(([uid]) => uid));
    for (let i = 0; i < order.length; i += 1) {
      for (let j = i + 1; j < order.length; j += 1) {
        if (rand() < 0.2) facts.push([order[i], order[j]]);
      }
    }
  }
  return { scale, t, tol, entries, k, inherited: facts };
}

// ---------------------------------------------------------------------------
// Worked examples (spec C.7), literally
// ---------------------------------------------------------------------------

interface Example {
  name: string;
  scale: EstimateScale;
  truth: number;
  tolerance: EstimateTolerance | null;
  k: number;
  entries: [string, number | null][];
  ranked: string[];
  payers: string[];
  safe: string[];
  contested: string[];
  slots: number;
  precedes?: string[];
}

const EXAMPLES: Example[] = [
  {
    name: "E1 ratio, exact tie across the line (100*100 == 200*50)",
    scale: "ratio",
    truth: 100,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 50],
      ["B", 200],
    ],
    ranked: ["A", "B"],
    payers: [],
    safe: [],
    contested: ["A", "B"],
    slots: 1,
  },
  {
    name: "E2a interval, no tolerance",
    scale: "interval",
    truth: 100_000,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 90_000],
      ["B", 111_000],
    ],
    ranked: ["B", "A"],
    payers: ["B"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E2b interval, tolerance 1 (|90+111-200| = 1 <= 2)",
    scale: "interval",
    truth: 100_000,
    tolerance: interval(1_000),
    k: 1,
    entries: [
      ["A", 90_000],
      ["B", 111_000],
    ],
    ranked: ["B", "A"],
    payers: [],
    safe: [],
    contested: ["B", "A"],
    slots: 1,
  },
  {
    name: "E2c interval, tolerance 0.4 (1 > 0.8)",
    scale: "interval",
    truth: 100_000,
    tolerance: interval(400),
    k: 1,
    entries: [
      ["A", 90_000],
      ["B", 111_000],
    ],
    ranked: ["B", "A"],
    payers: ["B"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E2d interval, tolerance 0.5 (boundary: 1 <= 2 * 0.5)",
    scale: "interval",
    truth: 100_000,
    tolerance: interval(500),
    k: 1,
    entries: [
      ["A", 90_000],
      ["B", 111_000],
    ],
    ranked: ["B", "A"],
    payers: [],
    safe: [],
    contested: ["B", "A"],
    slots: 1,
  },
  {
    name: "E3 ratio 0 permille",
    scale: "ratio",
    truth: 1_000,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 900],
      ["B", 1_120],
    ],
    ranked: ["B", "A"],
    payers: ["B"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E3b ratio 2 permille",
    scale: "ratio",
    truth: 1_000,
    tolerance: ratio(2),
    k: 1,
    entries: [
      ["A", 900],
      ["B", 1_120],
    ],
    ranked: ["B", "A"],
    payers: ["B"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E3b' ratio 3 permille (sqrt(900*1120) = 1003.99 > 1003)",
    scale: "ratio",
    truth: 1_000,
    tolerance: ratio(3),
    k: 1,
    entries: [
      ["A", 900],
      ["B", 1_120],
    ],
    ranked: ["B", "A"],
    payers: ["B"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E3c ratio 4 permille (sqrt(900*1120) = 1003.99 lies in the band)",
    scale: "ratio",
    truth: 1_000,
    tolerance: ratio(4),
    k: 1,
    entries: [
      ["A", 900],
      ["B", 1_120],
    ],
    ranked: ["B", "A"],
    payers: [],
    safe: [],
    contested: ["B", "A"],
    slots: 1,
  },
  {
    name: "E3c ratio 20 permille (2 %)",
    scale: "ratio",
    truth: 1_000,
    tolerance: ratio(20),
    k: 1,
    entries: [
      ["A", 900],
      ["B", 1_120],
    ],
    ranked: ["B", "A"],
    payers: [],
    safe: [],
    contested: ["B", "A"],
    slots: 1,
  },
  {
    name: "E3d ratio 100 permille (boundary: 121*100 = 100^2 * 1.1^2)",
    scale: "ratio",
    truth: 100,
    tolerance: ratio(100),
    k: 1,
    entries: [
      ["A", 121],
      ["B", 100],
    ],
    ranked: ["A", "B"],
    payers: [],
    safe: [],
    contested: ["A", "B"],
    slots: 1,
  },
  {
    name: "E3d ratio 99 permille (decided)",
    scale: "ratio",
    truth: 100,
    tolerance: ratio(99),
    k: 1,
    entries: [
      ["A", 121],
      ["B", 100],
    ],
    ranked: ["A", "B"],
    payers: ["A"],
    safe: ["B"],
    contested: [],
    slots: 0,
  },
  {
    name: "E4 interval, exact tie on the line (smaller guess first)",
    scale: "interval",
    truth: 50,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 40],
      ["B", 60],
      ["C", 55],
    ],
    ranked: ["A", "B", "C"],
    payers: [],
    safe: ["C"],
    contested: ["A", "B"],
    slots: 1,
  },
  {
    name: "E5 interval, tolerance 10 (A-B strict, A-C and B-C tied)",
    scale: "interval",
    truth: 100,
    tolerance: interval(10),
    k: 1,
    entries: [
      ["A", 60],
      ["B", 70],
      ["C", 125],
    ],
    ranked: ["A", "B", "C"],
    payers: [],
    safe: ["B"],
    contested: ["A", "C"],
    slots: 1,
  },
  {
    name: "E6a a missing guess ranks furthest",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 120],
      ["B", null],
      ["C", 95],
    ],
    ranked: ["B", "A", "C"],
    payers: ["B"],
    safe: ["A", "C"],
    contested: [],
    slots: 0,
  },
  {
    name: "E6b the same with k = 2",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 2,
    entries: [
      ["A", 120],
      ["B", null],
      ["C", 95],
    ],
    ranked: ["B", "A", "C"],
    payers: ["B", "A"],
    safe: ["C"],
    contested: [],
    slots: 0,
  },
  {
    name: "E6c two missing guesses are tied",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 120],
      ["B", null],
      ["C", null],
    ],
    ranked: ["B", "C", "A"],
    payers: [],
    safe: ["A"],
    contested: ["B", "C"],
    slots: 1,
  },
  {
    name: "E6d the same with k = 2",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 2,
    entries: [
      ["A", 120],
      ["B", null],
      ["C", null],
    ],
    ranked: ["B", "C", "A"],
    payers: ["B", "C"],
    safe: ["A"],
    contested: [],
    slots: 0,
  },
  {
    name: "E7 ratio, k = 2",
    scale: "ratio",
    truth: 100,
    tolerance: null,
    k: 2,
    entries: [
      ["A", 50],
      ["B", 200],
      ["C", 25],
      ["D", 100],
    ],
    ranked: ["C", "A", "B", "D"],
    payers: ["C"],
    safe: ["D"],
    contested: ["A", "B"],
    slots: 1,
  },
  {
    name: "E8 identical guesses are tied",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 1,
    entries: [
      ["A", 70],
      ["B", 70],
      ["C", 99],
    ],
    ranked: ["A", "B", "C"],
    payers: [],
    safe: ["C"],
    contested: ["A", "B"],
    slots: 1,
  },
  {
    name: "E9 interval, k = 2",
    scale: "interval",
    truth: 100,
    tolerance: null,
    k: 2,
    entries: [
      ["A", 10],
      ["B", 130],
      ["C", 70],
      ["D", 101],
    ],
    ranked: ["A", "C", "B", "D"],
    payers: ["A"],
    safe: ["D"],
    contested: ["C", "B"],
    slots: 1,
  },
  {
    name: "E10 the review counterexample: B is certainly further than C, so C is safe",
    scale: "interval",
    truth: 100,
    tolerance: interval(15),
    k: 1,
    entries: [
      ["A", 50],
      ["B", 130],
      ["C", 125],
    ],
    ranked: ["A", "B", "C"],
    payers: [],
    safe: ["C"],
    contested: ["A", "B"],
    slots: 1,
    precedes: [],
  },
  {
    name: "E11 the strict facts C->A and D->B are carried",
    scale: "interval",
    truth: 100,
    tolerance: interval(10),
    k: 2,
    entries: [
      ["A", 90],
      ["B", 110],
      ["C", 70],
      ["D", 130],
    ],
    ranked: ["C", "D", "A", "B"],
    payers: [],
    safe: [],
    contested: ["C", "D", "A", "B"],
    slots: 2,
    precedes: ["C>A", "D>B"],
  },
];

describe("classifyEstimate: the worked examples of spec C.7", () => {
  it.each(EXAMPLES)("$name", (example) => {
    const result = classifyEstimate({
      scale: example.scale,
      truth: example.truth,
      tolerance: example.tolerance,
      entries: example.entries.map(([uid, guess]) => ({ uid, guess })),
      payerCount: example.k,
    });
    expect(result.ranked.map((r) => r.uid)).toEqual(example.ranked);
    expect(result.ranked.map((r) => r.rank)).toEqual(example.ranked.map((_, i) => i + 1));
    expect(result.payers).toEqual(example.payers);
    expect(result.safe).toEqual(example.safe);
    expect(result.contested).toEqual(example.contested);
    expect(result.slots).toBe(example.slots);
    if (example.precedes) expect(result.precedes.map(pairKey)).toEqual(example.precedes);
  });

  it("fills ranked with distance and guess (E1: both factor 2, an exact tie)", () => {
    const result = classifyEstimate({
      scale: "ratio",
      truth: 100,
      tolerance: null,
      entries: [
        { uid: "A", guess: 50 },
        { uid: "B", guess: 200 },
      ],
      payerCount: 1,
    });
    expect(result.ranked[0]).toEqual({
      uid: "A",
      guess: 50,
      distance: { kind: "ratio", hi: 100, lo: 50, direction: "low" },
      rank: 1,
    });
    expect(result.ranked[1]).toEqual({
      uid: "B",
      guess: 200,
      distance: { kind: "ratio", hi: 200, lo: 100, direction: "high" },
      rank: 2,
    });
    const [a, b] = result.ranked;
    expect(compareEstimateDistance(a.distance!, b.distance!)).toBe(0);
  });

  it("matches the brute-force reference on every example (and on E11 with its facts)", () => {
    for (const example of EXAMPLES) {
      const game: RefGame = {
        scale: example.scale,
        t: example.truth,
        tol:
          example.tolerance === null
            ? 0
            : example.tolerance.kind === "interval"
              ? example.tolerance.milli
              : example.tolerance.permille,
        entries: example.entries,
        k: example.k,
        inherited: [],
      };
      expectMatchesReference(game, runClassify(game), () => example.name);
    }
  });

  it("E11 continued: the Stechfrage must respect the inherited facts (C->A, D->B)", () => {
    const entries = [
      { uid: "A", guess: 90 },
      { uid: "B", guess: 55 },
      { uid: "C", guess: 52 },
      { uid: "D", guess: 58 },
    ];
    const withFacts = classifyEstimate({
      scale: "interval",
      truth: 50,
      tolerance: null,
      entries,
      payerCount: 2,
      precedes: [
        { further: "C", closer: "A" },
        { further: "D", closer: "B" },
      ],
    });
    // The relation closes to C -> A -> D -> B: C and A are the certain payers.
    expect(withFacts.payers).toEqual(["A", "C"]);
    expect(withFacts.safe).toEqual(["D", "B"]);
    expect(withFacts.contested).toEqual([]);
    expect(withFacts.slots).toBe(0);
    // Without them A (40) and D (8) would pay although C is certainly further off than A.
    const without = classifyEstimate({
      scale: "interval",
      truth: 50,
      tolerance: null,
      entries,
      payerCount: 2,
    });
    expect(without.payers).toEqual(["A", "D"]);
  });
});

// ---------------------------------------------------------------------------
// isEstimateTie / isStrictlyFurther
// ---------------------------------------------------------------------------

describe("isEstimateTie / isStrictlyFurther", () => {
  const tie = (
    scale: EstimateScale,
    truth: number,
    tolerance: EstimateTolerance | null,
    a: number | null,
    b: number | null,
  ) => isEstimateTie({ scale, truth, tolerance, a, b });
  const further = (
    scale: EstimateScale,
    truth: number,
    tolerance: EstimateTolerance | null,
    a: number | null,
    b: number | null,
  ) => isStrictlyFurther({ scale, truth, tolerance, a, b });

  it("interval: equal guesses and mirror images tie, the band widens it, the boundary is inclusive", () => {
    expect(tie("interval", 100, null, 70, 70)).toBe(true);
    expect(tie("interval", 100, null, 70, 130)).toBe(true);
    expect(tie("interval", 100, null, 90, 111)).toBe(false);
    expect(tie("interval", 100_000, interval(500), 90_000, 111_000)).toBe(true);
    expect(tie("interval", 100_000, interval(499), 90_000, 111_000)).toBe(false);
    expect(tie("interval", 100, interval(0), 90, 111)).toBe(false);
    // Two guesses on the same side whose midpoint the band covers.
    expect(tie("interval", 100, interval(15), 130, 125)).toBe(false);
    expect(tie("interval", 100, interval(15), 50, 125)).toBe(true);
  });

  it("ratio: the geometric mean decides, with an inclusive boundary on both sides", () => {
    expect(tie("ratio", 100, null, 50, 200)).toBe(true);
    expect(tie("ratio", 100, null, 50, 201)).toBe(false);
    expect(tie("ratio", 100, ratio(100), 121, 100)).toBe(true);
    expect(tie("ratio", 100, ratio(99), 121, 100)).toBe(false);
    // The lower end of the band: sqrt(a*b) = 90 exactly at 100 permille.
    expect(tie("ratio", 100, ratio(100), 81, 100)).toBe(true);
    expect(tie("ratio", 100, ratio(99), 81, 100)).toBe(false);
    expect(tie("ratio", 1_000, ratio(3), 900, 1_120)).toBe(false);
    expect(tie("ratio", 1_000, ratio(4), 900, 1_120)).toBe(true);
  });

  it("a missing guess is infinitely far: tied only with another missing one", () => {
    expect(tie("interval", 100, null, null, null)).toBe(true);
    expect(tie("interval", 100, null, null, 100)).toBe(false);
    expect(tie("interval", 100, interval(1_000), 100, null)).toBe(false);
    expect(tie("ratio", 100, ratio(50), null, 100)).toBe(false);
    expect(further("interval", 100, null, null, 5_000)).toBe(true);
    expect(further("interval", 100, null, 5_000, null)).toBe(false);
    expect(further("interval", 100, null, null, null)).toBe(false);
  });

  it("strictly further: false for a tie, true only when the band cannot flip the order", () => {
    expect(further("interval", 100, null, 111, 90)).toBe(true);
    expect(further("interval", 100, null, 90, 111)).toBe(false);
    expect(further("interval", 100_000, interval(500), 111_000, 90_000)).toBe(false);
    expect(further("interval", 100_000, interval(400), 111_000, 90_000)).toBe(true);
    // E10: B (130) is certainly further than C (125): both on the same side, their midpoint 127.5 is outside [85, 115].
    expect(further("interval", 100, interval(15), 130, 125)).toBe(true);
    expect(further("interval", 100, interval(15), 125, 130)).toBe(false);
    // ...although A (50) is tied with each of them (|50 + 130 - 200| = 20 <= 30, |50 + 125 - 200| = 25 <= 30).
    expect(further("interval", 100, interval(15), 50, 130)).toBe(false);
    expect(further("interval", 100, interval(15), 130, 50)).toBe(false);
    expect(further("interval", 100, interval(15), 50, 125)).toBe(false);
    expect(further("ratio", 1_000, null, 1_120, 900)).toBe(true);
    expect(further("ratio", 1_000, ratio(4), 1_120, 900)).toBe(false);
    expect(further("ratio", 100, null, 50, 200)).toBe(false);
    expect(further("ratio", 100, null, 200, 50)).toBe(false);
  });

  it("matches a sweep of the truth over the band on 4 000 random pairs, and is symmetric and transitive", () => {
    const rand = seeded(606);
    let ties = 0;
    let strict = 0;
    for (let i = 0; i < 4_000; i += 1) {
      const game = genGame(rand, { minPlayers: 3, maxPlayers: 3, missing: 0.15 });
      const [x, y, z] = game.entries;
      const call = (a: number | null, b: number | null) => ({
        scale: game.scale,
        truth: game.t,
        tolerance: toTolerance(game),
        a,
        b,
      });
      const sweepErrors = refGrid(game).map((truth) => ({
        x: refError(game.scale, x[1], truth),
        y: refError(game.scale, y[1], truth),
      }));
      const xFurther = sweepErrors.every((e) => refCompare(e.x, e.y) > 0);
      const yFurther = sweepErrors.every((e) => refCompare(e.y, e.x) > 0);
      const label = () => JSON.stringify(game);
      holds(isStrictlyFurther(call(x[1], y[1])) === xFurther, label);
      holds(isStrictlyFurther(call(y[1], x[1])) === yFurther, label);
      const tied = !xFurther && !yFurther;
      holds(isEstimateTie(call(x[1], y[1])) === tied, label);
      holds(isEstimateTie(call(y[1], x[1])) === tied, label);
      if (tied) ties += 1;
      else strict += 1;
      // Transitive: x > y and y > z imply x > z (and then x, z are not tied).
      if (isStrictlyFurther(call(x[1], y[1])) && isStrictlyFurther(call(y[1], z[1]))) {
        holds(isStrictlyFurther(call(x[1], z[1])), label);
        holds(!isEstimateTie(call(x[1], z[1])), label);
      }
    }
    expect(ties).toBeGreaterThan(600);
    expect(strict).toBeGreaterThan(600);
  });

  it("treats no tolerance and a zero tolerance alike", () => {
    expect(tie("interval", 100, interval(0), 90, 110)).toBe(tie("interval", 100, null, 90, 110));
    expect(tie("ratio", 100, ratio(0), 50, 201)).toBe(tie("ratio", 100, null, 50, 201));
  });

  it("is exact at 10^15 where a float cannot tell the products apart", () => {
    const t = 999_999_999_999_999;
    // (t+1)(t-1) = t^2 - 1: not a tie at 0 permille, although Math.sqrt(a*b) === t in doubles.
    expect(Math.sqrt((t + 1) * (t - 1))).toBe(t);
    expect(tie("ratio", t, null, t + 1, t - 1)).toBe(false);
    expect(tie("ratio", t, ratio(1), t + 1, t - 1)).toBe(true);
    // a = u^2, b = v^2, t = u*v: exactly a tie, and one more on either guess is not.
    const [u, v] = [31_622_776, 31_622_775];
    expect(tie("ratio", u * v, null, u * u, v * v)).toBe(true);
    expect(tie("ratio", u * v, null, u * u, v * v + 1)).toBe(false);
    expect(tie("ratio", u * v, null, u * u + 1, v * v)).toBe(false);
    // Intervals: sums stay exact up to the cap.
    expect(tie("interval", 10 ** 15 - 1, null, 10 ** 15, 10 ** 15 - 2)).toBe(true);
    expect(tie("interval", 10 ** 15 - 1, null, 10 ** 15, 10 ** 15 - 3)).toBe(false);
    expect(tie("interval", 10 ** 15 - 1, interval(1), 10 ** 15, 10 ** 15 - 3)).toBe(true);
  });

  it("rejects values that are no milli numbers, and tolerances that do not fit", () => {
    const base = { scale: "ratio", truth: 100, tolerance: null, a: 50, b: 200 } as const;
    expect(() => isEstimateTie({ ...base, a: 0 })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, b: -1 })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, a: 1.5 })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, truth: 0 })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, b: ESTIMATE_MAX_MILLI + 1 })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, tolerance: interval(1) })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, scale: "interval", tolerance: ratio(5) })).toThrow(
      RangeError,
    );
    expect(() => isEstimateTie({ ...base, tolerance: ratio(1_000) })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, tolerance: ratio(-1) })).toThrow(RangeError);
    expect(() => isEstimateTie({ ...base, tolerance: ratio(1.5) })).toThrow(RangeError);
    expect(() => isStrictlyFurther({ ...base, a: 0 })).toThrow(RangeError);
    // An interval guess of 0 is fine.
    expect(isEstimateTie({ ...base, scale: "interval", a: 0, b: 200 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyEstimate: errors, differential tests, invariants
// ---------------------------------------------------------------------------

describe("classifyEstimate: input errors", () => {
  const base = {
    scale: "interval",
    truth: 100,
    tolerance: null,
    entries: [
      { uid: "A", guess: 50 },
      { uid: "B", guess: 120 },
      { uid: "C", guess: 95 },
    ],
    payerCount: 1,
  } as const;

  it("throws RangeError for each invalid input", () => {
    const entry = (uid: string, guess: number | null) => ({ uid, guess });
    expect(() => classifyEstimate({ ...base, entries: [entry("A", 1), entry("A", 2)] })).toThrow(
      RangeError,
    );
    expect(() => classifyEstimate({ ...base, payerCount: 0 })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, payerCount: 3 })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, payerCount: 1.5 })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, entries: [entry("A", 1)] })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, entries: [] })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, entries: [entry("A", 1.5), entry("B", 2)] })).toThrow(
      RangeError,
    );
    expect(() => classifyEstimate({ ...base, entries: [entry("A", -1), entry("B", 2)] })).toThrow(
      RangeError,
    );
    expect(() =>
      classifyEstimate({ ...base, entries: [entry("A", Number.NaN), entry("B", 2)] }),
    ).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, truth: 1.5 })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, tolerance: ratio(5) })).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, scale: "ratio", tolerance: interval(5) })).toThrow(
      RangeError,
    );
    expect(() =>
      classifyEstimate({ ...base, scale: "ratio", entries: [entry("A", 0), entry("B", 5)] }),
    ).toThrow(RangeError);
    expect(() => classifyEstimate({ ...base, scale: "ratio", truth: 0 })).toThrow(RangeError);
  });

  it("throws RangeError for a precedes that names an unknown uid, itself, or forms a cycle", () => {
    const withFacts = (precedes: EstimatePrecedes[]) => () =>
      classifyEstimate({ ...base, precedes });
    expect(withFacts([{ further: "A", closer: "Z" }])).toThrow(RangeError);
    expect(withFacts([{ further: "Z", closer: "A" }])).toThrow(RangeError);
    expect(withFacts([{ further: "A", closer: "A" }])).toThrow(RangeError);
    expect(
      withFacts([
        { further: "A", closer: "B" },
        { further: "B", closer: "A" },
      ]),
    ).toThrow(RangeError);
    expect(
      withFacts([
        { further: "A", closer: "B" },
        { further: "B", closer: "C" },
        { further: "C", closer: "A" },
      ]),
    ).toThrow(RangeError);
    // A consistent chain and an empty list are fine, as is a repeated fact.
    expect(
      withFacts([
        { further: "A", closer: "B" },
        { further: "A", closer: "B" },
        { further: "B", closer: "C" },
      ]),
    ).not.toThrow();
    expect(withFacts([])).not.toThrow();
  });

  it("does not modify its input", () => {
    const entries = [
      { uid: "B", guess: 120 },
      { uid: "A", guess: 50 },
      { uid: "C", guess: null },
    ];
    const precedes = [{ further: "C", closer: "A" }];
    const copy = structuredClone({ entries, precedes });
    classifyEstimate({ ...base, entries, precedes });
    expect({ entries, precedes }).toEqual(copy);
  });
});

describe("classifyEstimate: differential tests against the brute-force reference", () => {
  it("3 000 random games (both scales, missing guesses, k > 1, tolerance, ties): identical to the reference", () => {
    const rand = seeded(2026);
    let withTie = 0;
    let withMissing = 0;
    let multi = 0;
    let bandTies = 0;
    for (let i = 0; i < 3_000; i += 1) {
      const game = genGame(rand);
      const result = runClassify(game);
      const ref = expectMatchesReference(game, result, () => JSON.stringify(game));
      if (ref.contested.length > 0) withTie += 1;
      if (game.entries.some(([, g]) => g === null)) withMissing += 1;
      if (game.k > 1) multi += 1;
      if (game.tol > 0 && ref.contested.length > 0) bandTies += 1;
    }
    // The generator must reach the interesting corners, or the comparison proves little.
    expect(withTie).toBeGreaterThan(700);
    expect(withMissing).toBeGreaterThan(900);
    expect(multi).toBeGreaterThan(1_000);
    expect(bandTies).toBeGreaterThan(300);
  });

  it("1 200 random games with arbitrary inherited facts: identical to the linear-extension reference", () => {
    const rand = seeded(77);
    let withFacts = 0;
    for (let i = 0; i < 1_200; i += 1) {
      const game = genGame(rand, { inherited: true });
      if (game.inherited.length > 0) withFacts += 1;
      expectMatchesReference(game, runClassify(game), () => JSON.stringify(game));
    }
    expect(withFacts).toBeGreaterThan(600);
  });

  it("is sound over the whole band: certain payers pay, certain safe never pay, exactly `slots` contested pay", () => {
    const rand = seeded(31415);
    let checked = 0;
    for (let i = 0; i < 2_000; i += 1) {
      const game = genGame(rand, { maxPlayers: 7 });
      const result = runClassify(game);
      const payers = new Set(result.payers);
      const safe = new Set(result.safe);
      const contested = new Set(result.contested);
      const label = () => JSON.stringify(game);
      for (const outcome of refFeasiblePayerSets(game)) {
        for (const uid of payers) holds(outcome.has(uid), () => `${uid} must pay: ${label()}`);
        for (const uid of safe) holds(!outcome.has(uid), () => `${uid} must be safe: ${label()}`);
        holds([...outcome].filter((uid) => contested.has(uid)).length === result.slots, label);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(3_000);
  });

  it("holds at the largest field (32 players): a partition, sound against sampled truths and random tie-breaks", () => {
    // 32 players are too many to enumerate every linear extension: sample the band instead (both ends and random points)
    // and break exact ties at random, then check what the classification promises.
    const rand = seeded(32);
    let contestedGames = 0;
    for (let i = 0; i < 150; i += 1) {
      const game = genGame(rand, { minPlayers: 32, maxPlayers: 32, inherited: i % 4 === 0 });
      const result = runClassify(game);
      const label = () => JSON.stringify(game);
      same(
        [...result.payers, ...result.safe, ...result.contested].sort(),
        game.entries.map(([uid]) => uid).sort(),
        label,
      );
      holds(result.payers.length + result.slots === game.k, label);
      holds(
        result.contested.length === 0
          ? result.slots === 0
          : result.slots > 0 && result.slots < result.contested.length,
        label,
      );
      if (result.contested.length > 0) contestedGames += 1;
      if (game.inherited.length > 0) continue; // sampled truths know nothing of inherited facts
      const grid = refGrid(game);
      for (let sample = 0; sample < 12; sample += 1) {
        const truth =
          grid[sample === 0 ? 0 : sample === 1 ? grid.length - 1 : int(rand, grid.length)];
        const keyed = game.entries.map(([uid, guess]) => ({
          uid,
          err: refError(game.scale, guess, truth),
          tie: rand(),
        }));
        keyed.sort((a, b) => refCompare(b.err, a.err) || a.tie - b.tie);
        const top = new Set(keyed.slice(0, game.k).map((entry) => entry.uid));
        for (const uid of result.payers) holds(top.has(uid), () => `${uid} must pay: ${label()}`);
        for (const uid of result.safe)
          holds(!top.has(uid), () => `${uid} must be safe: ${label()}`);
        holds(result.contested.filter((uid) => top.has(uid)).length === result.slots, label);
      }
    }
    expect(contestedGames).toBeGreaterThan(30);
  });

  it("partitions the players, counts the payers, and keeps 0 < slots < |contested| (3 000 games)", () => {
    const rand = seeded(5);
    for (let i = 0; i < 3_000; i += 1) {
      const game = genGame(rand, { maxPlayers: 8, inherited: i % 3 === 0 });
      const result = runClassify(game);
      const all = [...result.payers, ...result.safe, ...result.contested];
      expect([...all].sort()).toEqual(game.entries.map(([uid]) => uid).sort());
      expect(result.payers.length + result.slots).toBe(game.k);
      if (result.contested.length === 0) expect(result.slots).toBe(0);
      else {
        expect(result.slots).toBeGreaterThan(0);
        expect(result.slots).toBeLessThan(result.contested.length);
      }
      // Ranked order is respected inside each list.
      const rankOf = new Map(result.ranked.map((r) => [r.uid, r.rank]));
      for (const list of [result.payers, result.safe, result.contested]) {
        const ranks = list.map((uid) => rankOf.get(uid) ?? 0);
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      }
      // precedes only names contested players and is acyclic and closed.
      const facts = new Set(result.precedes.map(pairKey));
      for (const p of result.precedes) {
        expect(result.contested).toContain(p.further);
        expect(result.contested).toContain(p.closer);
        expect(facts.has(`${p.closer}>${p.further}`)).toBe(false);
        for (const q of result.precedes) {
          if (q.further === p.closer) expect(facts.has(`${p.further}>${q.closer}`)).toBe(true);
        }
      }
    }
  });

  it("never lets a certainly-further player go free while a certainly-closer one pays (certain sets)", () => {
    const rand = seeded(8);
    for (let i = 0; i < 3_000; i += 1) {
      const game = genGame(rand);
      const result = runClassify(game);
      const ref = refClassify(game);
      const safe = new Set(result.safe);
      const payers = new Set(result.payers);
      for (const pair of ref.relation) {
        const [x, y] = pair.split(">");
        // x certainly further than y: if y pays for sure, x does; if x is certainly safe, so is y.
        if (payers.has(y)) holds(payers.has(x), () => `${pair} ${JSON.stringify(game)}`);
        if (safe.has(x)) holds(safe.has(y), () => `${pair} ${JSON.stringify(game)}`);
      }
    }
  });

  it("is independent of the order the entries come in (and of the order of the facts)", () => {
    const rand = seeded(4242);
    const shuffle = seededShuffle(rand);
    for (let i = 0; i < 1_500; i += 1) {
      const game = genGame(rand, { maxPlayers: 8, inherited: i % 2 === 0 });
      const baseline = runClassify(game);
      for (let round = 0; round < 3; round += 1) {
        const shuffled = runClassify(
          { ...game, inherited: shuffle(game.inherited) },
          shuffle(game.entries),
        );
        // The whole classification, `precedes` included, is identical: the nominal order is total.
        same(shuffled, baseline, () => JSON.stringify(game));
      }
    }
  });

  it("a zero tolerance and no tolerance classify alike", () => {
    const rand = seeded(11);
    for (let i = 0; i < 300; i += 1) {
      const game = genGame(rand);
      const plain = runClassify({ ...game, tol: 0 });
      const zero = classifyEstimate({
        scale: game.scale,
        truth: game.t,
        tolerance: game.scale === "interval" ? interval(0) : ratio(0),
        entries: game.entries.map(([uid, guess]) => ({ uid, guess })),
        payerCount: game.k,
      });
      expect(zero).toEqual(
        plain.precedes.length === 0 || game.inherited.length === 0 ? zero : plain,
      );
      expect(zero.payers).toEqual(
        classifyEstimate({
          scale: game.scale,
          truth: game.t,
          tolerance: null,
          entries: game.entries.map(([uid, guess]) => ({ uid, guess })),
          payerCount: game.k,
        }).payers,
      );
    }
  });

  it("classifies exactly near the 10^15 cap, where doubles cannot tell the distances apart", () => {
    const t = 999_999_999_999_999;
    // Ratio: (t+1)/t < t/(t-1), so the guess below the truth is further and pays.
    const high = classifyEstimate({
      scale: "ratio",
      truth: t,
      tolerance: null,
      entries: [
        { uid: "above", guess: t + 1 },
        { uid: "below", guess: t - 1 },
      ],
      payerCount: 1,
    });
    expect(high.payers).toEqual(["below"]);
    expect(high.safe).toEqual(["above"]);
    // With 1 permille of room the same two cannot be told apart.
    const tied = classifyEstimate({
      scale: "ratio",
      truth: t,
      tolerance: ratio(1),
      entries: [
        { uid: "above", guess: t + 1 },
        { uid: "below", guess: t - 1 },
      ],
      payerCount: 1,
    });
    expect(tied.contested).toEqual(["below", "above"]);
    expect(tied.slots).toBe(1);
    // Interval: a one-milli difference at 10^15.
    const edge = classifyEstimate({
      scale: "interval",
      truth: ESTIMATE_MAX_MILLI - 1,
      tolerance: null,
      entries: [
        { uid: "a", guess: ESTIMATE_MAX_MILLI },
        { uid: "b", guess: ESTIMATE_MAX_MILLI - 3 },
      ],
      payerCount: 1,
    });
    expect(edge.payers).toEqual(["b"]);
  });
});

// ---------------------------------------------------------------------------
// lotPicks
// ---------------------------------------------------------------------------

describe("lotPicks", () => {
  it("is the first `slots` of the shuffle without facts", () => {
    expect(lotPicks(["d", "b", "a", "c"], [], 2)).toEqual(["d", "b"]);
    expect(lotPicks(["d", "b", "a", "c"], [], 0)).toEqual([]);
    expect(lotPicks(["d", "b", "a", "c"], [], 4)).toEqual(["d", "b", "a", "c"]);
  });

  it("never takes a player before everybody certainly further than it", () => {
    // c waits for a, b waits for c.
    const facts = [
      { further: "a", closer: "c" },
      { further: "c", closer: "b" },
    ];
    expect(lotPicks(["b", "c", "a", "d"], facts, 3)).toEqual(["a", "c", "b"]);
    expect(lotPicks(["b", "c", "a", "d"], facts, 1)).toEqual(["a"]);
    expect(lotPicks(["d", "b", "c", "a"], facts, 2)).toEqual(["d", "a"]);
    // E11: C->A and D->B, shuffle [B, A, D, C], two payers: D, then B.
    expect(
      lotPicks(
        ["B", "A", "D", "C"],
        [
          { further: "C", closer: "A" },
          { further: "D", closer: "B" },
        ],
        2,
      ),
    ).toEqual(["D", "B"]);
  });

  it("ignores facts about players outside the lot, and refuses impossible input", () => {
    expect(lotPicks(["a", "b"], [{ further: "zz", closer: "a" }], 1)).toEqual(["a"]);
    expect(lotPicks(["a", "b"], [{ further: "a", closer: "zz" }], 1)).toEqual(["a"]);
    expect(() => lotPicks(["a", "b"], [], 3)).toThrow(RangeError);
    expect(() => lotPicks(["a", "b"], [], -1)).toThrow(RangeError);
    expect(() => lotPicks(["a", "b"], [], 1.5)).toThrow(RangeError);
    expect(() => lotPicks(["a", "a"], [], 1)).toThrow(RangeError);
    expect(() =>
      lotPicks(
        ["a", "b"],
        [
          { further: "a", closer: "b" },
          { further: "b", closer: "a" },
        ],
        1,
      ),
    ).toThrow(RangeError);
  });

  it("on random acyclic facts: picks `slots` distinct players, each only after everybody further", () => {
    const rand = seeded(99);
    const shuffle = seededShuffle(rand);
    for (let i = 0; i < 2_000; i += 1) {
      const n = 2 + int(rand, 7);
      const uids = Array.from({ length: n }, (_, j) => `p${j}`);
      const order = shuffle(uids);
      const facts: EstimatePrecedes[] = [];
      for (let a = 0; a < n; a += 1) {
        for (let b = a + 1; b < n; b += 1) {
          if (rand() < 0.3) facts.push({ further: order[a], closer: order[b] });
        }
      }
      const slots = 1 + int(rand, n);
      const picks = lotPicks(shuffle(uids), shuffle(facts), slots);
      expect(picks).toHaveLength(slots);
      expect(new Set(picks).size).toBe(slots);
      picks.forEach((pick, index) => {
        for (const fact of facts) {
          if (fact.closer === pick) expect(picks.indexOf(fact.further)).toBeGreaterThanOrEqual(0);
          if (fact.closer === pick) expect(picks.indexOf(fact.further)).toBeLessThan(index);
        }
      });
    }
  });

  it("is uniform over three unrelated players (30 000 secure shuffles)", () => {
    const runs = 30_000;
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < runs; i += 1) {
      const [pick] = lotPicks(secureShuffle(["a", "b", "c"]), [], 1);
      counts[pick] += 1;
    }
    for (const uid of ["a", "b", "c"]) {
      expect(counts[uid] / runs).toBeGreaterThan(0.3);
      expect(counts[uid] / runs).toBeLessThan(0.37);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveEstimateStage and the Stechen state machine
// ---------------------------------------------------------------------------

const OPENED = "2026-01-01T10:00:00.000Z";
const NOW = "2026-01-01T10:06:00.000Z";

function milliToDecimal(milli: number): string {
  const units = Math.floor(milli / 1000);
  const rest = milli % 1000;
  return rest === 0 ? String(units) : `${units}.${String(rest).padStart(3, "0")}`;
}

/** A bank row for `t` milli with the tolerance of a RefGame (interval: milli; ratio: permille -> percent). */
function rowFor(
  scale: EstimateScale,
  t: number,
  tol: number,
  index = 0,
  extra: Partial<EstimateQuestion> = {},
): EstimateQuestion {
  const percent = `${Math.floor(tol / 10)}.${tol % 10}`;
  return makeEstimateRow({
    id: `est-geo-${9001 + index}`,
    scale,
    value: milliToDecimal(t),
    ...(tol > 0 ? { tolerance: scale === "interval" ? milliToDecimal(tol) : percent } : {}),
    ...extra,
  });
}

function publicOf(row: EstimateQuestion): EstimatePublicQuestion {
  return {
    id: row.id,
    category: row.category,
    tone: row.tone,
    text: row.text,
    unit: row.unit,
    scale: row.scale,
    format: row.format,
    bounds: { minMilli: 0, maxMilli: ESTIMATE_MAX_MILLI },
  };
}

function guessing(
  row: EstimateQuestion,
  index: number,
  contenders: string[],
  slots: number,
): EstimateStage {
  return {
    index,
    kind: index === 0 ? "main" : "stechen",
    question: publicOf(row),
    contenders,
    slots,
    openedAt: OPENED,
    closesAt: null,
    lastCallAt: null,
    submitted: [],
    status: "guessing",
    reveal: null,
  };
}

function guessesOf(
  values: Record<string, number | null>,
  by: string | null = null,
  at = "2026-01-01T10:00:04.000Z",
): Record<string, { milli: number; at: string; by: string }> {
  const out: Record<string, { milli: number; at: string; by: string }> = {};
  for (const [uid, milli] of Object.entries(values)) {
    if (milli !== null) out[uid] = { milli, at, by: by ?? uid };
  }
  return out;
}

interface Played {
  stages: EstimateStage[];
  resolutions: EstimateStageResolution[];
  rows: EstimateQuestion[];
}

/**
 * Drives a whole round the way the server will: resolve the guessing stage,
 * store the reveal, open the Stechfrage the resolution asks for, repeat.
 */
function drive(options: {
  uids: string[];
  k: number;
  mode?: EstimateRound["mode"];
  /** One entry per stage that may be played: [row, guesses of that stage]. */
  plays: { row: EstimateQuestion; guesses: Record<string, number | null> }[];
  shuffle?: <T>(items: T[]) => T[];
  stechenAvailable?: boolean;
}): Played {
  const { uids, k, mode = "online", plays, shuffle = reverse, stechenAvailable = true } = options;
  const stages: EstimateStage[] = [];
  const resolutions: EstimateStageResolution[] = [];
  const rows: EstimateQuestion[] = [];
  let contenders = uids;
  let slots = k;
  for (let index = 0; index < plays.length; index += 1) {
    const { row, guesses } = plays[index];
    const stage = guessing(row, index, contenders, slots);
    stages[index] = stage;
    const resolution = resolveEstimateStage({
      round: { order: uids, stages: [...stages], targetLoserCount: k, mode },
      stage,
      question: row,
      guesses: guessesOf(guesses, mode === "local" ? "owner" : null),
      now: NOW,
      reason: mode === "local" ? "local" : "all-in",
      stechenAvailable,
      shuffle,
    });
    resolutions.push(resolution);
    rows.push(row);
    stages[index] = {
      ...stage,
      status: "revealed",
      submitted: contenders.filter((uid) => guesses[uid] !== null && guesses[uid] !== undefined),
      reveal: resolution.reveal,
    };
    if (resolution.stechen === null) return { stages, resolutions, rows };
    contenders = resolution.stechen.contenders;
    slots = resolution.stechen.slots;
  }
  return { stages, resolutions, rows };
}

describe("resolveEstimateStage: one stage", () => {
  it("decides a clear game: results, payers, source and the booking facts (online)", () => {
    const row = rowFor("interval", 100_000, 0, 0, {
      note: "A caveat.",
      asOf: 2023,
      definition: "Exactly this, measured that way.",
    });
    const stage = guessing(row, 0, ["A", "B", "C"], 1);
    const result = resolveEstimateStage({
      round: { order: ["C", "A", "B"], stages: [stage], targetLoserCount: 1, mode: "online" },
      stage,
      question: row,
      guesses: {
        A: { milli: 90_000, at: "2026-01-01T10:00:04.000Z", by: "A" },
        B: { milli: 111_000, at: "2026-01-01T10:01:30.500Z", by: "B" },
        // C never answered.
      },
      now: NOW,
      reason: "time-up",
      stechenAvailable: true,
      shuffle: reverse,
    });
    const { reveal } = result;
    expect(result.stechen).toBeNull();
    expect(result.decided).toEqual({ loserUids: ["C"], resolvedBy: "distance" });
    expect(reveal).toMatchObject({
      revealedAt: NOW,
      reason: "time-up",
      truthMilli: 100_000,
      tolerance: null,
      asOf: 2023,
      definition: "Exactly this, measured that way.",
      note: "A caveat.",
      payers: ["C"],
      safe: ["B", "A"],
      contested: [],
      slotsLeft: 0,
      precedes: [],
      bandTie: false,
      next: "decided",
      shuffled: null,
      lotPayers: null,
    });
    expect(reveal.source).toEqual({
      label: "Fixture authority (fake)",
      url: "https://example.org/fixture",
    });
    expect(reveal.sources).toEqual(row.sources);
    expect(reveal.sources).not.toBe(row.sources);
    expect(reveal.results).toEqual([
      {
        uid: "C",
        guessMilli: null,
        distance: null,
        rank: 1,
        fate: "pays",
        enteredBy: null,
        answeredAfterMs: null,
      },
      {
        uid: "B",
        guessMilli: 111_000,
        distance: { kind: "interval", diffMilli: 11_000, direction: "high" },
        rank: 2,
        fate: "safe",
        enteredBy: null,
        answeredAfterMs: 90_500,
      },
      {
        uid: "A",
        guessMilli: 90_000,
        distance: { kind: "interval", diffMilli: 10_000, direction: "low" },
        rank: 3,
        fate: "safe",
        enteredBy: null,
        answeredAfterMs: 4_000,
      },
    ]);
  });

  it("one phone: no answer times, and enteredBy names the device owner for everybody else", () => {
    const row = rowFor("interval", 100_000, 0);
    const stage = guessing(row, 0, ["A", "B", "C"], 1);
    const result = resolveEstimateStage({
      round: { order: ["A", "B", "C"], stages: [stage], targetLoserCount: 1, mode: "local" },
      stage,
      question: row,
      guesses: {
        A: { milli: 90_000, at: NOW, by: "A" },
        B: { milli: 111_000, at: NOW, by: "A" },
        C: { milli: 99_000, at: NOW, by: "A" },
      },
      now: NOW,
      reason: "local",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal.reason).toBe("local");
    expect(result.reveal.results.map((r) => [r.uid, r.enteredBy, r.answeredAfterMs])).toEqual([
      ["B", "A", null],
      ["A", null, null],
      ["C", "A", null],
    ]);
  });

  it("never reports a negative answer time", () => {
    const row = rowFor("interval", 100_000, 0);
    const stage = guessing(row, 0, ["A", "B"], 1);
    const result = resolveEstimateStage({
      round: { order: ["A", "B"], stages: [stage], targetLoserCount: 1, mode: "online" },
      stage,
      question: row,
      guesses: {
        A: { milli: 90_000, at: "2025-12-31T23:59:59.000Z", by: "A" },
        B: { milli: 111_000, at: "garbage", by: "B" },
      },
      now: NOW,
      reason: "all-in",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal.results.map((r) => r.answeredAfterMs)).toEqual([null, 0]);
  });

  it("books the payers furthest first (the odd cent goes to the furthest-off player)", () => {
    const row = rowFor("interval", 100_000, 0);
    const uids = ["A", "B", "C", "D"];
    const stage = guessing(row, 0, uids, 3);
    const result = resolveEstimateStage({
      round: { order: uids, stages: [stage], targetLoserCount: 3, mode: "online" },
      stage,
      question: row,
      guesses: guessesOf({ A: 10_000, B: 40_000, C: 70_000, D: 95_000 }),
      now: NOW,
      reason: "all-in",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal.payers).toEqual(["A", "B", "C"]);
    expect(result.decided?.loserUids).toEqual(["A", "B", "C"]);
    expect(result.reveal.results.map((r) => r.fate)).toEqual(["pays", "pays", "pays", "safe"]);
  });

  it("asks a Stechfrage of the contested players only (E1)", () => {
    const row = rowFor("ratio", 100, 0);
    const stage = guessing(row, 0, ["A", "B", "C"], 1);
    const result = resolveEstimateStage({
      round: { order: ["A", "B", "C"], stages: [stage], targetLoserCount: 1, mode: "online" },
      stage,
      question: row,
      guesses: guessesOf({ A: 50, B: 200, C: 101 }),
      now: NOW,
      reason: "all-in",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal.next).toBe("stechen");
    expect(result.stechen).toEqual({ contenders: ["A", "B"], slots: 1 });
    expect(result.decided).toBeNull();
    expect(result.reveal).toMatchObject({
      payers: [],
      safe: ["C"],
      contested: ["A", "B"],
      slotsLeft: 1,
      shuffled: null,
      lotPayers: null,
      bandTie: false,
    });
  });

  it("bandTie is true when the band, not an exact tie, keeps two players contested", () => {
    const cases: [EstimateScale, number, number, [number, number], boolean][] = [
      ["interval", 100_000, 1_000, [90_000, 111_000], true], // E2b
      ["ratio", 1_000, 4, [900, 1_120], true], // E3c
      ["interval", 100, 10, [60, 125], true], // E5 (A and C contested)
      ["ratio", 100, 0, [50, 200], false], // E1
      ["interval", 50, 0, [40, 60], false], // E4
      ["interval", 100, 0, [70, 70], false], // E8
      ["interval", 100_000, 400, [90_000, 111_000], false], // decided: nothing contested
    ];
    for (const [scale, truth, tol, [a, b], expected] of cases) {
      const row = rowFor(scale, truth, tol);
      const uids = ["A", "B", "C"];
      const stage = guessing(row, 0, uids, 1);
      // C is far enough on the safe side to never matter, except in the E5 row where it is the E5 C.
      const c =
        scale === "interval" ? truth + Math.floor(truth / 100) : Math.floor((truth * 101) / 100);
      const third = tol === 10 && truth === 100 ? 70 : c;
      const result = resolveEstimateStage({
        round: { order: uids, stages: [stage], targetLoserCount: 1, mode: "online" },
        stage,
        question: row,
        guesses: guessesOf({ A: a, B: b, C: third }),
        now: NOW,
        reason: "all-in",
        stechenAvailable: true,
        shuffle: reverse,
      });
      expect(result.reveal.bandTie, JSON.stringify([scale, truth, tol, a, b])).toBe(expected);
    }
  });

  it("a contested field that never answered goes to the lot at once, even with a Stechfrage available", () => {
    const row = rowFor("interval", 100_000, 0);
    const uids = ["A", "B", "C"];
    const stage = guessing(row, 0, uids, 1);
    const result = resolveEstimateStage({
      round: { order: uids, stages: [stage], targetLoserCount: 1, mode: "online" },
      stage,
      question: row,
      guesses: guessesOf({ A: 120_000 }),
      now: NOW,
      reason: "time-up",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal).toMatchObject({
      next: "shuffle",
      payers: [],
      safe: ["A"],
      contested: ["B", "C"],
      slotsLeft: 1,
      shuffled: ["C", "B"],
      lotPayers: ["C"],
    });
    expect(result.stechen).toBeNull();
    expect(result.decided).toEqual({ loserUids: ["C"], resolvedBy: "shuffle" });
  });

  it("absent players pay first, and decide nothing else (E6a/E6b/E6d)", () => {
    const row = rowFor("interval", 100_000, 0);
    const uids = ["A", "B", "C"];
    const run = (k: number, guesses: Record<string, number | null>) => {
      const stage = guessing(row, 0, uids, k);
      return resolveEstimateStage({
        round: { order: uids, stages: [stage], targetLoserCount: k, mode: "online" },
        stage,
        question: row,
        guesses: guessesOf(guesses),
        now: NOW,
        reason: "time-up",
        stechenAvailable: true,
        shuffle: reverse,
      });
    };
    expect(run(1, { A: 120_000, C: 95_000 }).decided).toEqual({
      loserUids: ["B"],
      resolvedBy: "distance",
    });
    expect(run(2, { A: 120_000, C: 95_000 }).decided).toEqual({
      loserUids: ["B", "A"],
      resolvedBy: "distance",
    });
    expect(run(2, { A: 120_000 }).decided).toEqual({
      loserUids: ["B", "C"],
      resolvedBy: "distance",
    });
  });

  it("falls back to the lot when the bank has no Stechfrage left", () => {
    const row = rowFor("ratio", 100, 0);
    const stage = guessing(row, 0, ["A", "B", "C"], 1);
    const result = resolveEstimateStage({
      round: { order: ["A", "B", "C"], stages: [stage], targetLoserCount: 1, mode: "online" },
      stage,
      question: row,
      guesses: guessesOf({ A: 50, B: 200, C: 101 }),
      now: NOW,
      reason: "all-in",
      stechenAvailable: false,
      shuffle: reverse,
    });
    expect(result.reveal).toMatchObject({
      next: "shuffle",
      shuffled: ["B", "A"],
      lotPayers: ["B"],
    });
    expect(result.decided).toEqual({ loserUids: ["B"], resolvedBy: "shuffle" });
    expect(result.stechen).toBeNull();
  });

  it("the lot respects the facts: E11, two payers, shuffle [B, A, D, C] -> D then B", () => {
    const row = rowFor("interval", 100, 10);
    const uids = ["A", "B", "C", "D"];
    const stage = guessing(row, 0, uids, 2);
    const result = resolveEstimateStage({
      round: { order: uids, stages: [stage], targetLoserCount: 2, mode: "online" },
      stage,
      question: row,
      guesses: guessesOf({ A: 90, B: 110, C: 70, D: 130 }),
      now: NOW,
      reason: "all-in",
      stechenAvailable: false,
      shuffle: reverse,
    });
    expect(result.reveal.contested).toEqual(["C", "D", "A", "B"]);
    expect(result.reveal.precedes).toEqual([
      { further: "C", closer: "A" },
      { further: "D", closer: "B" },
    ]);
    expect(result.reveal.shuffled).toEqual(["B", "A", "D", "C"]);
    expect(result.reveal.lotPayers).toEqual(["D", "B"]);
    expect(result.decided).toEqual({ loserUids: ["D", "B"], resolvedBy: "shuffle" });
  });

  it("refuses what a caller must never do", () => {
    const row = rowFor("interval", 100_000, 0);
    const uids = ["A", "B", "C"];
    const stage = guessing(row, 0, uids, 1);
    const good = {
      round: { order: uids, stages: [stage], targetLoserCount: 1, mode: "online" as const },
      stage,
      question: row,
      guesses: guessesOf({ A: 90_000, B: 111_000, C: 99_000 }),
      now: NOW,
      reason: "all-in" as const,
      stechenAvailable: true,
      shuffle: reverse,
    };
    expect(() => resolveEstimateStage(good)).not.toThrow();
    // A stage that is not guessing.
    expect(() =>
      resolveEstimateStage({ ...good, stage: { ...stage, status: "revealed" } }),
    ).toThrow();
    // The secrets of another question.
    expect(() =>
      resolveEstimateStage({ ...good, question: rowFor("interval", 100_000, 0, 5) }),
    ).toThrow();
    // A payer target that does not add up.
    expect(() =>
      resolveEstimateStage({ ...good, round: { ...good.round, targetLoserCount: 2 } }),
    ).toThrow();
    // An earlier stage that is not revealed / missing.
    const later = { ...stage, index: 1 };
    expect(() =>
      resolveEstimateStage({
        ...good,
        stage: later,
        round: { ...good.round, stages: [stage, later] },
      }),
    ).toThrow();
    expect(() =>
      resolveEstimateStage({ ...good, stage: later, round: { ...good.round, stages: [later] } }),
    ).toThrow();
    // A shuffle that is no permutation (only reached when the lot is used). The injected type is generic, so cast.
    const fixedShuffle = (order: string[]) => (() => order) as unknown as typeof reverse;
    const tied = guessing(rowFor("ratio", 100, 0), 0, uids, 1);
    const lot = {
      ...good,
      stage: tied,
      question: rowFor("ratio", 100, 0),
      round: { ...good.round, stages: [tied] },
      guesses: guessesOf({ A: 50, B: 200, C: 101 }),
      stechenAvailable: false,
    };
    expect(() => resolveEstimateStage(lot)).not.toThrow();
    expect(() => resolveEstimateStage({ ...lot, shuffle: fixedShuffle(["A"]) })).toThrow();
    expect(() => resolveEstimateStage({ ...lot, shuffle: fixedShuffle(["A", "A"]) })).toThrow();
    expect(() => resolveEstimateStage({ ...lot, shuffle: fixedShuffle(["A", "C"]) })).toThrow();
    // A guess that is no valid number for the question.
    expect(() =>
      resolveEstimateStage({ ...lot, guesses: guessesOf({ A: 0, B: 200, C: 101 }) }),
    ).toThrow(RangeError);
  });

  it("is a pure function: same input, same output, input untouched, no reliance on prototype keys", () => {
    const row = rowFor("interval", 100, 10);
    const uids = ["A", "B", "C", "D"];
    const stage = guessing(row, 0, uids, 2);
    const input = {
      round: { order: uids, stages: [stage], targetLoserCount: 2, mode: "online" as const },
      stage,
      question: row,
      guesses: guessesOf({ A: 90, B: 110, C: 70, D: 130 }),
      now: NOW,
      reason: "all-in" as const,
      stechenAvailable: false,
      shuffle: reverse,
    };
    // structuredClone cannot copy the injected function: snapshot everything else.
    const data = {
      round: input.round,
      stage: input.stage,
      question: input.question,
      guesses: input.guesses,
      now: input.now,
      reason: input.reason,
      stechenAvailable: input.stechenAvailable,
    };
    const before = structuredClone(data);
    const first = resolveEstimateStage(input);
    expect(resolveEstimateStage(input)).toEqual(first);
    expect(data).toEqual(before);
    // A contender literally named like an Object.prototype key has no inherited "guess".
    const odd = ["constructor", "toString"];
    const oddStage = guessing(rowFor("interval", 100, 0), 0, odd, 1);
    const result = resolveEstimateStage({
      round: { order: odd, stages: [oddStage], targetLoserCount: 1, mode: "online" },
      stage: oddStage,
      question: rowFor("interval", 100, 0),
      guesses: {},
      now: NOW,
      reason: "time-up",
      stechenAvailable: true,
      shuffle: reverse,
    });
    expect(result.reveal.results.every((r) => r.guessMilli === null)).toBe(true);
    expect(result.decided?.resolvedBy).toBe("shuffle");
  });
});

describe("resolveEstimateStage: the Stechen state machine", () => {
  const AB = ["A", "B"];

  it("worked chain: three tied Stechfragen, then the lot decides (A, B tie everywhere)", () => {
    const played = drive({
      uids: AB,
      k: 1,
      plays: [
        { row: rowFor("ratio", 100, 0, 0), guesses: { A: 50, B: 200 } },
        { row: rowFor("interval", 10, 0, 1), guesses: { A: 7, B: 13 } },
        { row: rowFor("interval", 10, 0, 2), guesses: { A: 8, B: 12 } },
        { row: rowFor("interval", 10, 0, 3), guesses: { A: 9, B: 11 } },
      ],
    });
    expect(played.stages).toHaveLength(ESTIMATE_MAX_STECHEN + 1);
    expect(played.resolutions.map((r) => r.reveal.next)).toEqual([
      "stechen",
      "stechen",
      "stechen",
      "shuffle",
    ]);
    const last = played.resolutions[3];
    expect(last.reveal.contested).toEqual(["A", "B"]);
    expect(last.reveal.shuffled).toEqual(["B", "A"]);
    expect(last.reveal.lotPayers).toEqual(["B"]);
    expect(last.reveal.slotsLeft).toBe(1);
    expect(last.decided).toEqual({ loserUids: ["B"], resolvedBy: "shuffle" });
    expect(roundPayers(played.stages)).toEqual(["B"]);
    expect(isEstimateDecided({ stages: played.stages })).toBe(true);
    expect(played.resolutions[0].stechen).toEqual({ contenders: ["A", "B"], slots: 1 });
    expect(played.resolutions.slice(0, 3).every((r) => r.decided === null)).toBe(true);
  });

  it("variant: the first Stechfrage already separates them (7 / 14 -> B pays, by stechen)", () => {
    const played = drive({
      uids: AB,
      k: 1,
      plays: [
        { row: rowFor("ratio", 100, 0, 0), guesses: { A: 50, B: 200 } },
        { row: rowFor("interval", 10, 0, 1), guesses: { A: 7, B: 14 } },
      ],
    });
    expect(played.stages).toHaveLength(2);
    expect(played.resolutions[1].reveal).toMatchObject({
      next: "decided",
      payers: ["B"],
      safe: ["A"],
    });
    expect(played.resolutions[1].decided).toEqual({ loserUids: ["B"], resolvedBy: "stechen" });
    expect(isEstimateDecided({ stages: played.stages })).toBe(true);
  });

  it("a stage that is still undecided is not decided, and a decided one is not asked again", () => {
    const played = drive({
      uids: AB,
      k: 1,
      plays: [{ row: rowFor("ratio", 100, 0, 0), guesses: { A: 50, B: 200 } }],
    });
    expect(isEstimateDecided({ stages: played.stages })).toBe(false);
    expect(roundPayers(played.stages)).toEqual([]);
  });

  it("books earlier stages first, each furthest first, the lot last", () => {
    // Stage 0 (interval, truth 100, 4 of 6 pay): A is 100 away and pays alone. B, D (70) and C, E (130) are all
    // exactly 30 away, so they are tied across the pay line and contest the other 3 places; F (99) is safe.
    const uids = ["A", "B", "C", "D", "E", "F"];
    const played = drive({
      uids,
      k: 4,
      plays: [
        {
          row: rowFor("interval", 100, 0, 0),
          guesses: { A: 0, B: 70, C: 130, D: 70, E: 130, F: 99 },
        },
        // Stage 1 (truth 50, 3 places for B, D, C, E): B (40 off) and D (30 off) pay; C (45) and E (55) are exactly tied.
        { row: rowFor("interval", 50, 0, 1), guesses: { B: 10, D: 20, C: 45, E: 55 } },
        { row: rowFor("interval", 50, 0, 2), guesses: { C: 45, E: 55 } },
        { row: rowFor("interval", 50, 0, 3), guesses: { C: 45, E: 55 } },
      ],
    });
    const [s0, s1, s2, s3] = played.resolutions;
    expect(played.resolutions.map((r) => r.reveal.next)).toEqual([
      "stechen",
      "stechen",
      "stechen",
      "shuffle",
    ]);
    expect(s0.reveal).toMatchObject({
      payers: ["A"],
      safe: ["F"],
      contested: ["B", "D", "C", "E"],
      slotsLeft: 3,
    });
    expect(s0.stechen).toEqual({ contenders: ["B", "D", "C", "E"], slots: 3 });
    expect(s1.reveal).toMatchObject({
      payers: ["B", "D"],
      safe: [],
      contested: ["C", "E"],
      slotsLeft: 1,
    });
    expect(s1.stechen).toEqual({ contenders: ["C", "E"], slots: 1 });
    expect(s2.reveal).toMatchObject({ payers: [], contested: ["C", "E"], slotsLeft: 1 });
    // The lot: the contested players ranked [C, E], the reversing shuffle [E, C], one place.
    expect(s3.reveal).toMatchObject({
      payers: [],
      shuffled: ["E", "C"],
      lotPayers: ["E"],
      slotsLeft: 1,
    });
    // Booking order: stage 0's payer, stage 1's payers furthest first, the lot's pick last.
    expect(s3.decided).toEqual({ loserUids: ["A", "B", "D", "E"], resolvedBy: "shuffle" });
    expect(roundPayers(played.stages)).toEqual(["A", "B", "D", "E"]);
    expect(isEstimateDecided({ stages: played.stages })).toBe(true);
  });

  it("E11 end to end: the Stechfrage respects the facts of the main question (C->A, D->B)", () => {
    const played = drive({
      uids: ["A", "B", "C", "D"],
      k: 2,
      plays: [
        { row: rowFor("interval", 100, 10, 0), guesses: { A: 90, B: 110, C: 70, D: 130 } },
        { row: rowFor("interval", 50, 0, 1), guesses: { A: 90, B: 55, C: 52, D: 58 } },
      ],
    });
    const [first, second] = played.resolutions;
    expect(first.reveal).toMatchObject({
      next: "stechen",
      payers: [],
      safe: [],
      contested: ["C", "D", "A", "B"],
      slotsLeft: 2,
      bandTie: true,
    });
    expect(first.reveal.precedes).toEqual([
      { further: "C", closer: "A" },
      { further: "D", closer: "B" },
    ]);
    expect(first.stechen).toEqual({ contenders: ["C", "D", "A", "B"], slots: 2 });
    // Without the facts A (40 off) and D (8 off) would pay, although C is certainly further off than A in the main
    // question. With them the relation closes to C -> A -> D -> B: C and A pay, ranked (furthest in the Stechfrage first) A, C.
    expect(second.reveal).toMatchObject({
      payers: ["A", "C"],
      safe: ["D", "B"],
      contested: [],
      next: "decided",
      slotsLeft: 0,
    });
    expect(second.decided).toEqual({ loserUids: ["A", "C"], resolvedBy: "stechen" });
  });

  it("resolving a stage does not depend on the order of its contenders (400 games, with and without a Stechfrage left)", () => {
    const rand = seeded(2468);
    const shuffle = seededShuffle(rand);
    for (let i = 0; i < 400; i += 1) {
      const game = genGame(rand, { maxPlayers: 6, missing: 0.1 });
      const row = rowFor(game.scale, game.t, game.tol, 0);
      const uids = game.entries.map(([uid]) => uid);
      const guesses = Object.fromEntries(game.entries) as Record<string, number | null>;
      const run = (order: string[]) =>
        resolveEstimateStage({
          round: {
            order: uids,
            stages: [guessing(row, 0, order, game.k)],
            targetLoserCount: game.k,
            mode: "online",
          },
          stage: guessing(row, 0, order, game.k),
          question: row,
          guesses: guessesOf(guesses),
          now: NOW,
          reason: "all-in",
          stechenAvailable: i % 2 === 0,
          shuffle: reverse,
        });
      const baseline = run(uids);
      same(run(shuffle(uids)), baseline, () => JSON.stringify(game));
      same(run(shuffle(uids)), baseline, () => JSON.stringify(game));
    }
  });
});

// ---------------------------------------------------------------------------
// Whole chains against the reference (spec C.13 items 5 and 7)
// ---------------------------------------------------------------------------

interface ChainStageRecord {
  game: RefGame;
}

/** A random question for a stage as a RefGame template (scale, truth, tolerance in the game's unit). */
function genQuestion(
  rand: () => number,
  allowTolerance: boolean,
): { scale: EstimateScale; t: number; tol: number } {
  if (rand() < 0.6) {
    return {
      scale: "interval",
      t: 40 + int(rand, 121),
      tol: allowTolerance ? pick(rand, [0, 0, 3, 8, 15]) : 0,
    };
  }
  return {
    scale: "ratio",
    t: pick(rand, [100, 1000]),
    tol: allowTolerance ? pick(rand, [0, 0, 5, 20, 50, 100]) : 0,
  };
}

/**
 * One stage's guesses for `uids`. In "tie mode" everybody answers the same
 * distance from the truth (on either side), so the whole field is exactly tied
 * and the chain goes deeper: that is how the Stechen and lot corners are reached.
 */
function genStageGuesses(
  rand: () => number,
  uids: readonly string[],
  scale: EstimateScale,
  t: number,
  options: { missing: number; tieMode: boolean; banded?: boolean },
): Record<string, number | null> {
  const offset = 1 + int(rand, 30);
  const [num, den] = pick(rand, [
    [2, 1],
    [5, 4],
    [4, 1],
  ] as const);
  const out: Record<string, number | null> = {};
  for (const uid of uids) {
    const above = rand() < 0.5;
    if (rand() < options.missing) out[uid] = null;
    else if (options.banded) {
      // Interval, tolerance 10: guesses 10, 20 or 30 off. Some pairs are tied by the band, others strictly ordered (E11).
      out[uid] = t + (above ? 1 : -1) * pick(rand, [10, 20, 30]);
    } else if (options.tieMode) {
      if (scale === "interval") out[uid] = above ? t + offset : t - offset;
      else out[uid] = above ? (t * num) / den : (t * den) / num;
    } else if (scale === "interval") {
      out[uid] = rand() < 0.6 ? Math.max(0, t + int(rand, 61) - 30) : int(rand, 251);
    } else {
      const [fnum, fden] = pick(rand, RATIO_FACTORS);
      out[uid] = Math.max(1, Math.floor((t * fnum) / fden));
    }
  }
  return out;
}

describe("whole rounds: random chains against the reference", () => {
  it("1 500 chains: exactly k distinct payers, <= 3 Stechfragen then the lot, a down-set of every stage's relation", () => {
    const rand = seeded(20_260_101);
    let withStechen = 0;
    let withLot = 0;
    let lotAfterThree = 0;
    let maxStages = 0;
    let withFacts = 0;
    let withAbsentLot = 0;
    for (let chain = 0; chain < 1_500; chain += 1) {
      const n = 2 + int(rand, 6);
      const k = 1 + int(rand, n - 1);
      const uids = Array.from({ length: n }, (_, i) => `u${i}`);
      const stechenAvailable = rand() < 0.93;
      const shuffle = seededShuffle(rand);
      const mode = rand() < 0.5 ? "online" : "local";
      const stages: EstimateStage[] = [];
      const records: ChainStageRecord[] = [];
      let contenders = uids;
      let slots = k;
      let decided: EstimateStageResolution["decided"] = null;
      let previousFacts: [string, string][] = [];
      for (let index = 0; index <= ESTIMATE_MAX_STECHEN && decided === null; index += 1) {
        // A third of the main questions are "banded": the strict facts that the Stechfrage must inherit come from those.
        const banded = index === 0 && rand() < 0.35;
        const question = banded
          ? { scale: "interval" as const, t: 100, tol: 10 }
          : genQuestion(rand, index === 0 || rand() < 0.5);
        const row = rowFor(question.scale, question.t, question.tol, index);
        const guesses = genStageGuesses(rand, contenders, question.scale, question.t, {
          missing: mode === "online" ? 0.15 : 0,
          tieMode: rand() < (index === 0 ? 0.25 : 0.55),
          banded,
        });
        const stage = guessing(row, index, contenders, slots);
        stages[index] = stage;
        const resolution = resolveEstimateStage({
          round: { order: uids, stages: [...stages], targetLoserCount: k, mode },
          stage,
          question: row,
          guesses: guessesOf(guesses),
          now: NOW,
          reason: "all-in",
          stechenAvailable,
          shuffle,
        });
        const game: RefGame = {
          scale: question.scale,
          t: question.t,
          tol: question.tol,
          entries: contenders.map((uid): [string, number | null] => [uid, guesses[uid]]),
          k: slots,
          inherited: previousFacts,
        };
        const { reveal } = resolution;
        const ref = refClassify(game);
        const label = () => `${JSON.stringify(game)} (chain ${chain}, stage ${index})`;
        same(
          reveal.results.map((r) => r.uid),
          ref.ranked,
          label,
        );
        same(reveal.payers, ref.payers, label);
        same(reveal.safe, ref.safe, label);
        same(reveal.contested, ref.contested, label);
        same(reveal.slotsLeft, ref.slots, label);
        same(reveal.precedes.map(pairKey).sort(), ref.precedes, label);
        same(
          reveal.results.map((r) => r.fate),
          ref.ranked.map((uid) =>
            ref.payers.includes(uid) ? "pays" : ref.safe.includes(uid) ? "safe" : "contested",
          ),
          label,
        );
        if (previousFacts.length > 0) withFacts += 1;
        records.push({ game });
        stages[index] = { ...stage, status: "revealed", reveal };

        // What happens next follows C.8 exactly.
        const everyoneAbsent = ref.contested.every((uid) => guesses[uid] === null);
        const expectedNext =
          ref.contested.length === 0
            ? "decided"
            : everyoneAbsent || index >= ESTIMATE_MAX_STECHEN || !stechenAvailable
              ? "shuffle"
              : "stechen";
        holds(reveal.next === expectedNext, label);
        holds((reveal.shuffled === null) === (expectedNext !== "shuffle"), label);
        holds((reveal.lotPayers === null) === (expectedNext !== "shuffle"), label);
        if (expectedNext === "stechen") {
          same(resolution.stechen, { contenders: ref.contested, slots: ref.slots }, label);
          holds(resolution.decided === null, label);
          contenders = ref.contested;
          slots = ref.slots;
          previousFacts = ref.precedes.map((pair) => pair.split(">") as [string, string]);
          if (index === 0) withStechen += 1;
        } else {
          holds(resolution.stechen === null, label);
          decided = resolution.decided;
          if (expectedNext === "shuffle") {
            withLot += 1;
            if (index === ESTIMATE_MAX_STECHEN) lotAfterThree += 1;
            if (everyoneAbsent) withAbsentLot += 1;
            same([...(reveal.shuffled ?? [])].sort(), [...ref.contested].sort(), label);
          }
        }
      }
      // It always ends within the 3 Stechfragen, and the stage that ended it is the last one.
      holds(decided !== null, () => `chain ${chain} did not end`);
      if (decided === null) continue;
      maxStages = Math.max(maxStages, stages.length);
      holds(
        stages.length <= ESTIMATE_MAX_STECHEN + 1,
        () => `chain ${chain}: ${stages.length} stages`,
      );

      const payers = decided.loserUids;
      const chainLabel = () =>
        `chain ${chain}: ${JSON.stringify(payers)} for k = ${k} of ${JSON.stringify(uids)}`;
      holds(payers.length === k && new Set(payers).size === k, chainLabel);
      holds(
        payers.every((uid) => uids.includes(uid)),
        chainLabel,
      );
      same(roundPayers(stages), payers, chainLabel);
      holds(isEstimateDecided({ stages }), chainLabel);
      const lastReveal = stages[stages.length - 1].reveal;
      holds(
        decided.resolvedBy ===
          (lastReveal?.next === "shuffle"
            ? "shuffle"
            : stages.length === 1
              ? "distance"
              : "stechen"),
        chainLabel,
      );

      // Order: stage by stage, each stage's certain payers furthest first, the lot's picks last.
      let at = 0;
      for (const done of stages) {
        const reveal = done.reveal;
        if (!reveal) continue;
        same(payers.slice(at, at + reveal.payers.length), reveal.payers, chainLabel);
        at += reveal.payers.length;
      }
      same(payers.slice(at), lastReveal?.lotPayers ?? [], chainLabel);

      // No player who is certainly further off goes free while one who is certainly closer pays,
      // in the strict relation of EVERY stage (the review's finding: the chain must not invert it).
      const paying = new Set(payers);
      for (const { game } of records) {
        for (const pair of refClassify(game).relation) {
          const [x, y] = pair.split(">");
          if (paying.has(y))
            holds(paying.has(x), () => `${pair} in ${JSON.stringify(game)}, ${chainLabel()}`);
        }
      }
    }
    // The generator reached the corners, or the comparison would prove little.
    expect(withStechen).toBeGreaterThan(150);
    expect(withLot).toBeGreaterThan(150);
    expect(lotAfterThree).toBeGreaterThan(60);
    expect(withAbsentLot).toBeGreaterThan(10);
    expect(withFacts).toBeGreaterThan(100);
    expect(maxStages).toBe(ESTIMATE_MAX_STECHEN + 1);
  });

  it("E10: the certainly closer player never pays instead of the certainly further one (full chain, any lot)", () => {
    // Truth 100, tolerance 15, k = 1: A=50, B=130, C=125. A-B and A-C tied; B certainly further than C.
    // Whichever way the lot falls, C never pays.
    for (const order of [
      ["A", "B", "C"],
      ["C", "B", "A"],
      ["B", "A", "C"],
      ["C", "A", "B"],
    ]) {
      const played = drive({
        uids: ["A", "B", "C"],
        k: 1,
        stechenAvailable: false,
        shuffle: (() => order.filter((uid) => uid !== "C")) as unknown as typeof reverse,
        plays: [{ row: rowFor("interval", 100, 15, 0), guesses: { A: 50, B: 130, C: 125 } }],
      });
      const loser = played.resolutions[0].decided?.loserUids[0];
      expect(loser === "A" || loser === "B").toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The lot is fair (Monte Carlo with the production shuffle)
// ---------------------------------------------------------------------------

describe("the final lot", () => {
  it("picks each of three exactly tied players about equally often (30 000 runs)", () => {
    const uids = ["A", "B", "C"];
    const row = rowFor("interval", 100, 0);
    const stage = guessing(row, 0, uids, 1);
    const round = { order: uids, stages: [stage], targetLoserCount: 1, mode: "online" as const };
    const guesses = guessesOf({ A: 70, B: 70, C: 70 });
    const runs = 30_000;
    const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
    for (let i = 0; i < runs; i += 1) {
      const result = resolveEstimateStage({
        round,
        stage,
        question: row,
        guesses,
        now: NOW,
        reason: "all-in",
        stechenAvailable: false,
        shuffle: secureShuffle,
      });
      expect(result.reveal.next).toBe("shuffle");
      const [loser] = result.decided?.loserUids ?? [];
      counts[loser] += 1;
    }
    for (const uid of uids) {
      expect(counts[uid] / runs, uid).toBeGreaterThan(0.3);
      expect(counts[uid] / runs, uid).toBeLessThan(0.37);
    }
  });
});

describe("module hygiene", () => {
  it("estimateDistance and compareEstimateDistance keep the ranking in the classification consistent", () => {
    const result = classifyEstimate({
      scale: "ratio",
      truth: 1_000,
      tolerance: null,
      entries: [
        { uid: "a", guess: 700 },
        { uid: "b", guess: 1_430 },
        { uid: "c", guess: 1_000 },
      ],
      payerCount: 1,
    });
    // 1430/1000 = 1.43 > 1000/700 = 1.4286: b is furthest although both print "Faktor 1,43".
    expect(result.ranked.map((r) => r.uid)).toEqual(["b", "a", "c"]);
    expect(result.payers).toEqual(["b"]);
    const [first, second] = result.ranked;
    expect(first.distance).toEqual(estimateDistance("ratio", 1_430, 1_000));
    expect(compareEstimateDistance(first.distance!, second.distance!)).toBe(1);
  });
});
