import { describe, expect, it } from "vitest";
import { formatMoney, minorToMajor, parseMoneyInput } from "./money";

// Intl inserts a non-breaking space (U+00A0) between amount and currency symbol.
const NBSP = " ";

describe("formatMoney", () => {
  it("formats EUR minor units with German grouping and decimal separators", () => {
    expect(formatMoney(123456, "EUR")).toBe(`1.234,56${NBSP}€`);
  });

  it("formats zero", () => {
    expect(formatMoney(0, "EUR")).toBe(`0,00${NBSP}€`);
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-1250, "EUR")).toBe(`-12,50${NBSP}€`);
  });

  it("respects currencies with no minor unit exponent", () => {
    expect(formatMoney(1234, "JPY")).toBe(`1.234${NBSP}¥`);
  });
});

describe("parseMoneyInput", () => {
  it("parses a simple comma-decimal amount", () => {
    expect(parseMoneyInput("12,50")).toBe(1250);
  });

  it("parses an amount with a thousands separator", () => {
    expect(parseMoneyInput("1.234,56")).toBe(123456);
  });

  it("parses a whole-number amount with no decimals", () => {
    expect(parseMoneyInput("12")).toBe(1200);
  });

  it("parses a single decimal digit as tenths", () => {
    expect(parseMoneyInput("12,5")).toBe(1250);
  });

  it("returns null for non-numeric input", () => {
    expect(parseMoneyInput("abc")).toBeNull();
  });

  it("returns null for more than two decimal digits", () => {
    expect(parseMoneyInput("12,555")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(parseMoneyInput("  ")).toBeNull();
  });
});

describe("minorToMajor", () => {
  it("converts EUR cents to euros", () => {
    expect(minorToMajor(2550, "EUR")).toBe(25.5);
  });

  it("respects currencies with no minor unit exponent", () => {
    expect(minorToMajor(1234, "JPY")).toBe(1234);
  });
});
