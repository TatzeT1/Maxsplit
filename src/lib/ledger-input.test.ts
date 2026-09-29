import { describe, expect, it } from "vitest";
import { isSupportedCurrency, SUPPORTED_CURRENCIES } from "./currencies";
import { EXPENSE_EMOJIS, GROUP_ICONS } from "./emoji";
import {
  isIsoDate,
  isValidDescription,
  isValidEmoji,
  isValidName,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
} from "./ledger-input";

describe("isIsoDate", () => {
  it("accepts a real yyyy-mm-dd date", () => {
    expect(isIsoDate("2026-09-29")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
  });

  it("rejects dates that don't exist", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
  });

  it("rejects other formats and non-strings", () => {
    expect(isIsoDate("29.09.2026")).toBe(false);
    expect(isIsoDate("2026-9-29")).toBe(false);
    expect(isIsoDate("2026-09-29T10:00:00Z")).toBe(false);
    expect(isIsoDate(20260929)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("rejects a year typed short into a date field", () => {
    expect(isIsoDate("0026-09-29")).toBe(false);
    expect(isIsoDate("2126-09-29")).toBe(false);
  });
});

describe("isValidDescription", () => {
  it("accepts ordinary text and trims before measuring", () => {
    expect(isValidDescription("Pizza")).toBe(true);
    expect(isValidDescription(` ${"x".repeat(MAX_DESCRIPTION_LENGTH)} `)).toBe(true);
  });

  it("rejects blank, overlong and non-string input", () => {
    expect(isValidDescription("   ")).toBe(false);
    expect(isValidDescription("x".repeat(MAX_DESCRIPTION_LENGTH + 1))).toBe(false);
    expect(isValidDescription(undefined)).toBe(false);
  });
});

describe("isValidName", () => {
  it("caps names at the display-name length", () => {
    expect(isValidName("x".repeat(MAX_NAME_LENGTH))).toBe(true);
    expect(isValidName("x".repeat(MAX_NAME_LENGTH + 1))).toBe(false);
    expect(isValidName(" ")).toBe(false);
  });
});

describe("isValidEmoji", () => {
  it("accepts no emoji and single emoji, including long ZWJ sequences", () => {
    expect(isValidEmoji(null)).toBe(true);
    expect(isValidEmoji("🍕")).toBe(true);
    expect(isValidEmoji("✈️")).toBe(true);
    expect(isValidEmoji("👨‍👩‍👧‍👦")).toBe(true);
  });

  it("accepts every emoji the pickers offer, so none is refused on save", () => {
    expect([...EXPENSE_EMOJIS, ...GROUP_ICONS].filter((emoji) => !isValidEmoji(emoji))).toEqual([]);
  });

  it("rejects an empty string and anything paragraph-sized", () => {
    expect(isValidEmoji("")).toBe(false);
    expect(isValidEmoji("this is not an emoji at all")).toBe(false);
    expect(isValidEmoji(undefined)).toBe(false);
  });
});

describe("isSupportedCurrency", () => {
  it("accepts exactly the offered currencies", () => {
    for (const code of SUPPORTED_CURRENCIES) expect(isSupportedCurrency(code)).toBe(true);
    expect(isSupportedCurrency("JPY")).toBe(false);
    expect(isSupportedCurrency("eur")).toBe(false);
  });

  it("only lists codes Intl can format, so the page can't crash on one", () => {
    for (const code of SUPPORTED_CURRENCIES) {
      expect(
        () => new Intl.NumberFormat("de-DE", { style: "currency", currency: code }),
      ).not.toThrow();
    }
  });
});
