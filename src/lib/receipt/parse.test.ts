import { describe, expect, it } from "vitest";
import { parseScannedReceipt, RECEIPT_PROMPT, toMinor } from "./parse";

describe("toMinor", () => {
  it.each([
    [3.5, 350],
    [34, 3400],
    ["3,50", 350],
    ["3.50", 350],
    ["€ 12,90", 1290],
    ["1.234,50", 123450],
    ["1,234.50", 123450],
    ["12.5", 1250],
    [0.1 + 0.2, 30],
  ])("%s → %i", (value, expected) => {
    expect(toMinor(value)).toBe(expected);
  });

  it.each([[null], [undefined], ["gratis"], [Number.NaN], [{}]])("%s → null", (value) => {
    expect(toMinor(value)).toBeNull();
  });
});

describe("parseScannedReceipt", () => {
  it("reads the shape the prompt asks for", () => {
    const text = JSON.stringify({
      merchant: "Gasthaus Krone",
      date: "2026-10-15",
      total: 44.5,
      items: [
        { name: "Cola 0,33l", quantity: 3, total: 10.5 },
        { name: "Käsespätzle", quantity: 4, total: 34 },
      ],
    });
    expect(parseScannedReceipt(text)).toEqual({
      merchant: "Gasthaus Krone",
      date: "2026-10-15",
      totalMinor: 4450,
      items: [
        { name: "Cola 0,33l", quantity: 3, totalMinor: 1050, product: null },
        { name: "Käsespätzle", quantity: 4, totalMinor: 3400, product: null },
      ],
    });
  });

  it("finds the JSON inside a code fence and chatter", () => {
    const text =
      'Here you go:\n```json\n{"merchant": null, "items": [{"name": "Bier", "total": "4,20"}]}\n```';
    expect(parseScannedReceipt(text)?.items).toEqual([
      { name: "Bier", quantity: 1, totalMinor: 420, product: null },
    ]);
  });

  it("works out a line total from a unit price, and clamps odd quantities", () => {
    const text = JSON.stringify({
      items: [
        { name: "Spätzle", qty: "4", unitPrice: 8.5 },
        { name: "Wein 0,5", quantity: 0.5, total: 6 },
        { name: "Wasser", quantity: 500, total: 2 },
      ],
    });
    expect(parseScannedReceipt(text)?.items).toEqual([
      { name: "Spätzle", quantity: 4, totalMinor: 3400, product: null },
      { name: "Wein 0,5", quantity: 1, totalMinor: 600, product: null },
      { name: "Wasser", quantity: 30, totalMinor: 200, product: null },
    ]);
  });

  it("drops nameless and priceless lines", () => {
    const text = JSON.stringify({
      items: [
        { name: "", total: 3 },
        { name: "Brot" },
        { name: "  Salat   gemischt ", total: 5.9 },
      ],
    });
    expect(parseScannedReceipt(text)?.items).toEqual([
      { name: "Salat gemischt", quantity: 1, totalMinor: 590, product: null },
    ]);
  });

  it("keeps a deposit return as a negative line, the minus in front or behind", () => {
    const text = JSON.stringify({
      total: "-3,25",
      items: [
        { name: "Pfand zurück", total: -0.25 },
        { name: "Leergut", total: "3,00-" },
      ],
    });
    const parsed = parseScannedReceipt(text);
    expect(parsed?.items.map((item) => item.totalMinor)).toEqual([-25, -300]);
    expect(parsed?.totalMinor).toBe(-325);
  });

  it("reads what each line is, normalized, and drops an unknown family", () => {
    const text = JSON.stringify({
      items: [
        { name: "Schweinemett", total: 3.2, family: "meat", kind: "mett" },
        { name: "Teewurst", total: 1.99, family: " Meat ", kind: "  Teewurst  " },
        { name: "Bon-Rabattmarke", total: 0.5, family: "coupons", kind: "Marke" },
        { name: "Brot", total: 2.5, family: "bakery", kind: "" },
      ],
    });
    expect(parseScannedReceipt(text)?.items.map((item) => item.product)).toEqual([
      { family: "meat", kind: "Mett" },
      { family: "meat", kind: "Teewurst" },
      null,
      null,
    ]);
  });

  it("asks the model for a family out of the fixed list, and a generic kind", () => {
    expect(RECEIPT_PROMPT).toContain('"family": string, "kind": string');
    expect(RECEIPT_PROMPT).toContain("- meat:");
    expect(RECEIPT_PROMPT).toContain('"Schweinemett" -> "Mett"');
  });

  it("ignores an impossible date and a non-positive total", () => {
    const parsed = parseScannedReceipt('{"date": "2026-02-30", "total": 0, "items": []}');
    expect(parsed).toEqual({ merchant: null, date: null, totalMinor: null, items: [] });
  });

  it("returns null when there is no JSON at all", () => {
    expect(parseScannedReceipt("Sorry, I can't read that.")).toBeNull();
    expect(parseScannedReceipt("{not json}")).toBeNull();
  });
});
