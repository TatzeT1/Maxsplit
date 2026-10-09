import { describe, expect, it } from "vitest";
import {
  ESTIMATE_BANK_FLOORS,
  validateEstimateBank,
  type EstimateBankProblem,
} from "@/lib/games/estimate-bank/validate";
import { CATEGORY_CODES, type EstimateQuestion } from "@/lib/games/estimate-bank/types";
import { ESTIMATE_FIXTURE_BANK, makeEstimateRow } from "@/test/estimate-bank-fixture";
import type { EstimateCategory } from "@/lib/types";

/** A fixed "today" so the `verified` rule never depends on the clock. */
const TODAY = "2026-06-15";

function problems(
  rows: readonly EstimateQuestion[],
  extra: { floors?: boolean; retiredIds?: string[] } = {},
) {
  return validateEstimateBank(rows, { floors: false, today: TODAY, ...extra });
}

function rulesOf(found: EstimateBankProblem[]): string[] {
  return found.map((problem) => problem.rule);
}

/** The rule a single broken row reports — exactly once, and nothing else. */
function expectOnly(row: EstimateQuestion, rule: string, extra = {}) {
  const found = problems([row], extra);
  expect(rulesOf(found), found.map((p) => p.message).join(" | ")).toEqual([rule]);
}

/** The rule shows up (a break that legitimately trips a second rule too). */
function expectIncludes(row: EstimateQuestion, rule: string) {
  const found = problems([row]);
  expect(rulesOf(found), found.map((p) => p.message).join(" | ")).toContain(rule);
}

describe("validateEstimateBank: the good rows", () => {
  it("accepts the whole synthetic fixture bank", () => {
    const found = problems(ESTIMATE_FIXTURE_BANK);
    expect(found, found.map((p) => `${p.id} ${p.rule}: ${p.message}`).join("\n")).toEqual([]);
  });

  it("accepts a good row of every scale and format", () => {
    const scalesAndFormats = new Set(
      ESTIMATE_FIXTURE_BANK.map((row) => `${row.scale}|${row.format}`),
    );
    expect([...scalesAndFormats].sort()).toEqual([
      "interval|quantity",
      "interval|year",
      "ratio|quantity",
    ]);
    for (const row of ESTIMATE_FIXTURE_BANK) expect(problems([row]), row.id).toEqual([]);
  });

  it("accepts the empty bank with the floors off, and reports the floors with them on", () => {
    expect(problems([])).toEqual([]);
    const floors = validateEstimateBank([], { today: TODAY });
    expect(floors.length).toBeGreaterThan(0);
    expect(new Set(rulesOf(floors))).toEqual(new Set(["floors"]));
  });
});

describe("id rules", () => {
  it.each([
    ["an unknown category code", "est-xyz-9001"],
    ["a short number", "est-geo-1"],
    ["a long number", "est-geo-90011"],
    ["no prefix", "geo-9001"],
    ["upper case", "EST-GEO-9001"],
    ["a space", "est-geo-9001 "],
  ])("id-format rejects %s", (_label, id) => {
    expectIncludes(makeEstimateRow({ id }), "id-format");
  });

  it("id-format rejects a code that does not match the category", () => {
    expectOnly(makeEstimateRow({ id: "est-nat-9001", category: "geography" }), "id-format");
  });

  it("id-format accepts the code of every category", () => {
    for (const [category, code] of Object.entries(CATEGORY_CODES)) {
      const row = makeEstimateRow({
        id: `est-${code}-9001`,
        category: category as EstimateCategory,
      });
      expect(rulesOf(problems([row])), category).not.toContain("id-format");
    }
  });

  it("id-unique reports the second use of an id", () => {
    const found = problems([makeEstimateRow(), makeEstimateRow()]);
    expect(rulesOf(found)).toEqual(["id-unique"]);
    expect(found[0].id).toBe("est-geo-9001");
  });

  it("id-retired rejects a retired id", () => {
    expectOnly(makeEstimateRow(), "id-retired", { retiredIds: ["est-geo-9001"] });
  });

  it("id-retired lets every other id through", () => {
    expect(problems([makeEstimateRow()], { retiredIds: ["est-geo-0001"] })).toEqual([]);
  });
});

describe("enums", () => {
  it.each([
    ["category", { category: "weather" }],
    ["tone", { tone: "spicy" }],
    ["scale", { scale: "log" }],
    ["format", { format: "decade" }],
  ])("rejects an unknown %s", (_field, override) => {
    expectIncludes(makeEstimateRow(override as unknown as Partial<EstimateQuestion>), "enums");
  });
});

describe("text", () => {
  const withText = (text: { de: string; en: string }) => makeEstimateRow({ text });
  const good = { de: "Wie hoch ist der Testberg?", en: "How high is Mount Test?" };

  it.each([
    ["no question mark (de)", { ...good, de: "Wie hoch ist der Testberg" }],
    ["no question mark (en)", { ...good, en: "How high is Mount Test" }],
    ["a lower-case start (en)", { ...good, en: "how high is Mount Test?" }],
    ["a lower-case start (de)", { ...good, de: "wie hoch ist der Testberg?" }],
    ["an empty text", { ...good, en: "" }],
    ["a whitespace-only text", { ...good, de: "   " }],
    ["leading whitespace", { ...good, en: " How high is Mount Test?" }],
    ["trailing whitespace", { ...good, de: "Wie hoch ist der Testberg? " }],
    ["a line break", { ...good, en: "How high\nis Mount Test?" }],
    ["more than 120 characters", { ...good, en: `How high is ${"very ".repeat(30)}Mount Test?` }],
    ["identical texts", { de: "Wie hoch ist der Testberg?", en: "Wie hoch ist der Testberg?" }],
  ])("rejects %s", (_label, text) => {
    expectOnly(withText(text), "text");
  });

  it("accepts exactly 120 characters", () => {
    const en = `H${"o".repeat(118)}?`;
    expect(en).toHaveLength(120);
    expect(rulesOf(problems([withText({ ...good, en })]))).toEqual([]);
  });
});

describe("unit", () => {
  const unit = (symbol: string) => ({ de: "Einheit", en: "unit", symbol });

  it("rejects a symbol that is not on the metric list", () => {
    expectIncludes(makeEstimateRow({ unit: unit("pc") }), "unit");
  });

  it("rejects an empty label", () => {
    expectOnly(makeEstimateRow({ unit: { de: "", en: "metres", symbol: "m" } }), "unit");
    expectOnly(makeEstimateRow({ unit: { de: "Meter", en: "  ", symbol: "m" } }), "unit");
  });

  it("rejects a year row with a unit symbol", () => {
    expectIncludes(
      makeEstimateRow({ scale: "interval", format: "year", unit: unit("m"), value: "1927" }),
      "unit",
    );
  });
});

describe("non-metric", () => {
  it.each([
    [
      "feet in the English text",
      { text: { de: "Wie hoch ist der Testberg?", en: "How many feet is Mount Test?" } },
    ],
    [
      "miles in the English text",
      { text: { de: "Wie hoch ist der Testberg?", en: "How many miles to Mount Test?" } },
    ],
    [
      "Meilen in the German text",
      { text: { de: "Wie viele Meilen bis zum Testberg?", en: "How high is Mount Test?" } },
    ],
    [
      "Fuß in the German text",
      { text: { de: "Wie viele Fuß hat der Testberg?", en: "How high is Mount Test?" } },
    ],
    ["pounds in the unit", { unit: { de: "Meter", en: "pounds", symbol: "m" } }],
    ["Zoll in the unit", { unit: { de: "Zoll", en: "metres", symbol: "m" } }],
    ["miles in the definition", { definition: "Distance measured in miles from the fake source." }],
    [
      "Fahrenheit in the definition",
      { definition: "Temperature as listed in degrees Fahrenheit." },
    ],
    ["°F in the definition", { definition: "A fake temperature of some °F reading, fixture." }],
  ])("rejects %s", (_label, override) => {
    expectOnly(makeEstimateRow(override as Partial<EstimateQuestion>), "non-metric");
  });

  it("does not trip over words that only contain a unit word", () => {
    const row = makeEstimateRow({
      text: {
        de: "Wie hoch ist der Fußballplatz-Testberg?",
        en: "How high is the Footprint Test Mount?",
      },
    });
    expect(rulesOf(problems([row]))).toEqual([]);
  });
});

describe("decimals", () => {
  it.each([
    ["an exponent", "1e3"],
    ["a decimal comma", "1,5"],
    ["four decimals", "1.2345"],
    ["a sign", "-5"],
    ["14 integer digits", "12345678901234"],
    ["13 digits above the maximum", "1000000000001"],
    ["nothing", ""],
  ])("rejects a value with %s", (_label, value) => {
    expectIncludes(makeEstimateRow({ value }), "decimals");
  });

  it("accepts a value at the very cap with its class (counts to 10^12)", () => {
    const row = makeEstimateRow({
      unit: { de: "Einwohner", en: "inhabitants", symbol: "" },
      value: "100000000000",
    });
    expect(rulesOf(problems([row]))).toEqual([]);
  });

  it.each([
    ["not a number", "abc"],
    ["two decimals on a ratio row", "1.25"],
    ["three digits on a ratio row", "123"],
    ["a comma", "2,5"],
  ])("rejects a ratio tolerance that is %s", (_label, tolerance) => {
    expectOnly(makeEstimateRow({ tolerance }), "decimals");
  });

  it("rejects an interval tolerance that is not a decimal", () => {
    const row = makeEstimateRow({
      scale: "interval",
      unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
      value: "660",
      tolerance: "x",
    });
    expectOnly(row, "decimals");
  });

  it("accepts a ratio tolerance of one decimal", () => {
    expect(rulesOf(problems([makeEstimateRow({ tolerance: "0.5" })]))).toEqual([]);
  });
});

describe("bounds-class", () => {
  const celsius = (value: string) =>
    makeEstimateRow({
      scale: "interval",
      unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
      value,
    });

  it("rejects a unit class that has no entry (an interval row in metres)", () => {
    expectOnly(makeEstimateRow({ scale: "interval" }), "bounds-class");
  });

  it("rejects a value above the class range", () => {
    expectOnly(makeEstimateRow({ value: "20000000" }), "bounds-class");
  });

  it("rejects a ratio value less than a factor of 10 inside the class range", () => {
    expectOnly(makeEstimateRow({ value: "0.005" }), "bounds-class");
    expectOnly(makeEstimateRow({ value: "5000000" }), "bounds-class");
  });

  it("accepts a ratio value exactly a factor of 10 inside", () => {
    expect(rulesOf(problems([makeEstimateRow({ value: "0.01" })]))).toEqual([]);
    expect(rulesOf(problems([makeEstimateRow({ value: "1000000" })]))).toEqual([]);
  });

  it("rejects an interval value within 2 % of the class range of an edge", () => {
    expectOnly(celsius("5"), "bounds-class"); // 2 % of 10 000 is 200
    expectOnly(celsius("9900"), "bounds-class");
    expectOnly(celsius("0"), "bounds-class"); // the edge itself
  });

  it("accepts an interval value just beyond that margin", () => {
    expect(rulesOf(problems([celsius("200")]))).toEqual([]);
    expect(rulesOf(problems([celsius("9800")]))).toEqual([]);
  });

  it("applies the same margin to percentages and years", () => {
    const percent = (value: string) =>
      makeEstimateRow({
        scale: "interval",
        unit: { de: "Prozent", en: "percent", symbol: "%" },
        value,
      });
    expectOnly(percent("1"), "bounds-class");
    expectOnly(percent("99"), "bounds-class");
    expect(rulesOf(problems([percent("2")]))).toEqual([]);
    const year = (value: string) =>
      makeEstimateRow({
        scale: "interval",
        format: "year",
        unit: { de: "Jahr", en: "year", symbol: "" },
        value,
      });
    expectOnly(year("30"), "bounds-class"); // 2 % of 2 100 is 42
    expect(rulesOf(problems([year("1927")]))).toEqual([]);
  });
});

describe("ratio-positive", () => {
  it("rejects a ratio value of zero, once", () => {
    expectOnly(makeEstimateRow({ value: "0" }), "ratio-positive");
  });

  it("is not about interval rows (zero is for them)", () => {
    const row = makeEstimateRow({
      scale: "interval",
      unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
      value: "0",
    });
    expect(rulesOf(problems([row]))).not.toContain("ratio-positive");
  });
});

describe("year", () => {
  const year = (override: Partial<EstimateQuestion>) =>
    makeEstimateRow({
      scale: "interval",
      format: "year",
      unit: { de: "Jahr", en: "year", symbol: "" },
      value: "1927",
      ...override,
    });

  it("accepts a whole year", () => {
    expect(rulesOf(problems([year({})]))).toEqual([]);
  });

  it("rejects a year row with scale ratio", () => {
    expectIncludes(year({ scale: "ratio" }), "year");
  });

  it("rejects a year with decimals", () => {
    expectOnly(year({ value: "1969.5" }), "year");
  });
});

describe("tolerance", () => {
  const celsius = (tolerance: string, value = "660") =>
    makeEstimateRow({
      scale: "interval",
      unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
      value,
      tolerance,
    });
  const year = (tolerance: string) =>
    makeEstimateRow({
      scale: "interval",
      format: "year",
      unit: { de: "Jahr", en: "year", symbol: "" },
      value: "1927",
      tolerance,
    });

  it("rejects a ratio tolerance above 5 %", () => {
    expectOnly(makeEstimateRow({ tolerance: "6" }), "tolerance");
    expect(rulesOf(problems([makeEstimateRow({ tolerance: "5" })]))).toEqual([]);
  });

  it("rejects a tolerance of zero (leave it out for none)", () => {
    expectOnly(makeEstimateRow({ tolerance: "0" }), "tolerance");
  });

  it("rejects an interval tolerance above 2 % of the value", () => {
    expectOnly(celsius("14"), "tolerance"); // 2 % of 660 is 13.2
    expect(rulesOf(problems([celsius("13")]))).toEqual([]);
  });

  it("rejects an interval tolerance above 1 % of the class range", () => {
    expectOnly(celsius("101", "9000"), "tolerance"); // 1 % of 10 000 is 100; 2 % of 9 000 is 180
    expect(rulesOf(problems([celsius("100", "9000")]))).toEqual([]);
  });

  it("rejects a year tolerance above 2 years (a +-100 year band would tie nearly every pair)", () => {
    expectOnly(year("3"), "tolerance");
    expectIncludes(year("100"), "tolerance");
    expect(rulesOf(problems([year("2")]))).toEqual([]);
    expect(rulesOf(problems([year("1")]))).toEqual([]);
  });
});

describe("answer-not-in-text", () => {
  it.each([
    [
      "the plain number (de)",
      { de: "Hat der Testberg 1234 Meter?", en: "How high is Mount Test?" },
    ],
    ["a de-grouped number", { de: "Sind es 1.234 Meter?", en: "How high is Mount Test?" }],
    [
      "an en-grouped number",
      { de: "Wie hoch ist der Testberg?", en: "Is Mount Test 1,234 metres high?" },
    ],
    ["a spaced number", { de: "Sind es 1 234 Meter?", en: "How high is Mount Test?" }],
    ["the number in the English text", { de: "Wie hoch ist der Testberg?", en: "Is it 1234 m?" }],
  ])("rejects %s", (_label, text) => {
    expectOnly(makeEstimateRow({ text }), "answer-not-in-text");
  });

  it("rejects the integer part of a non-integer answer", () => {
    const row = makeEstimateRow({
      unit: { de: "Kilogramm", en: "kilograms", symbol: "kg" },
      value: "42.5",
      text: { de: "Wiegt der Teststein 42 Kilogramm?", en: "How heavy is a typical test rock?" },
    });
    expectOnly(row, "answer-not-in-text");
  });

  it("rejects a decimal answer written with a decimal comma", () => {
    const row = makeEstimateRow({
      unit: { de: "Kilogramm", en: "kilograms", symbol: "kg" },
      value: "42.5",
      text: { de: "Wiegt der Teststein 42,5 Kilogramm?", en: "How heavy is a typical test rock?" },
    });
    expectOnly(row, "answer-not-in-text");
  });

  it("lets an unrelated number stand", () => {
    const row = makeEstimateRow({
      text: {
        de: "Wie hoch ist der Testberg (Stand 2024)?",
        en: "How high is Mount Test (as of 2024)?",
      },
    });
    expect(rulesOf(problems([row]))).toEqual([]);
  });

  it("does not flag a number that merely starts like the answer", () => {
    const row = makeEstimateRow({
      text: { de: "Wie hoch ist der Testberg (Stand 12345)?", en: "How high is Mount Test?" },
    });
    expect(rulesOf(problems([row]))).toEqual([]);
  });
});

describe("definition", () => {
  it("rejects a definition under 20 characters", () => {
    expectOnly(makeEstimateRow({ definition: "Too short." }), "definition");
  });

  it("rejects an empty definition", () => {
    expectOnly(makeEstimateRow({ definition: "   " }), "definition");
  });

  it("rejects a definition that spells out the value", () => {
    expectOnly(
      makeEstimateRow({
        definition: "Height of the fictional Mount Test: 1234 above its base, fixture.",
      }),
      "definition",
    );
  });

  it("accepts exactly 20 characters", () => {
    const definition = "x".repeat(20);
    expect(rulesOf(problems([makeEstimateRow({ definition })]))).toEqual([]);
  });
});

describe("asOf", () => {
  it.each([1899, 2101, 2024.5, Number.NaN])("rejects %s", (asOf) => {
    expectOnly(makeEstimateRow({ asOf }), "asOf");
  });

  it.each([1900, 2024, 2100])("accepts %s", (asOf) => {
    expect(rulesOf(problems([makeEstimateRow({ asOf })]))).toEqual([]);
  });
});

describe("sources", () => {
  const primary = {
    label: "Authority (fake)",
    url: "https://example.org/a",
    kind: "primary" as const,
  };
  const secondary = {
    label: "Reference (fake)",
    url: "https://example.com/b",
    kind: "secondary" as const,
  };

  it("rejects a single source", () => {
    expectOnly(makeEstimateRow({ sources: [primary] }), "sources");
  });

  it("rejects a bank row without a primary source", () => {
    expectOnly(
      makeEstimateRow({ sources: [secondary, { ...secondary, url: "https://example.net/c" }] }),
      "sources",
    );
  });

  it("rejects two sources from one hostname", () => {
    expectOnly(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "https://example.org/other" }] }),
      "sources",
    );
  });

  it("does not count www. as a second hostname", () => {
    expectOnly(
      makeEstimateRow({
        sources: [primary, { ...secondary, url: "https://www.example.org/other" }],
      }),
      "sources",
    );
  });

  it("rejects a plain http URL", () => {
    expectOnly(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "http://example.com/b" }] }),
      "sources",
    );
  });

  it("rejects a hostname without a dot", () => {
    expectIncludes(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "https://localhost/b" }] }),
      "sources",
    );
  });

  it("rejects a URL that does not parse", () => {
    expectIncludes(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "not a url" }] }),
      "sources",
    );
    expectIncludes(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "https://" }] }),
      "sources",
    );
  });

  it("rejects whitespace in a URL", () => {
    expectIncludes(
      makeEstimateRow({ sources: [primary, { ...secondary, url: "https://example.com/a b" }] }),
      "sources",
    );
  });

  it("rejects the same URL twice", () => {
    expectIncludes(
      makeEstimateRow({
        sources: [primary, secondary, { ...primary, kind: "secondary" }],
      }),
      "sources",
    );
  });

  it("rejects a label that is too short or too long", () => {
    expectOnly(makeEstimateRow({ sources: [{ ...primary, label: "x" }, secondary] }), "sources");
    expectOnly(
      makeEstimateRow({ sources: [{ ...primary, label: "x".repeat(81) }, secondary] }),
      "sources",
    );
  });

  it("rejects an unknown kind", () => {
    expectIncludes(
      makeEstimateRow({ sources: [primary, { ...secondary, kind: "tertiary" as never }] }),
      "sources",
    );
  });
});

describe("verified", () => {
  const verified = (by: string, on: string) => makeEstimateRow({ verified: { by, on } });

  it("accepts a real, attributable claim", () => {
    expect(rulesOf(problems([verified("Max T.", "2026-03-01")]))).toEqual([]);
    expect(rulesOf(problems([verified("Max T.", "2026-01-01")]))).toEqual([]);
    expect(rulesOf(problems([verified("Max T.", TODAY)]))).toEqual([]);
  });

  it("rejects a name that is too short or too long", () => {
    expectOnly(verified("M", "2026-03-01"), "verified");
    expectOnly(verified("x".repeat(41), "2026-03-01"), "verified");
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    expectOnly(verified("Max T.", "02.03.2026"), "verified");
    expectOnly(verified("Max T.", "2026-3-1"), "verified");
  });

  it("rejects a date that does not exist", () => {
    expectOnly(verified("Max T.", "2026-02-30"), "verified");
    expectOnly(verified("Max T.", "2026-13-01"), "verified");
  });

  it("rejects a date before the bank process started", () => {
    expectOnly(verified("Max T.", "2025-12-31"), "verified");
  });

  it("rejects a date in the future", () => {
    expectOnly(verified("Max T.", "2026-06-16"), "verified");
  });

  it("rejects a missing claim", () => {
    expectOnly(makeEstimateRow({ verified: undefined as never }), "verified");
  });
});

describe("tone-category", () => {
  it.each(["animals", "body", "everyday", "food"] as const)(
    "allows a fun row in %s",
    (category) => {
      const row = makeEstimateRow({
        id: `est-${CATEGORY_CODES[category]}-9001`,
        category,
        tone: "fun",
      });
      expect(rulesOf(problems([row]))).toEqual([]);
    },
  );

  it.each(["geography", "space", "history", "sport"] as const)(
    "rejects a fun row in %s",
    (category) => {
      const row = makeEstimateRow({
        id: `est-${CATEGORY_CODES[category]}-9001`,
        category,
        tone: "fun",
      });
      expectOnly(row, "tone-category");
    },
  );
});

describe("blocklist", () => {
  const withText = (de: string, en: string) => makeEstimateRow({ text: { de, en } });
  const E = "How high is Mount Test?";
  const D = "Wie hoch ist der Testberg?";

  it("blocks a question about people dying (de)", () => {
    expectOnly(withText("Wie viele Menschen starben am Testberg?", E), "blocklist");
  });

  it("blocks death words (en)", () => {
    expectOnly(withText(D, "How many people died on Mount Test?"), "blocklist");
    expectOnly(withText(D, "How many casualties did Mount Test see?"), "blocklist");
  });

  it("blocks a disaster (de and en)", () => {
    expectOnly(withText("Wie stark war das Erdbeben am Testberg?", E), "blocklist");
    expectOnly(withText(D, "How big was the earthquake near Mount Test?"), "blocklist");
  });

  it("blocks a person-attribute row (de and en)", () => {
    expectOnly(withText("Wie viel Gehalt hat der Testpräsident?", E), "blocklist");
    expectOnly(withText("Wie hoch ist der Testberg des Präsident?", E), "blocklist");
    expectOnly(withText(D, "How old is the president of Test City?"), "blocklist");
    expectOnly(withText(D, "How tall is the test player?"), "blocklist");
  });

  it("scans the definition, the note and the English unit label as English", () => {
    expectOnly(
      makeEstimateRow({ definition: "Height of the mountain where the war memorial stands." }),
      "blocklist",
    );
    expectOnly(
      makeEstimateRow({ note: "Some sources count the victims differently." }),
      "blocklist",
    );
    expectOnly(
      makeEstimateRow({ unit: { de: "Meter", en: "age metres", symbol: "m" } }),
      "blocklist",
    );
  });

  it("scans the German unit label as German", () => {
    expectOnly(makeEstimateRow({ unit: { de: "Opfer", en: "metres", symbol: "m" } }), "blocklist");
  });

  it('allows the Dead Sea as a proper noun: "Totes Meer", "Toten Meer", "das Tote Meer", "Dead Sea"', () => {
    for (const de of [
      "Wie salzig ist das Totes Meer-Testbecken?",
      "Wie lang ist das Ufer am Toten Meer?",
      "Wie tief ist das Tote Meer?",
      "Wie hoch ist der Testberg am TOTEN MEER?",
    ]) {
      expect(rulesOf(problems([withText(de, E)])), de).not.toContain("blocklist");
    }
    expect(rulesOf(problems([withText(D, "How low is the shore of the Dead Sea?")]))).not.toContain(
      "blocklist",
    );
  });

  it("keeps the allowed list closed: the word alone is still blocked", () => {
    expectOnly(withText("Wie viele Tote gab es am Testberg?", E), "blocklist");
    expectOnly(withText("Wie salzig ist das Tote Meer, wo ein Toter schwimmt?", E), "blocklist");
  });

  it("allows the legitimate words the list deliberately leaves out", () => {
    const row = withText(
      "Wie viele Einwohner hat die Teststadt, und wie viele Menschen passen hinein?",
      "How many inhabitants and people does Test City have?",
    );
    expect(rulesOf(problems([row]))).toEqual([]);
  });

  it("matches whole words only, with umlaut-aware boundaries", () => {
    // "Stoß" contains "tot"? no; "Totem" and "Totenkopf" are not the word "tot"/"toten".
    expect(rulesOf(problems([withText("Wie hoch ist der Totempfahl am Testberg?", E)]))).toEqual(
      [],
    );
    expect(rulesOf(problems([withText(D, "How high is the Warsaw Test Tower?")]))).toEqual([]);
    expect(rulesOf(problems([withText("Wie schwer ist die Alterungsprobe?", E)]))).toEqual([]);
  });

  it("is case-insensitive", () => {
    expectOnly(withText("WIE VIELE MENSCHEN STARBEN AM TESTBERG?", E), "blocklist");
  });
});

describe("floors", () => {
  const CODES = Object.entries(CATEGORY_CODES) as [EstimateCategory, string][];
  const FUN_CATEGORIES = new Set<EstimateCategory>(["animals", "body", "everyday", "food"]);

  function generated(
    count: number,
    tone: "standard" | "fun",
    startNumber: number,
    overrides: (index: number) => Partial<EstimateQuestion> = () => ({}),
  ) {
    const categories = CODES.filter(
      ([category]) => tone === "standard" || FUN_CATEGORIES.has(category),
    );
    return Array.from({ length: count }, (_, index) => {
      const [category, code] = categories[index % categories.length];
      const interval = index % 2 === 1;
      return makeEstimateRow({
        id: `est-${code}-${String(startNumber + index).padStart(4, "0")}`,
        category,
        tone,
        ...(interval
          ? {
              scale: "interval" as const,
              unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
              value: "660",
            }
          : {}),
        ...overrides(index),
      });
    });
  }

  const standard = generated(108, "standard", 1000);
  const fun = generated(32, "fun", 2000);
  const bank = [...standard, ...fun];
  const check = (rows: readonly EstimateQuestion[]) =>
    validateEstimateBank(rows, { floors: true, today: TODAY });

  it("is quiet for a bank that meets every floor", () => {
    const found = check(bank);
    expect(found, found.map((p) => p.message).join(" | ")).toEqual([]);
  });

  it("does not run without the floors option being on", () => {
    expect(validateEstimateBank(bank.slice(0, 5), { floors: false, today: TODAY })).toEqual([]);
    expect(rulesOf(validateEstimateBank(bank.slice(0, 5), { today: TODAY }))).toContain("floors");
  });

  it("asks for at least 100 standard rows", () => {
    const found = check([...standard.slice(0, 96), ...fun]);
    expect(
      found.some((p) => p.rule === "floors" && /standard rows, at least 100/.test(p.message)),
    ).toBe(true);
  });

  it("asks for at least 30 fun rows", () => {
    const found = check([...standard, ...fun.slice(0, 29)]);
    expect(found.some((p) => p.rule === "floors" && /fun rows, at least 30/.test(p.message))).toBe(
      true,
    );
  });

  it("asks for at least 25 % of each scale", () => {
    const allRatio = bank.map((row) =>
      makeEstimateRow({ ...row, scale: "ratio", unit: { de: "Meter", en: "metres", symbol: "m" } }),
    );
    const found = check(allRatio);
    expect(found.some((p) => p.rule === "floors" && /interval rows/.test(p.message))).toBe(true);
  });

  it("asks for at least 8 standard rows per category", () => {
    const fewer = standard
      .filter((row) => row.category !== "space")
      .concat(standard.filter((row) => row.category === "space").slice(0, 7));
    const found = check([...fewer, ...fun]);
    expect(found.some((p) => p.rule === "floors" && /in space/.test(p.message))).toBe(true);
  });

  it("allows at most 15 % of the rows to carry a tolerance", () => {
    const tolerant = bank.map((row, index) => (index % 5 === 0 ? { ...row, tolerance: "1" } : row));
    // every fifth row is 20 %; rows that are interval rows (°C) take a tolerance of 1 as well
    const found = check(tolerant);
    expect(found.some((p) => p.rule === "floors" && /tolerance/.test(p.message))).toBe(true);
    const fewTolerant = bank.map((row, index) =>
      index % 10 === 0 ? { ...row, tolerance: "1" } : row,
    );
    expect(check(fewTolerant)).toEqual([]);
  });

  it("counts only rows with an attributable verification", () => {
    const unverified = standard.map((row, index) =>
      index < 20 ? { ...row, verified: { by: "x", on: "2026-01-02" } } : row,
    );
    const found = check([...unverified, ...fun]);
    expect(
      found.some((p) => p.rule === "floors" && /standard rows, at least 100/.test(p.message)),
    ).toBe(true);
  });

  it("publishes its thresholds", () => {
    expect(ESTIMATE_BANK_FLOORS).toMatchObject({ standard: 100, fun: 30, perCategory: 8 });
  });
});
