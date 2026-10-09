// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  ESTIMATE_GRACE_MS,
  ESTIMATE_MAX_MILLI,
  absentContenders,
  canGuess,
  checkEstimateGuess,
  compareEstimateDistance,
  describeEstimateDistance,
  describeEstimateDistances,
  estimateAmbiguousReading,
  estimateDistance,
  estimateUnitText,
  formatEstimateEcho,
  formatEstimateValue,
  formatEstimateWithUnit,
  guessDeadlineMs,
  isEstimateDecided,
  isStageTimedOut,
  isValidEstimateCount,
  maxEstimateLoserCount,
  nextCloseAction,
  parseEstimateInput,
  roundPayers,
  type EstimateErrorText,
  type EstimateLocale,
  type EstimateParse,
} from "@/lib/games/estimate-input";
import type {
  EstimateDistance,
  EstimatePublicQuestion,
  EstimateReveal,
  EstimateRound,
  EstimateStage,
} from "@/lib/types";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

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

const ok = (milli: number): EstimateParse => ({ ok: true, milli });
const fail = (error: Extract<EstimateParse, { ok: false }>["error"]): EstimateParse => ({
  ok: false,
  error,
});

// ---------------------------------------------------------------------------
// Parser (spec C.2): the whole table, literally
// ---------------------------------------------------------------------------

describe("parseEstimateInput: the table of spec C.2", () => {
  const table: [string, EstimateLocale, EstimateParse][] = [
    // The thousands trap, from both sides.
    ["1.000", "de", ok(1_000_000)],
    ["1.000", "en", ok(1_000)],
    ["1,000", "en", ok(1_000_000)],
    ["1,000", "de", ok(1_000)],
    // A lone foreign separator is the decimal mark.
    ["1,5", "de", ok(1_500)],
    ["1.5", "de", ok(1_500)],
    ["1.5", "en", ok(1_500)],
    ["1,5", "en", ok(1_500)],
    // Full groupings.
    ["1.234.567,89", "de", ok(1_234_567_890)],
    ["1,234,567.89", "en", ok(1_234_567_890)],
    ["1 000", "de", ok(1_000_000)],
    ["1 000,5", "de", ok(1_000_500)],
    ["1'000", "de", ok(1_000_000)],
    // The Zugspitze trap.
    ["2.962", "de", ok(2_962_000)],
    ["2.962", "en", ok(2_962)],
    ["12.345", "de", ok(12_345_000)],
    ["123.456", "de", ok(123_456_000)],
    ["1.25", "de", ok(1_250)],
    ["1000.000", "de", ok(1_000_000)],
    // REVIEW: a grouping never starts with a zero.
    ["0.125", "de", ok(125)],
    ["0.500", "de", ok(500)],
    ["0.750", "de", ok(750)],
    ["0,125", "en", ok(125)],
    ["0.001", "de", ok(1)],
    ["0.998", "de", ok(998)],
    ["0.5", "de", ok(500)],
    ["00.500", "de", ok(500)],
    ["000.125", "de", ok(125)],
    // A trailing lone separator is incomplete input, not an error.
    ["5.", "de", ok(5_000)],
    ["5,", "de", ok(5_000)],
    ["5.", "en", ok(5_000)],
    ["5,", "en", ok(5_000)],
    ["1.000,", "de", ok(1_000_000)],
    ["1.000.", "de", fail("format")],
    ["5..", "de", fail("format")],
    // Trailing zeros of the fraction are dropped; more than three decimals are never rounded.
    ["1.5000", "de", ok(1_500)],
    ["1.2345", "de", fail("too-many-decimals")],
    ["0,0005", "de", fail("too-many-decimals")],
    ["12.34.56", "de", fail("format")],
    ["1,2,3", "de", fail("format")],
    ["1.2.3", "en", fail("format")],
    ["", "de", fail("empty")],
    ["abc", "de", fail("chars")],
    ["-5", "de", fail("negative")],
    ["1e3", "de", fail("chars")],
    // The cap: 13 digits are only ok for exactly 10^12.
    ["1000000000000", "de", ok(1_000_000_000_000_000)],
    ["1000000000001", "de", fail("too-long")],
    ["1234567890123", "de", fail("too-long")],
    ["12345678901234", "de", fail("too-long")],
    [",5", "de", ok(500)],
    [".5", "en", ok(500)],
    ["007", "de", ok(7_000)],
  ];

  it.each(table)("%j in %s", (raw, locale, expected) => {
    expect(parseEstimateInput(raw, locale)).toEqual(expected);
  });

  it("reads every neutral group separator as one kind, even mixed", () => {
    for (const sep of [" ", NBSP, NNBSP, "'", "’"]) {
      expect(parseEstimateInput(`1${sep}000`, "de")).toEqual(ok(1_000_000));
      expect(parseEstimateInput(`1${sep}000`, "en")).toEqual(ok(1_000_000));
      expect(parseEstimateInput(`12${sep}345${sep}678,5`, "de")).toEqual(ok(12_345_678_500));
    }
    expect(parseEstimateInput(`1 000${NBSP}000`, "de")).toEqual(ok(1_000_000_000));
    // ...but never together with the locale's foreign mark.
    expect(parseEstimateInput("1.000 000", "de")).toEqual(fail("format"));
    expect(parseEstimateInput("1,000 000", "en")).toEqual(fail("format"));
  });

  it("rejects the sign of every kind, and anything that is not a typed number", () => {
    for (const raw of ["-5", "−5", "–5", "+5", "  -0"]) {
      expect(parseEstimateInput(raw, "de")).toEqual(fail("negative"));
    }
    for (const raw of ["5 m", "5%", "1e3", "5\t0", "５", "5-3", "1_000", "5€", "0x10"]) {
      expect(parseEstimateInput(raw, "en")).toEqual(fail("chars"));
    }
    expect(parseEstimateInput("   ", "de")).toEqual(fail("empty"));
  });

  it("trims and treats a grouping that does not fit as a format error", () => {
    expect(parseEstimateInput("  1.000  ", "de")).toEqual(ok(1_000_000));
    for (const raw of [
      "1,5.0",
      "1.5,5",
      "12.34,5",
      ".",
      ",",
      "'5",
      "1  000",
      "1.0.000",
      "1,0,00",
    ]) {
      expect(parseEstimateInput(raw, "de")).toEqual(fail("format"));
    }
    expect(parseEstimateInput("1,5.5", "en")).toEqual(fail("format"));
    expect(parseEstimateInput("1.000,5", "en")).toEqual(fail("format"));
  });

  it("reads a leading zero group as a decimal, not a grouping", () => {
    expect(parseEstimateInput("01.000", "de")).toEqual(ok(1_000));
    expect(parseEstimateInput("0.000", "de")).toEqual(ok(0));
    expect(parseEstimateInput("0", "de")).toEqual(ok(0));
    expect(parseEstimateInput("0,000", "en")).toEqual(ok(0));
  });

  it("checks the 10^15 cap on the parts, not on a float product", () => {
    expect(parseEstimateInput("1000000000000,000", "de")).toEqual(ok(ESTIMATE_MAX_MILLI));
    expect(parseEstimateInput("1000000000000,001", "de")).toEqual(fail("too-long"));
    expect(parseEstimateInput("999999999999,999", "de")).toEqual(ok(999_999_999_999_999));
    expect(parseEstimateInput("1.000.000.000.000", "de")).toEqual(ok(ESTIMATE_MAX_MILLI));
    expect(parseEstimateInput("1,000,000,000,001", "en")).toEqual(fail("too-long"));
    // Leading zeros do not count towards the digit cap.
    expect(parseEstimateInput("0000000000000007", "de")).toEqual(ok(7_000));
  });

  it("reports the digit cap before the decimals cap", () => {
    expect(parseEstimateInput("12345678901234,12345", "de")).toEqual(fail("too-long"));
    expect(parseEstimateInput("1,23456", "de")).toEqual(fail("too-many-decimals"));
  });
});

/**
 * The spec's reference parser (scratchpad review2/parse2.mjs), embedded so the
 * production parser, written from the prose, is checked against it on a fuzz.
 */
function referenceParse(raw: string, locale: EstimateLocale): EstimateParse {
  const neutral = /[\u0020\u00A0\u202F\u2019']/;
  const s = raw.trim();
  if (s === "") return fail("empty");
  if (/^[-\u2212\u2013+]/.test(s)) return fail("negative");
  if (!/^[0-9.,\u0020\u00A0\u202F\u2019']+$/.test(s)) return fail("chars");
  const dec = locale === "de" ? "," : ".";
  const other = locale === "de" ? "." : ",";
  const decCount = [...s].filter((c) => c === dec).length;
  if (decCount > 1) return fail("format");
  let intRaw = s;
  let fracRaw = "";
  if (decCount === 1) {
    const i = s.indexOf(dec);
    intRaw = s.slice(0, i);
    fracRaw = s.slice(i + 1);
  }
  if (!/^[0-9]*$/.test(fracRaw)) return fail("format");
  let intDigits: string;
  const seps = [...intRaw].filter((c) => !/[0-9]/.test(c));
  if (seps.length === 0) intDigits = intRaw;
  else {
    const allSame = seps.every((c) => c === seps[0] || (neutral.test(c) && neutral.test(seps[0])));
    const groups = intRaw.split(/[^0-9]/);
    const validGroups =
      allSame &&
      /^[1-9][0-9]{0,2}$/.test(groups[0]) &&
      groups.slice(1).every((g) => /^[0-9]{3}$/.test(g));
    if (validGroups) intDigits = groups.join("");
    else if (decCount === 0 && seps.length === 1 && seps[0] === other) {
      intDigits = groups[0];
      fracRaw = groups[1];
    } else return fail("format");
  }
  if (intDigits === "" && fracRaw === "") return fail("format");
  intDigits = intDigits.replace(/^0+(?=\d)/, "");
  if (intDigits === "") intDigits = "0";
  if (intDigits.length > 13) return fail("too-long");
  let frac = fracRaw.replace(/0+$/, "");
  if (frac.length > 3) return fail("too-many-decimals");
  frac = frac.padEnd(3, "0");
  const milli = Number(intDigits) * 1000 + Number(frac);
  if (milli > ESTIMATE_MAX_MILLI) return fail("too-long");
  return ok(milli);
}

describe("parseEstimateInput: fuzz and round trip", () => {
  it("never throws, never exceeds the cap, and agrees with the reference parser on 20 000 strings", () => {
    const rand = seeded(20260101);
    const alphabet = [
      ..."0123456789".repeat(4),
      "..",
      ",,",
      " ",
      NBSP,
      NNBSP,
      "'",
      "’",
      "-",
      "e",
      "a",
      "%",
    ];
    let accepted = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const length = Math.floor(rand() * 17);
      let raw = "";
      for (let c = 0; c < length; c += 1) raw += alphabet[Math.floor(rand() * alphabet.length)];
      for (const locale of ["de", "en"] as const) {
        const result = parseEstimateInput(raw, locale);
        const reference = referenceParse(raw, locale);
        // The label is built only on a mismatch: 40 000 parses would otherwise spend their time on JSON.stringify.
        if (JSON.stringify(result) !== JSON.stringify(reference)) {
          expect(result, `${JSON.stringify(raw)} ${locale}`).toEqual(reference);
        }
        if (result.ok) {
          accepted += 1;
          expect(
            Number.isSafeInteger(result.milli) &&
              result.milli >= 0 &&
              result.milli <= ESTIMATE_MAX_MILLI,
          ).toBe(true);
        }
      }
    }
    // The fuzz must reach the accepting paths, or it proves nothing.
    expect(accepted).toBeGreaterThan(1_500);
  });

  it("parses back whatever the formatter prints, for both locales and both groupings", () => {
    const rand = seeded(7);
    const specials = [0, 1, 9, 10, 99, 100, 125, 500, 999, 1_000, 1_001, 1_500, 999_999, 1_000_000];
    const values = [...specials, ESTIMATE_MAX_MILLI, ESTIMATE_MAX_MILLI - 1];
    for (let i = 0; i < 4_000; i += 1) {
      const digits = Math.floor(rand() * 16) + 1;
      let text = "";
      for (let d = 0; d < digits; d += 1) text += String(Math.floor(rand() * 10));
      values.push(Number(BigInt(text) % BigInt(ESTIMATE_MAX_MILLI + 1)));
    }
    for (const milli of values) {
      for (const locale of ["de", "en"] as const) {
        for (const grouping of [true, false]) {
          const text = formatEstimateValue(milli, locale, { grouping });
          const parsed = parseEstimateInput(text, locale);
          if (!parsed.ok || parsed.milli !== milli) {
            expect(parsed, `${milli} ${locale} ${text}`).toEqual(ok(milli));
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Range check (C.3)
// ---------------------------------------------------------------------------

describe("checkEstimateGuess", () => {
  const bounds = { minMilli: 1_000, maxMilli: 9_000_000 };
  const ratio = { scale: "ratio", format: "quantity", bounds } as const;
  const interval = {
    scale: "interval",
    format: "quantity",
    bounds: { minMilli: 0, maxMilli: 9e6 },
  } as const;
  const year = {
    scale: "interval",
    format: "year",
    bounds: { minMilli: 0, maxMilli: 3_000_000 },
  } as const;

  it("accepts a value inside the class range", () => {
    expect(checkEstimateGuess(1_000, ratio)).toBeNull();
    expect(checkEstimateGuess(9_000_000, ratio)).toBeNull();
    expect(checkEstimateGuess(0, interval)).toBeNull();
    expect(checkEstimateGuess(1_969_000, year)).toBeNull();
  });

  it("reports each problem, in the order of the spec", () => {
    expect(checkEstimateGuess(0, ratio)).toBe("zero");
    expect(checkEstimateGuess(999, ratio)).toBe("below-min");
    expect(checkEstimateGuess(9_000_001, ratio)).toBe("above-max");
    expect(checkEstimateGuess(1_969_500, year)).toBe("not-whole");
    expect(checkEstimateGuess(3_000_001, year)).toBe("not-whole");
    expect(checkEstimateGuess(4_000_000, year)).toBe("above-max");
    expect(checkEstimateGuess(-1, interval)).toBe("invalid");
    expect(checkEstimateGuess(1.5, interval)).toBe("invalid");
    expect(checkEstimateGuess(Number.NaN, interval)).toBe("invalid");
    expect(checkEstimateGuess(Number.POSITIVE_INFINITY, interval)).toBe("invalid");
    expect(checkEstimateGuess(ESTIMATE_MAX_MILLI + 1, interval)).toBe("invalid");
    expect(checkEstimateGuess(2 ** 53, interval)).toBe("invalid");
    // "invalid" outranks "zero": a ratio -0.5 is invalid, not zero.
    expect(checkEstimateGuess(-0.5, ratio)).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// Formatting (C.4)
// ---------------------------------------------------------------------------

const METRE = { unit: { de: "Meter", en: "metres", symbol: "m" }, format: "quantity" } as const;
const COUNT = {
  unit: { de: "Einwohner", en: "inhabitants", symbol: "" },
  format: "quantity",
} as const;
const PERCENT = {
  unit: { de: "Prozent", en: "percent", symbol: "%" },
  format: "quantity",
} as const;
const CELSIUS = { unit: { de: "Grad", en: "degrees", symbol: "°C" }, format: "quantity" } as const;
const YEAR = { unit: { de: "Jahr", en: "year", symbol: "" }, format: "year" } as const;

describe("formatEstimateValue", () => {
  it("prints the examples of spec C.4", () => {
    expect(formatEstimateValue(1_000_000, "de")).toBe("1.000");
    expect(formatEstimateValue(1_234_567, "en")).toBe("1,234.567");
    expect(formatEstimateValue(500, "de")).toBe("0,5");
    expect(formatEstimateValue(1_969_000, "de", { grouping: false })).toBe("1969");
    expect(formatEstimateValue(83_200_000_000, "de")).toBe("83.200.000");
    expect(formatEstimateValue(123_456_789_012_000, "en")).toBe("123,456,789,012");
    expect(formatEstimateValue(1_000_000_000_000_000, "en")).toBe("1,000,000,000,000");
  });

  it("trims the fraction's zeros, groups only the integer part, and handles 0", () => {
    expect(formatEstimateValue(0, "de")).toBe("0");
    expect(formatEstimateValue(1, "de")).toBe("0,001");
    expect(formatEstimateValue(1_050, "en")).toBe("1.05");
    expect(formatEstimateValue(1_234_500, "de")).toBe("1.234,5");
    expect(formatEstimateValue(999_999, "de")).toBe("999,999");
    expect(formatEstimateValue(100_000, "en")).toBe("100");
    expect(formatEstimateValue(1_000, "en")).toBe("1");
    expect(formatEstimateValue(12_345_678_000, "en", { grouping: false })).toBe("12345678");
  });

  it("refuses a value that is no milli integer instead of printing garbage", () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => formatEstimateValue(bad, "de")).toThrow(RangeError);
    }
  });
});

describe("units and the echo line", () => {
  it("separates a unit by a non-breaking space; % is attached in English only", () => {
    expect(formatEstimateWithUnit(2_962_000, METRE, "de")).toBe(`2.962${NBSP}m`);
    expect(formatEstimateWithUnit(2_962_000, METRE, "en")).toBe(`2,962${NBSP}m`);
    expect(formatEstimateWithUnit(21_000, CELSIUS, "de")).toBe(`21${NBSP}°C`);
    expect(formatEstimateWithUnit(71_000, PERCENT, "de")).toBe(`71${NBSP}%`);
    expect(formatEstimateWithUnit(71_000, PERCENT, "en")).toBe("71%");
  });

  it("prints the label for a row without a symbol, and no unit at all for a year", () => {
    expect(formatEstimateWithUnit(83_200_000_000, COUNT, "de")).toBe(`83.200.000${NBSP}Einwohner`);
    expect(formatEstimateWithUnit(83_200_000_000, COUNT, "en")).toBe(
      `83,200,000${NBSP}inhabitants`,
    );
    expect(formatEstimateWithUnit(1_969_000, YEAR, "de")).toBe("1969");
    expect(formatEstimateWithUnit(1_969_000, YEAR, "en")).toBe("1969");
    expect(estimateUnitText(YEAR, "de")).toBe("");
    expect(estimateUnitText(COUNT, "en")).toBe("inhabitants");
    expect(estimateUnitText(METRE, "de")).toBe("m");
  });

  it("echoes the reading, and the same typed text echoes differently per locale", () => {
    const de = parseEstimateInput("1.000", "de");
    const en = parseEstimateInput("1.000", "en");
    if (!de.ok || !en.ok) throw new Error("both parse");
    expect(formatEstimateEcho(de.milli, METRE, "de")).toBe(`= 1.000${NBSP}m`);
    expect(formatEstimateEcho(en.milli, METRE, "en")).toBe(`= 1${NBSP}m`);
    expect(formatEstimateEcho(1_969_000, YEAR, "de")).toBe("= 1969");
  });
});

describe("estimateAmbiguousReading", () => {
  it("offers the other reading of a<sep>bbb", () => {
    expect(estimateAmbiguousReading("1.000", "de")).toEqual({
      value: 1_000_000,
      alt: 1_000,
      altInput: "1",
    });
    expect(estimateAmbiguousReading("1,000", "en")).toEqual({
      value: 1_000_000,
      alt: 1_000,
      altInput: "1",
    });
    expect(estimateAmbiguousReading("1,000", "de")).toEqual({
      value: 1_000,
      alt: 1_000_000,
      altInput: "1000",
    });
    expect(estimateAmbiguousReading("1.000", "en")).toEqual({
      value: 1_000,
      alt: 1_000_000,
      altInput: "1000",
    });
    expect(estimateAmbiguousReading("12.345", "de")).toEqual({
      value: 12_345_000,
      alt: 12_345,
      altInput: "12,345",
    });
    expect(estimateAmbiguousReading("  2.962 ", "de")?.value).toBe(2_962_000);
  });

  it("stays silent for everything unambiguous", () => {
    for (const raw of [
      "0.125",
      "1.25",
      "1.0000",
      "1000.000",
      "1",
      "1.5",
      "12",
      "1.000.000",
      "abc",
      "",
      "5.",
    ]) {
      expect(estimateAmbiguousReading(raw, "de"), raw).toBeNull();
      expect(estimateAmbiguousReading(raw, "en"), raw).toBeNull();
    }
  });

  it("is exactly the set of patterns whose two readings both parse", () => {
    for (let a = 1; a <= 999; a += 37) {
      for (const b of ["000", "001", "125", "500", "999"]) {
        for (const sep of [".", ","]) {
          for (const locale of ["de", "en"] as const) {
            const raw = `${a}${sep}${b}`;
            const hit = estimateAmbiguousReading(raw, locale);
            expect(hit).not.toBeNull();
            const parsed = parseEstimateInput(raw, locale);
            const other = parseEstimateInput(hit?.altInput ?? "", locale);
            expect(parsed).toEqual(ok(hit?.value ?? -1));
            expect(other).toEqual(ok(hit?.alt ?? -1));
            expect(hit?.value).not.toBe(hit?.alt);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Distance and exact comparison (C.5)
// ---------------------------------------------------------------------------

describe("estimateDistance / compareEstimateDistance", () => {
  it("builds the distances of example E1 (an exact ratio tie)", () => {
    const a = estimateDistance("ratio", 50_000, 100_000);
    const b = estimateDistance("ratio", 200_000, 100_000);
    expect(a).toEqual({ kind: "ratio", hi: 100_000, lo: 50_000, direction: "low" });
    expect(b).toEqual({ kind: "ratio", hi: 200_000, lo: 100_000, direction: "high" });
    expect(compareEstimateDistance(a, b)).toBe(0);
    expect(compareEstimateDistance(b, a)).toBe(0);
  });

  it("builds interval distances and the exact direction", () => {
    expect(estimateDistance("interval", 90, 100)).toEqual({
      kind: "interval",
      diffMilli: 10,
      direction: "low",
    });
    expect(estimateDistance("interval", 111, 100)).toEqual({
      kind: "interval",
      diffMilli: 11,
      direction: "high",
    });
    expect(estimateDistance("interval", 0, 0)).toEqual({
      kind: "interval",
      diffMilli: 0,
      direction: "exact",
    });
    expect(estimateDistance("ratio", 7, 7)).toEqual({
      kind: "ratio",
      hi: 7,
      lo: 7,
      direction: "exact",
    });
  });

  it("orders: -1 closer, 1 further", () => {
    const near = estimateDistance("ratio", 1_100, 1_000);
    const far = estimateDistance("ratio", 1_200, 1_000);
    expect(compareEstimateDistance(near, far)).toBe(-1);
    expect(compareEstimateDistance(far, near)).toBe(1);
    const i1 = estimateDistance("interval", 5, 100);
    const i2 = estimateDistance("interval", 120, 100);
    expect(compareEstimateDistance(i1, i2)).toBe(1);
    expect(compareEstimateDistance(i2, i1)).toBe(-1);
    expect(compareEstimateDistance(i1, i1)).toBe(0);
  });

  it("throws on a ratio with a value <= 0, a non-integer, and mixed kinds", () => {
    expect(() => estimateDistance("ratio", 0, 100)).toThrow(RangeError);
    expect(() => estimateDistance("ratio", 100, 0)).toThrow(RangeError);
    expect(() => estimateDistance("ratio", -5, 100)).toThrow(RangeError);
    expect(() => estimateDistance("interval", 1.5, 100)).toThrow(RangeError);
    expect(() => estimateDistance("interval", 5, Number.NaN)).toThrow(RangeError);
    expect(() =>
      compareEstimateDistance(
        { kind: "ratio", hi: 2, lo: 1, direction: "high" },
        { kind: "interval", diffMilli: 1, direction: "high" },
      ),
    ).toThrow();
  });
});

/** Exact comparison of a/b with c/d by continued fractions: plain numbers, no BigInt, no division by float. */
function compareFractions(a: number, b: number, c: number, d: number): -1 | 0 | 1 {
  const quotient = (n: number, m: number) => (n - (n % m)) / m;
  let [w, x, y, z] = [a, b, c, d];
  for (;;) {
    const q1 = quotient(w, x);
    const q2 = quotient(y, z);
    if (q1 !== q2) return q1 < q2 ? -1 : 1;
    const r1 = w - q1 * x;
    const r2 = y - q2 * z;
    if (r1 === 0 && r2 === 0) return 0;
    if (r1 === 0) return -1;
    if (r2 === 0) return 1;
    // r1/x < r2/z  <=>  x/r1 > z/r2  <=>  z/r2 < x/r1: the same sign after swapping the roles.
    [w, x, y, z] = [z, r2, x, r1];
  }
}

describe("exactness of the ratio comparison", () => {
  it("the reference fractions comparison itself agrees with BigInt on small and on huge values", () => {
    const rand = seeded(3);
    for (let i = 0; i < 3_000; i += 1) {
      const big = i % 2 === 0;
      const pick = () => 1 + Math.floor(rand() * (big ? 10 ** 15 - 1 : 50));
      const [a, b, c, d] = [pick(), pick(), pick(), pick()];
      const left = BigInt(a) * BigInt(d);
      const right = BigInt(c) * BigInt(b);
      expect(compareFractions(a, b, c, d)).toBe(left < right ? -1 : left > right ? 1 : 0);
    }
  });

  it("agrees with an independent exact reference on 10 000 pairs incl. values near 10^15", () => {
    const rand = seeded(15);
    let floatDiffers = 0;
    for (let i = 0; i < 10_000; i += 1) {
      const kind = i % 4;
      let lo1: number;
      let lo2: number;
      let hi1: number;
      let hi2: number;
      if (kind === 0) {
        // Anything.
        lo1 = 1 + Math.floor(rand() * 1_000);
        lo2 = 1 + Math.floor(rand() * 1_000);
        hi1 = lo1 + Math.floor(rand() * 5_000);
        hi2 = lo2 + Math.floor(rand() * 5_000);
      } else if (kind === 1) {
        // Both factors huge and different.
        lo1 = 5 * 10 ** 14 + Math.floor(rand() * 10 ** 14);
        lo2 = 5 * 10 ** 14 + Math.floor(rand() * 10 ** 14);
        hi1 = Math.min(10 ** 15, lo1 + Math.floor(rand() * 4 * 10 ** 14));
        hi2 = Math.min(10 ** 15, lo2 + Math.floor(rand() * 4 * 10 ** 14));
      } else if (kind === 2) {
        // Two almost equal factors (1 part in 10^15): a float cannot see the difference.
        lo1 = 3 * 10 ** 14 + Math.floor(rand() * 10 ** 14);
        hi1 = Math.min(10 ** 15, lo1 + 1 + Math.floor(rand() * 5 * 10 ** 14));
        lo2 = lo1 + (rand() < 0.5 ? 1 : 0);
        hi2 = hi1 + (rand() < 0.5 ? 1 : -1);
      } else {
        // A product that is one off: hi1 * lo2 = hi2 * lo1 +- 1.
        lo1 = 10 ** 15 - 1 - Math.floor(rand() * 1_000);
        hi1 = 10 ** 15 - Math.floor(rand() * 1_000);
        lo2 = lo1 - 1;
        hi2 = hi1 - 1;
      }
      if (hi1 < lo1 || hi2 < lo2) continue;
      const a: EstimateDistance = { kind: "ratio", hi: hi1, lo: lo1, direction: "high" };
      const b: EstimateDistance = { kind: "ratio", hi: hi2, lo: lo2, direction: "low" };
      const exact = compareFractions(hi1, lo1, hi2, lo2);
      const got = compareEstimateDistance(a, b);
      if (got !== exact) expect(got, `${hi1}/${lo1} vs ${hi2}/${lo2}`).toBe(exact);
      expect(compareEstimateDistance(b, a)).toBe(exact === 0 ? 0 : -exact);
      const fa = Math.log10(hi1 / lo1);
      const fb = Math.log10(hi2 / lo2);
      const viaFloat = fa < fb ? -1 : fa > fb ? 1 : 0;
      if (viaFloat !== exact) floatDiffers += 1;
    }
    // The test proves its worth only if a float comparison really gets some of these wrong.
    expect(floatDiffers).toBeGreaterThan(0);
  });

  it("orders the one-off product exactly: (t+1)/t is closer than t/(t-1)", () => {
    const t = 999_999_999_999_999;
    const above = estimateDistance("ratio", t + 1, t);
    const below = estimateDistance("ratio", t - 1, t);
    expect(compareEstimateDistance(above, below)).toBe(-1);
    expect(compareEstimateDistance(below, above)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Error text (C.12)
// ---------------------------------------------------------------------------

describe("describeEstimateDistance", () => {
  const ratio = (
    hi: number,
    lo: number,
    direction: "high" | "low" | "exact" = "high",
  ): EstimateDistance => ({
    kind: "ratio",
    hi,
    lo,
    direction,
  });

  it("prints the examples of spec C.12", () => {
    expect(describeEstimateDistance(ratio(140_000, 100_000), METRE, "de")).toEqual({
      kind: "factor",
      direction: "high",
      factor: "1,4",
    });
    expect(describeEstimateDistance(ratio(100_000, 50_000, "low"), METRE, "de")).toEqual({
      kind: "factor",
      direction: "low",
      factor: "2",
    });
    expect(describeEstimateDistance(ratio(1_004, 1_000), METRE, "de")).toEqual({
      kind: "percent",
      direction: "high",
      percent: `0,4${NBSP}%`,
    });
    expect(describeEstimateDistance(ratio(12_345, 1_000), METRE, "de")).toEqual({
      kind: "factor",
      direction: "high",
      factor: "12,3",
    });
    expect(
      describeEstimateDistance(
        { kind: "interval", diffMilli: 6_000, direction: "high" },
        YEAR,
        "de",
      ),
    ).toEqual({ kind: "interval", direction: "high", amount: "6", isYear: true });
    expect(describeEstimateDistance(ratio(7, 7, "exact"), METRE, "de")).toEqual({ kind: "exact" });
    expect(
      describeEstimateDistance({ kind: "interval", diffMilli: 0, direction: "exact" }, METRE, "de"),
    ).toEqual({ kind: "exact" });
  });

  it("uses the locale's marks, and the unit for an interval amount", () => {
    expect(describeEstimateDistance(ratio(140_000, 100_000), METRE, "en")).toMatchObject({
      factor: "1.4",
    });
    expect(describeEstimateDistance(ratio(1_004, 1_000), METRE, "en")).toMatchObject({
      percent: "0.4%",
    });
    expect(
      describeEstimateDistance(
        { kind: "interval", diffMilli: 17_000, direction: "low" },
        METRE,
        "de",
      ),
    ).toEqual({ kind: "interval", direction: "low", amount: `17${NBSP}m`, isYear: false });
    expect(
      describeEstimateDistance(
        { kind: "interval", diffMilli: 1_500, direction: "low" },
        COUNT,
        "en",
      ),
    ).toMatchObject({ amount: `1.5${NBSP}inhabitants` });
    expect(
      describeEstimateDistance(
        { kind: "interval", diffMilli: 1_234_000, direction: "high" },
        YEAR,
        "de",
      ),
    ).toMatchObject({ amount: "1234", isYear: true });
  });

  it("picks the number of decimals by magnitude, rounds half up and groups", () => {
    // 1.125 -> 2 decimals, half up.
    expect(describeEstimateDistance(ratio(1_125, 1_000), METRE, "de")).toMatchObject({
      factor: "1,13",
    });
    // 9.995 -> would round to 10 (printed "10": zero-trimmed, never "10,00").
    expect(describeEstimateDistance(ratio(9_995, 1_000), METRE, "de")).toMatchObject({
      factor: "10",
    });
    expect(describeEstimateDistance(ratio(99_960, 1_000), METRE, "de")).toMatchObject({
      factor: "100",
    });
    expect(describeEstimateDistance(ratio(123_456, 1_000), METRE, "de")).toMatchObject({
      factor: "123",
    });
    expect(describeEstimateDistance(ratio(1_234_567_000, 1_000), METRE, "de")).toMatchObject({
      factor: "1.234.567",
    });
    expect(describeEstimateDistance(ratio(1_234_567_000, 1_000), METRE, "en")).toMatchObject({
      factor: "1,234,567",
    });
  });

  it("switches to percent below a factor of 1.05, with the boundary on the factor side", () => {
    expect(describeEstimateDistance(ratio(1_050, 1_000), METRE, "de")).toMatchObject({
      kind: "factor",
      factor: "1,05",
    });
    // 4.99 % rounds to 5 (zero-trimmed).
    expect(describeEstimateDistance(ratio(10_499, 10_000), METRE, "de")).toMatchObject({
      kind: "percent",
      percent: `5${NBSP}%`,
    });
    // Never "0,0 %": a guess that is not exact is at least 0,1 % off.
    const near = describeEstimateDistance(ratio(10 ** 15, 10 ** 15 - 1), METRE, "de");
    expect(near).toMatchObject({ kind: "percent", percent: `0,1${NBSP}%` });
  });

  it("adds decimals on request (extraDecimals)", () => {
    const seventh = ratio(1_000, 700, "low"); // 1.428571...
    expect(describeEstimateDistance(seventh, METRE, "de")).toMatchObject({ factor: "1,43" });
    expect(describeEstimateDistance(seventh, METRE, "de", 1)).toMatchObject({ factor: "1,429" });
    expect(describeEstimateDistance(seventh, METRE, "de", 2)).toMatchObject({ factor: "1,4286" });
    expect(describeEstimateDistance(ratio(1_430, 1_000), METRE, "de", 3)).toMatchObject({
      factor: "1,43",
    });
    expect(describeEstimateDistance(ratio(10_043, 10_000), METRE, "de")).toMatchObject({
      percent: `0,4${NBSP}%`,
    });
    expect(describeEstimateDistance(ratio(10_043, 10_000), METRE, "de", 1)).toMatchObject({
      percent: `0,43${NBSP}%`,
    });
    expect(describeEstimateDistance(ratio(123_456, 1_000), METRE, "de", 1)).toMatchObject({
      factor: "123,5",
    });
    // Interval amounts are exact already.
    const interval: EstimateDistance = { kind: "interval", diffMilli: 17_000, direction: "high" };
    expect(describeEstimateDistance(interval, METRE, "de", 3)).toEqual(
      describeEstimateDistance(interval, METRE, "de"),
    );
  });

  it("refuses nonsense instead of printing it", () => {
    expect(() => describeEstimateDistance(ratio(100, 0), METRE, "de")).toThrow(RangeError);
    expect(() => describeEstimateDistance(ratio(50, 100), METRE, "de")).toThrow(RangeError);
    expect(() => describeEstimateDistance(ratio(200, 100), METRE, "de", -1)).toThrow(RangeError);
    expect(() => describeEstimateDistance(ratio(200, 100), METRE, "de", 1.5)).toThrow(RangeError);
    expect(() => describeEstimateDistance(ratio(200, 100), METRE, "de", 1_000)).toThrow(RangeError);
  });
});

describe("describeEstimateDistances: adjacent rows never read equal but rank differently", () => {
  /** Rows as a ranking has them: furthest first. */
  const row = (uid: string, distance: EstimateDistance | null) => ({ uid, distance });
  const high = (hi: number, lo: number): EstimateDistance => ({
    kind: "ratio",
    hi,
    lo,
    direction: "high",
  });
  const low = (hi: number, lo: number): EstimateDistance => ({
    kind: "ratio",
    hi,
    lo,
    direction: "low",
  });

  it("truth 1000, guesses 700 and 1430: 1,429 against 1,43", () => {
    const texts = describeEstimateDistances(
      [row("B", high(1_430, 1_000)), row("A", low(1_000, 700))],
      METRE,
      "de",
    );
    expect(texts.A).toEqual({ kind: "factor", direction: "low", factor: "1,429" });
    expect(texts.B).toEqual({ kind: "factor", direction: "high", factor: "1,43" });
  });

  it("leaves rows alone that already differ, and prints exact ties alike", () => {
    const texts = describeEstimateDistances(
      [
        row("C", high(400, 100)),
        row("A", low(100_000, 50_000)),
        row("B", high(200_000, 100_000)),
        row("D", high(5, 4)),
      ],
      METRE,
      "en",
    );
    expect(texts.C).toEqual({ kind: "factor", direction: "high", factor: "4" });
    expect(texts.A).toEqual({ kind: "factor", direction: "low", factor: "2" });
    expect(texts.B).toEqual({ kind: "factor", direction: "high", factor: "2" });
    expect(texts.D).toEqual({ kind: "factor", direction: "high", factor: "1.25" });
  });

  it("raises a tie group as one: its members keep printing alike", () => {
    // 1.43 (above), then 10/7 twice: the pair must be told apart from 1.43 and still read the same.
    const texts = describeEstimateDistances(
      [row("X", high(1_430, 1_000)), row("Y", low(1_000, 700)), row("Z", high(2_000, 1_400))],
      METRE,
      "de",
    );
    expect(texts.X).toMatchObject({ factor: "1,43" });
    expect(texts.Y).toMatchObject({ factor: "1,429", direction: "low" });
    expect(texts.Z).toMatchObject({ factor: "1,429", direction: "high" });
  });

  it("keeps raising until the percent texts differ", () => {
    const truth = 1_000_000_000;
    const texts = describeEstimateDistances(
      [row("far", high(truth + 140_000, truth)), row("near", high(truth + 100_000, truth))],
      METRE,
      "de",
    );
    expect(texts.far).toMatchObject({ kind: "percent", percent: `0,014${NBSP}%` });
    expect(texts.near).toMatchObject({ kind: "percent", percent: `0,01${NBSP}%` });
  });

  it("falls back to the exact fraction only when the factor decimals run out", () => {
    const lo = 333_333_333_333_333;
    const texts = describeEstimateDistances(
      [row("exact3", high(999_999_999_999_999, lo)), row("almost3", low(999_999_999_999_998, lo))],
      METRE,
      "de",
    );
    expect(texts.exact3).toEqual({ kind: "fraction", direction: "high", hi: "3", lo: "1" });
    expect(texts.almost3).toEqual({
      kind: "fraction",
      direction: "low",
      hi: "999.999.999.999.998",
      lo: "333.333.333.333.333",
    });
  });

  it("falls back to the exact fraction when the percent decimals run out", () => {
    const base = 100_000_000_000_000;
    const texts = describeEstimateDistances(
      [row("b", high(base + 20_000, base)), row("a", high(base + 10_000, base))],
      METRE,
      "en",
    );
    expect(texts.b).toEqual({
      kind: "fraction",
      direction: "high",
      hi: "5,000,000,001",
      lo: "5,000,000,000",
    });
    expect(texts.a).toEqual({
      kind: "fraction",
      direction: "high",
      hi: "10,000,000,001",
      lo: "10,000,000,000",
    });
  });

  it("gives null for a missing guess, keeps every uid, and never changes interval rows", () => {
    const texts = describeEstimateDistances(
      [
        row("none", null),
        row("far", { kind: "interval", diffMilli: 30_000, direction: "high" }),
        row("near", { kind: "interval", diffMilli: 29_999, direction: "low" }),
        row("spot", { kind: "interval", diffMilli: 0, direction: "exact" }),
      ],
      METRE,
      "de",
    );
    expect(Object.keys(texts)).toEqual(["none", "far", "near", "spot"]);
    expect(texts.none).toBeNull();
    expect(texts.far).toMatchObject({ amount: `30${NBSP}m` });
    expect(texts.near).toMatchObject({ amount: `29,999${NBSP}m` });
    expect(texts.spot).toEqual({ kind: "exact" });
    expect(describeEstimateDistances([], METRE, "de")).toEqual({});
  });

  it("on random rankings: unequal distances never print equal text, equal ones always do", () => {
    const rand = seeded(12);
    const key = (text: EstimateErrorText | null): string => {
      if (text === null) return "null";
      if (text.kind === "exact") return "exact";
      if (text.kind === "factor") return `f${text.factor}`;
      if (text.kind === "percent") return `p${text.percent}`;
      if (text.kind === "fraction") return `r${text.hi}/${text.lo}`;
      return `i${text.amount}`;
    };
    for (let run = 0; run < 400; run += 1) {
      const count = 2 + Math.floor(rand() * 6);
      const lo = 1_000 + Math.floor(rand() * 5_000);
      const rows: { uid: string; distance: EstimateDistance }[] = [];
      for (let i = 0; i < count; i += 1) {
        // Clusters of nearly equal factors around a few centres, some of them exactly equal.
        const centre = [1_001, 1_040, 1_430, 2_000, 12_345][Math.floor(rand() * 5)];
        const hi = Math.max(lo, Math.floor((lo * centre) / 1_000) + Math.floor(rand() * 3));
        rows.push({
          uid: `u${i}`,
          distance: { kind: "ratio", hi, lo, direction: rand() < 0.5 ? "high" : "low" },
        });
        if (rand() < 0.3) {
          const copy = rows[rows.length - 1].distance as Extract<
            EstimateDistance,
            { kind: "ratio" }
          >;
          rows.push({
            uid: `t${i}`,
            distance: { ...copy, direction: copy.direction === "high" ? "low" : "high" },
          });
        }
      }
      rows.sort((a, b) => -compareEstimateDistance(a.distance, b.distance));
      const texts = describeEstimateDistances(rows, METRE, "de");
      for (let i = 0; i + 1 < rows.length; i += 1) {
        const cmp = compareEstimateDistance(rows[i].distance, rows[i + 1].distance);
        const same = key(texts[rows[i].uid]) === key(texts[rows[i + 1].uid]);
        if (same !== (cmp === 0)) expect(same, JSON.stringify(rows)).toBe(cmp === 0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Small helpers (C.8, C.9)
// ---------------------------------------------------------------------------

const QUESTION: EstimatePublicQuestion = {
  id: "est-geo-9001",
  category: "geography",
  tone: "standard",
  text: { de: "Wie hoch?", en: "How high?" },
  unit: { de: "Meter", en: "metres", symbol: "m" },
  scale: "ratio",
  format: "quantity",
  bounds: { minMilli: 1, maxMilli: ESTIMATE_MAX_MILLI },
};

function stage(overrides: Partial<EstimateStage> = {}): EstimateStage {
  return {
    index: 0,
    kind: "main",
    question: QUESTION,
    contenders: ["a", "b", "c"],
    slots: 1,
    openedAt: "2026-01-01T10:00:00.000Z",
    closesAt: "2026-01-01T10:05:00.000Z",
    lastCallAt: null,
    submitted: ["a"],
    status: "guessing",
    reveal: null,
    ...overrides,
  };
}

function reveal(overrides: Partial<EstimateReveal> = {}): EstimateReveal {
  return {
    revealedAt: "2026-01-01T10:06:00.000Z",
    reason: "all-in",
    truthMilli: 100_000,
    tolerance: null,
    asOf: 2024,
    source: { label: "S", url: "https://example.org" },
    sources: [],
    definition: "d",
    note: null,
    results: [],
    payers: [],
    safe: [],
    contested: [],
    slotsLeft: 0,
    precedes: [],
    bandTie: false,
    next: "decided",
    shuffled: null,
    lotPayers: null,
    ...overrides,
  };
}

const CLOSES = Date.parse("2026-01-01T10:05:00.000Z");

describe("pool-size helpers", () => {
  it("maxEstimateLoserCount is pool - 1, at least 1", () => {
    expect(maxEstimateLoserCount(2)).toBe(1);
    expect(maxEstimateLoserCount(5)).toBe(4);
    expect(maxEstimateLoserCount(32)).toBe(31);
    expect(maxEstimateLoserCount(1)).toBe(1);
  });

  it("isValidEstimateCount: the table of spec C.13", () => {
    const table: [number, number, boolean][] = [
      [1, 2, true],
      [2, 2, false],
      [3, 3, false],
      [2, 3, true],
      [0, 3, false],
      [1.5, 3, false],
      [1, 33, false],
      [31, 32, true],
      [32, 32, false],
      [-1, 3, false],
      [1, 1, false],
      [1, 0, false],
      [Number.NaN, 3, false],
      [1, 2.5, false],
    ];
    for (const [k, pool, expected] of table) {
      expect(isValidEstimateCount(k, pool), `k=${k} pool=${pool}`).toBe(expected);
    }
  });
});

describe("canGuess", () => {
  it("is true for a contender of the running round's guessing last stage", () => {
    const round: Pick<EstimateRound, "status" | "stages"> = {
      status: "running",
      stages: [stage()],
    };
    expect(canGuess(round, "a")).toBe(true);
    expect(canGuess(round, "c")).toBe(true);
    expect(canGuess(round, "z")).toBe(false);
  });

  it("is false when the round is not running or the last stage is revealed", () => {
    expect(canGuess({ status: "finished", stages: [stage()] }, "a")).toBe(false);
    expect(canGuess({ status: "cancelled", stages: [stage()] }, "a")).toBe(false);
    expect(
      canGuess(
        { status: "running", stages: [stage({ status: "revealed", reveal: reveal() })] },
        "a",
      ),
    ).toBe(false);
    expect(canGuess({ status: "running", stages: [] }, "a")).toBe(false);
  });

  it("only the LAST stage counts: a Stechfrage excludes everyone who was not contested", () => {
    const round: Pick<EstimateRound, "status" | "stages"> = {
      status: "running",
      stages: [
        stage({ status: "revealed", reveal: reveal({ next: "stechen" }) }),
        stage({ index: 1, kind: "stechen", contenders: ["a", "b"], slots: 1 }),
      ],
    };
    expect(canGuess(round, "a")).toBe(true);
    expect(canGuess(round, "c")).toBe(false);
  });
});

describe("deadlines", () => {
  it("guessDeadlineMs is closesAt plus the grace, null without a deadline", () => {
    expect(guessDeadlineMs(stage())).toBe(CLOSES + ESTIMATE_GRACE_MS);
    expect(guessDeadlineMs(stage({ closesAt: null }))).toBeNull();
    expect(guessDeadlineMs(stage({ closesAt: "not a date" }))).toBeNull();
  });

  it("isStageTimedOut: the deadline instant itself is timed out, a millisecond before is not", () => {
    const deadline = CLOSES + ESTIMATE_GRACE_MS;
    expect(isStageTimedOut(stage(), deadline - 1)).toBe(false);
    expect(isStageTimedOut(stage(), deadline)).toBe(true);
    expect(isStageTimedOut(stage(), deadline + 3_600_000)).toBe(true);
    expect(isStageTimedOut(stage({ closesAt: null }), deadline + 1e12)).toBe(false);
    expect(isStageTimedOut(stage({ status: "revealed", reveal: reveal() }), deadline + 1e12)).toBe(
      false,
    );
  });

  it("absentContenders are the contenders without a locked guess, in contender order", () => {
    expect(absentContenders(stage())).toEqual(["b", "c"]);
    expect(absentContenders(stage({ submitted: ["c", "a", "b"] }))).toEqual([]);
    expect(absentContenders(stage({ submitted: [] }))).toEqual(["a", "b", "c"]);
    expect(absentContenders(stage({ submitted: ["zz"] }))).toEqual(["a", "b", "c"]);
  });

  it("nextCloseAction: wait, then last call once, then reveal", () => {
    const deadline = CLOSES + ESTIMATE_GRACE_MS;
    expect(nextCloseAction(stage(), deadline - 1)).toBe("wait");
    expect(nextCloseAction(stage(), deadline)).toBe("last-call");
    // The last call moved closesAt and set lastCallAt: still waiting before it, revealing after it.
    const lastCall = stage({
      lastCallAt: "2026-01-01T10:05:10.000Z",
      closesAt: "2026-01-01T10:07:10.000Z",
    });
    const lastDeadline = Date.parse("2026-01-01T10:07:10.000Z") + ESTIMATE_GRACE_MS;
    expect(nextCloseAction(lastCall, deadline)).toBe("wait");
    expect(nextCloseAction(lastCall, lastDeadline - 1)).toBe("wait");
    expect(nextCloseAction(lastCall, lastDeadline)).toBe("reveal");
    // Everybody answered but the stage is still open and late: nothing to call out, just reveal.
    expect(nextCloseAction(stage({ submitted: ["a", "b", "c"] }), deadline)).toBe("reveal");
    // No deadline (one phone) and a revealed stage never close by the clock.
    expect(nextCloseAction(stage({ closesAt: null }), deadline + 1e12)).toBe("wait");
    expect(nextCloseAction(stage({ status: "revealed", reveal: reveal() }), deadline + 1e12)).toBe(
      "wait",
    );
  });
});

describe("roundPayers / isEstimateDecided", () => {
  it("lists every stage's payers in booking order, then the lot's picks", () => {
    const stages = [
      stage({ status: "revealed", reveal: reveal({ payers: ["c", "a"], next: "stechen" }) }),
      stage({
        index: 1,
        kind: "stechen",
        status: "revealed",
        reveal: reveal({
          payers: ["d"],
          next: "shuffle",
          shuffled: ["f", "e"],
          lotPayers: ["f", "e"],
        }),
      }),
    ];
    expect(roundPayers(stages)).toEqual(["c", "a", "d", "f", "e"]);
    expect(roundPayers([stages[0]])).toEqual(["c", "a"]);
  });

  it("counts only revealed stages: an open stage adds nothing", () => {
    const stages = [
      stage({ status: "revealed", reveal: reveal({ payers: ["x"], next: "stechen" }) }),
      stage({ index: 1, kind: "stechen" }),
    ];
    expect(roundPayers(stages)).toEqual(["x"]);
    expect(roundPayers([])).toEqual([]);
  });

  it("is decided exactly when the last stage is revealed with next !== stechen", () => {
    const revealed = (next: EstimateReveal["next"]) =>
      stage({ status: "revealed", reveal: reveal({ next }) });
    expect(isEstimateDecided({ stages: [revealed("decided")] })).toBe(true);
    expect(isEstimateDecided({ stages: [revealed("shuffle")] })).toBe(true);
    expect(isEstimateDecided({ stages: [revealed("stechen")] })).toBe(false);
    expect(isEstimateDecided({ stages: [revealed("stechen"), stage({ index: 1 })] })).toBe(false);
    expect(isEstimateDecided({ stages: [stage()] })).toBe(false);
    expect(isEstimateDecided({ stages: [] })).toBe(false);
  });
});
