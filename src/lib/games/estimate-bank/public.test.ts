import { describe, expect, it } from "vitest";
import {
  decimalToMilli,
  estimateBoundsFor,
  estimateClassKey,
  rowTolerance,
  rowTruthMilli,
  toPublicQuestion,
} from "@/lib/games/estimate-bank/public";
import {
  ESTIMATE_BOUNDS,
  ESTIMATE_CATEGORIES,
  ESTIMATE_UNIT_SYMBOLS,
  type EstimateQuestion,
} from "@/lib/games/estimate-bank/types";
import { ESTIMATE_MAX_MILLI } from "@/lib/games/estimate-input";
import {
  ESTIMATE_FIXTURE_BANK,
  estimateFixtureRow,
  makeEstimateRow,
} from "@/test/estimate-bank-fixture";

describe("decimalToMilli", () => {
  it.each([
    ["8848.86", 8_848_860],
    ["0.5", 500],
    ["2962", 2_962_000],
    ["0", 0],
    ["0.001", 1],
    ["7.1", 7_100],
    ["12.34", 12_340],
    ["01.5", 1_500],
    ["1000000000000", ESTIMATE_MAX_MILLI],
    ["9999999999.999", 9_999_999_999_999],
  ])("reads %s exactly as %i", (value, expected) => {
    expect(decimalToMilli(value)).toBe(expected);
  });

  it("never goes through a float: 0.1 + 0.2 style literals stay exact", () => {
    expect(decimalToMilli("0.3")).toBe(300);
    expect(decimalToMilli("1.005")).toBe(1_005);
    expect(decimalToMilli("4.35")).toBe(4_350);
  });

  it.each([
    ["an exponent", "1e3"],
    ["a decimal comma", "1,5"],
    ["four decimals", "01.1234"],
    ["empty", ""],
    ["a sign", "-1"],
    ["a plus sign", "+1"],
    ["a trailing point", "1."],
    ["a leading point", ".5"],
    ["a space", " 1"],
    ["a trailing space", "1 "],
    ["letters", "abc"],
    ["fourteen integer digits", "12345678901234"],
    ["a thirteen digit value above the maximum", "1000000000001"],
    ["the largest thirteen digit value", "9999999999999"],
  ])("throws on %s", (_label, value) => {
    expect(() => decimalToMilli(value)).toThrow(RangeError);
  });

  it("throws on a value that is not a string", () => {
    expect(() => decimalToMilli(5 as unknown as string)).toThrow(RangeError);
    expect(() => decimalToMilli(undefined as unknown as string)).toThrow(RangeError);
  });
});

describe("ESTIMATE_BOUNDS", () => {
  const entries = Object.entries(ESTIMATE_BOUNDS);

  it("keys every class `symbol|scale|format` with a known symbol", () => {
    for (const [key] of entries) {
      const [symbol, scale, format, ...rest] = key.split("|");
      expect(rest).toEqual([]);
      expect(ESTIMATE_UNIT_SYMBOLS as readonly string[]).toContain(symbol);
      expect(["ratio", "interval"]).toContain(scale);
      expect(["quantity", "year"]).toContain(format);
    }
  });

  it("has bounds that fit the milli grid and the cap, min below max", () => {
    for (const [key, { min, max }] of entries) {
      const minMilli = decimalToMilli(min);
      const maxMilli = decimalToMilli(max);
      expect(minMilli, key).toBeLessThan(maxMilli);
      expect(maxMilli, key).toBeLessThanOrEqual(ESTIMATE_MAX_MILLI);
    }
  });

  it("gives every ratio class a floor above zero (zero is for interval rows only)", () => {
    for (const [key, { min }] of entries) {
      if (key.includes("|ratio|")) expect(decimalToMilli(min), key).toBeGreaterThan(0);
    }
  });

  it("covers every unit symbol the validator allows", () => {
    const covered = new Set(entries.map(([key]) => key.split("|")[0]));
    for (const symbol of ESTIMATE_UNIT_SYMBOLS) expect(covered, symbol).toContain(symbol);
  });

  it("allows interval rows only for a temperature, a percentage and a year", () => {
    const intervals = entries.map(([key]) => key).filter((key) => key.includes("|interval|"));
    expect(intervals.sort()).toEqual(
      ["%|interval|quantity", "°C|interval|quantity", "|interval|year"].sort(),
    );
  });
});

describe("estimateBoundsFor", () => {
  it("looks the class up in the closed table", () => {
    expect(estimateBoundsFor(estimateFixtureRow("est-geo-9001"))).toEqual({
      minMilli: 1,
      maxMilli: 10_000_000_000,
    });
    expect(estimateBoundsFor(estimateFixtureRow("est-his-9006"))).toEqual({
      minMilli: 0,
      maxMilli: 2_100_000,
    });
    expect(estimateBoundsFor(estimateFixtureRow("est-geo-9003"))).toEqual({
      minMilli: 1_000,
      maxMilli: ESTIMATE_MAX_MILLI,
    });
  });

  it("throws on a class without an entry (an interval row in metres)", () => {
    const row = makeEstimateRow({ scale: "interval" });
    expect(() => estimateBoundsFor(row)).toThrow(RangeError);
  });

  it("does not follow the prototype chain for a hostile unit symbol", () => {
    const row = makeEstimateRow({ unit: { de: "x", en: "x", symbol: "constructor" } });
    expect(() => estimateBoundsFor(row)).toThrow(RangeError);
    const proto = makeEstimateRow({ unit: { de: "x", en: "x", symbol: "__proto__" } });
    expect(() => estimateBoundsFor(proto)).toThrow(RangeError);
  });

  it("builds the class key from symbol, scale and format", () => {
    expect(estimateClassKey(estimateFixtureRow("est-geo-9001"))).toBe("m|ratio|quantity");
    expect(estimateClassKey(estimateFixtureRow("est-his-9006"))).toBe("|interval|year");
  });
});

describe("rowTruthMilli", () => {
  it("reads the value exactly", () => {
    expect(rowTruthMilli(estimateFixtureRow("est-nat-9004"))).toBe(42_500);
    expect(rowTruthMilli(estimateFixtureRow("est-geo-9001"))).toBe(1_234_000);
  });
});

describe("rowTolerance", () => {
  it("is null for a row without a tolerance", () => {
    expect(rowTolerance(estimateFixtureRow("est-geo-9001"))).toBeNull();
  });

  it("turns a ratio tolerance (percent) into permille", () => {
    expect(rowTolerance(makeEstimateRow({ tolerance: "0.1" }))).toEqual({
      kind: "ratio",
      permille: 1,
    });
    expect(rowTolerance(makeEstimateRow({ tolerance: "2" }))).toEqual({
      kind: "ratio",
      permille: 20,
    });
    expect(rowTolerance(makeEstimateRow({ tolerance: "5" }))).toEqual({
      kind: "ratio",
      permille: 50,
    });
    expect(rowTolerance(estimateFixtureRow("est-geo-9002"))).toEqual({
      kind: "ratio",
      permille: 20,
    });
  });

  it("keeps an interval tolerance absolute, in milli", () => {
    const year = estimateFixtureRow("est-his-9007");
    expect(rowTolerance(year)).toEqual({ kind: "interval", milli: 1_000 });
    const celsius = estimateFixtureRow("est-sci-9005");
    expect(rowTolerance({ ...celsius, tolerance: "0.5" })).toEqual({
      kind: "interval",
      milli: 500,
    });
  });

  it("refuses a ratio tolerance finer than one permille instead of rounding", () => {
    expect(() => rowTolerance(makeEstimateRow({ tolerance: "0.15" }))).toThrow(RangeError);
  });
});

const PUBLIC_KEYS = ["bounds", "category", "format", "id", "scale", "text", "tone", "unit"];

describe("toPublicQuestion", () => {
  it("has EXACTLY the whitelisted keys for every fixture row", () => {
    for (const row of ESTIMATE_FIXTURE_BANK) {
      expect(Object.keys(toPublicQuestion(row)).sort(), row.id).toEqual(PUBLIC_KEYS);
    }
  });

  it("leaks none of the secret field names", () => {
    for (const row of ESTIMATE_FIXTURE_BANK) {
      const json = JSON.stringify(toPublicQuestion(row));
      for (const secret of [
        "value",
        "tolerance",
        "definition",
        "sources",
        "asOf",
        "note",
        "verified",
      ]) {
        expect(json, `${row.id} / ${secret}`).not.toContain(secret);
      }
      expect(json).not.toContain(row.definition);
    }
  });

  it("copies field by field, so a stray property of a row never travels with it", () => {
    const row = {
      ...estimateFixtureRow("est-geo-9001"),
      secret: "do not ship",
      unit: { de: "Meter", en: "metres", symbol: "m", leak: "x" },
      text: { de: "Wie hoch ist der Testberg?", en: "How high is Mount Test?", leak: "y" },
    } as unknown as EstimateQuestion;
    const publicQuestion = toPublicQuestion(row);
    expect(JSON.stringify(publicQuestion)).not.toContain("do not ship");
    expect(JSON.stringify(publicQuestion)).not.toContain('"leak"');
    expect(publicQuestion.unit).toEqual({ de: "Meter", en: "metres", symbol: "m" });
    expect(publicQuestion.text).not.toBe(row.text);
  });

  it("carries the class bounds, in milli", () => {
    expect(toPublicQuestion(estimateFixtureRow("est-geo-9001")).bounds).toEqual({
      minMilli: 1,
      maxMilli: 10_000_000_000,
    });
  });

  it("exposes identical public bounds for all rows with the same class key", () => {
    const byClass = new Map<string, string>();
    for (const row of ESTIMATE_FIXTURE_BANK) {
      const key = estimateClassKey(row);
      const bounds = JSON.stringify(toPublicQuestion(row).bounds);
      expect(byClass.get(key) ?? bounds, row.id).toBe(bounds);
      byClass.set(key, bounds);
    }
    expect(byClass.size).toBeGreaterThan(5);
  });

  it("does not let the value shape the bounds", () => {
    const small = toPublicQuestion(makeEstimateRow({ value: "10" })).bounds;
    const large = toPublicQuestion(makeEstimateRow({ value: "9000000" })).bounds;
    expect(small).toEqual(large);
  });

  it("covers every category in the fixture or leaves it to the real bank (sanity: the list is complete)", () => {
    expect(ESTIMATE_CATEGORIES).toHaveLength(12);
    const used = new Set(ESTIMATE_FIXTURE_BANK.map((row) => row.category));
    expect(used.size).toBeGreaterThanOrEqual(10);
  });
});
