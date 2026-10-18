import { describe, expect, it } from "vitest";
import { de } from "@/lib/i18n/de";
import { en } from "@/lib/i18n/en";
import {
  isValidProductClass,
  missingProductClasses,
  normalizeProductKind,
  PRODUCT_FAMILY_GUIDE,
  PRODUCT_FAMILY_IDS,
  toProductClass,
} from "./products";

describe("normalizeProductKind", () => {
  it.each([
    ["mett", "Mett"],
    ["  Leber   wurst ", "Leber wurst"],
    ["äpfel", "Äpfel"],
    ["", null],
    ["   ", null],
  ])("%j → %j", (input, expected) => {
    expect(normalizeProductKind(input)).toBe(expected);
  });

  it("cuts a kind to 40 characters", () => {
    expect(normalizeProductKind("x".repeat(80))).toHaveLength(40);
  });
});

describe("toProductClass", () => {
  it("takes a known family in any case, and normalizes the kind", () => {
    expect(toProductClass(" MEAT ", "mett")).toEqual({ family: "meat", kind: "Mett" });
  });

  it.each([
    ["coupons", "Marke"],
    ["meat", ""],
    ["meat", 3],
    [null, "Mett"],
  ])("refuses %j / %j", (family, kind) => {
    expect(toProductClass(family, kind)).toBeNull();
  });
});

describe("isValidProductClass", () => {
  it("accepts exactly the stored shape", () => {
    expect(isValidProductClass({ family: "bakery", kind: "Brot" })).toBe(true);
  });

  it.each([
    [{ family: "bakery", kind: "brot" }],
    [{ family: "bakery", kind: " Brot" }],
    [{ family: "toString", kind: "Brot" }],
    [{ family: "bakery" }],
    [null],
    ["bakery"],
  ])("refuses %j", (value) => {
    expect(isValidProductClass(value)).toBe(false);
  });
});

describe("missingProductClasses", () => {
  const item = { name: "Mett", quantity: 1, totalMinor: 320, units: [{ uids: ["a"] }] };

  it("asks for the expense itself without a receipt", () => {
    expect(missingProductClasses({ deletedAt: null })).toEqual({ expense: true, lines: [] });
    expect(
      missingProductClasses({ deletedAt: null, product: { family: "housing", kind: "Miete" } }),
    ).toEqual({ expense: false, lines: [] });
  });

  it("asks for the receipt lines that have no class, never the expense", () => {
    const receipt = {
      items: [{ ...item, product: { family: "meat" as const, kind: "Mett" } }, item],
    };
    expect(missingProductClasses({ deletedAt: null, receipt })).toEqual({
      expense: false,
      lines: [1],
    });
  });

  it("asks nothing of a deleted expense", () => {
    expect(missingProductClasses({ deletedAt: "2026-10-01T00:00:00Z" })).toEqual({
      expense: false,
      lines: [],
    });
  });
});

describe("the family list", () => {
  it("has a label in every language and a line in the model's guide", () => {
    for (const family of PRODUCT_FAMILY_IDS) {
      expect(de.productFamilies[family]).toBeTruthy();
      expect(en.productFamilies[family]).toBeTruthy();
      expect(PRODUCT_FAMILY_GUIDE).toContain(`- ${family}:`);
    }
    expect(Object.keys(de.productFamilies)).toHaveLength(PRODUCT_FAMILY_IDS.length);
  });
});
