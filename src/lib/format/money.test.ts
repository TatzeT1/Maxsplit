import { describe, expect, it } from "vitest";
import { formatMoney } from "./money";

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
