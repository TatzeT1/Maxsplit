import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translate";
import { estimateErrorLabel, estimateExampleNumber, formatAnswerTime } from "./estimate-format";

const de = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate("de", key, vars);
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate("en", key, vars);

describe("estimateErrorLabel", () => {
  it("maps every structured error to words", () => {
    expect(estimateErrorLabel(de, { kind: "exact" })).toBe("Genau richtig!");
    expect(estimateErrorLabel(de, { kind: "factor", direction: "high", factor: "2,5" })).toBe(
      "Faktor 2,5 zu hoch",
    );
    expect(estimateErrorLabel(de, { kind: "factor", direction: "low", factor: "2,5" })).toBe(
      "Faktor 2,5 zu niedrig",
    );
    expect(estimateErrorLabel(de, { kind: "percent", direction: "low", percent: "0,4 %" })).toBe(
      "0,4 % zu niedrig",
    );
    expect(
      estimateErrorLabel(de, {
        kind: "interval",
        direction: "high",
        amount: "17 m",
        isYear: false,
      }),
    ).toBe("17 m zu hoch");
  });

  it("adds the unit word to a year amount, singular and plural", () => {
    expect(
      estimateErrorLabel(de, { kind: "interval", direction: "low", amount: "1", isYear: true }),
    ).toBe("1 Jahr zu niedrig");
    expect(
      estimateErrorLabel(de, { kind: "interval", direction: "low", amount: "6", isYear: true }),
    ).toBe("6 Jahre zu niedrig");
    expect(
      estimateErrorLabel(en, { kind: "interval", direction: "high", amount: "6", isYear: true }),
    ).toBe("6 years too high");
  });

  it("prints the exact fraction as a factor when decimals cannot tell two errors apart", () => {
    expect(
      estimateErrorLabel(de, { kind: "fraction", direction: "high", hi: "10.001", lo: "7.000" }),
    ).toBe("Faktor 10.001/7.000 zu hoch");
  });
});

describe("formatAnswerTime", () => {
  it("counts seconds below a minute and minutes:seconds from there", () => {
    expect(formatAnswerTime(0)).toBe("0 s");
    expect(formatAnswerTime(12_400)).toBe("12 s");
    expect(formatAnswerTime(59_600)).toBe("1:00");
    expect(formatAnswerTime(125_000)).toBe("2:05");
    expect(formatAnswerTime(-5)).toBe("0 s");
  });
});

describe("estimateExampleNumber", () => {
  it("is the locale's own marks", () => {
    expect(estimateExampleNumber("de")).toBe("1.234,5");
    expect(estimateExampleNumber("en")).toBe("1,234.5");
  });
});
