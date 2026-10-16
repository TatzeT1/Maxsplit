import { describe, expect, it } from "vitest";
import type { ReceiptItem } from "@/lib/types";
import {
  allocateReceipt,
  MAX_ITEM_QUANTITY,
  normalizeReceipt,
  receiptItemsTotal,
  validateReceipt,
} from "./receipt";

function item(name: string, totalMinor: number, units: string[][]): ReceiptItem {
  return { name, quantity: units.length, totalMinor, units: units.map((uids) => ({ uids })) };
}

function sum(record: Record<string, number>): number {
  return Object.values(record).reduce((total, amount) => total + amount, 0);
}

// The example from the feature request: three people, 3 Cola, 4 Spätzle.
const dinner = [
  item("Cola 0,33", 1050, [["anna"], ["ben"], ["carl"]]), // 3,50 each
  item("Käsespätzle", 3400, [["anna"], ["anna"], ["ben"], ["carl"]]), // 8,50 each
];

describe("allocateReceipt", () => {
  it("charges each person for the units they had", () => {
    expect(allocateReceipt(4450, dinner)).toEqual({ anna: 2050, ben: 1200, carl: 1200 });
  });

  it("splits a shared unit equally, the odd cent going to the first person", () => {
    const pizza = [item("Pizza", 1001, [["anna", "ben"]])];
    expect(allocateReceipt(1001, pizza)).toEqual({ anna: 501, ben: 500 });
  });

  it("splits a line's total into units with no cent lost", () => {
    // 10,00 for three: 3,34 + 3,33 + 3,33.
    const allocation = allocateReceipt(1000, [item("Bier", 1000, [["a"], ["b"], ["c"]])]);
    expect(allocation).toEqual({ a: 334, b: 333, c: 333 });
  });

  it("spreads a tip in proportion to what each person had", () => {
    // 44,50 of items, 50,00 paid: 5,50 tip, Anna had 20,50 of 44,50.
    const allocation = allocateReceipt(5000, dinner);
    expect(sum(allocation)).toBe(5000);
    // 5,50 × 20,50/44,50 = 2,5337 → Anna has the largest remainder and gets the odd cent.
    expect(allocation).toEqual({ anna: 2304, ben: 1348, carl: 1348 });
  });

  it("spreads a discount the same way, and never below zero", () => {
    const allocation = allocateReceipt(4000, dinner);
    expect(sum(allocation)).toBe(4000);
    expect(Object.values(allocation).every((amount) => amount > 0)).toBe(true);
    expect(allocation.anna).toBeLessThan(2050);
  });

  it("always adds up exactly, whatever the numbers", () => {
    const uids = ["a", "b", "c", "d", "e", "f", "g"];
    for (let seed = 1; seed < 200; seed++) {
      const items: ReceiptItem[] = [];
      for (let line = 0; line < 1 + (seed % 5); line++) {
        const quantity = 1 + ((seed * (line + 3)) % 4);
        const units = Array.from({ length: quantity }, (_, unit) =>
          uids.filter((_, index) => (seed + line + unit + index) % 3 === 0),
        ).map((group) => (group.length > 0 ? group : ["a"]));
        items.push(item(`L${line}`, ((seed * 7919 + line * 104729) % 9000) + 1, units));
      }
      const itemsTotal = receiptItemsTotal(items);
      for (const amount of [itemsTotal, itemsTotal + seed * 13, Math.max(1, itemsTotal - seed)]) {
        const allocation = allocateReceipt(amount, items);
        expect(sum(allocation)).toBe(amount);
        expect(Object.values(allocation).every((v) => Number.isInteger(v) && v > 0)).toBe(true);
      }
    }
  });

  it("leaves out someone whose only item was free", () => {
    const items = [item("Brot", 0, [["ben"]]), item("Suppe", 600, [["anna"]])];
    expect(allocateReceipt(600, items)).toEqual({ anna: 600 });
  });

  it("refuses a unit nobody had, nothing to split, or a discount as big as the bill", () => {
    expect(() => allocateReceipt(500, [item("Cola", 500, [[]])])).toThrow();
    expect(() => allocateReceipt(500, [item("Brot", 0, [["a"]])])).toThrow();
    expect(() => allocateReceipt(0, [item("Cola", 500, [["a"]])])).toThrow();
  });
});

describe("validateReceipt", () => {
  const members = new Set(["anna", "ben", "carl"]);

  it("accepts a well-formed receipt", () => {
    expect(validateReceipt({ items: dinner }, members)).toBeNull();
  });

  it.each([
    ["no items", { items: [] }],
    ["not an object", "receipt"],
    ["a blank name", { items: [item("  ", 100, [["anna"]])] }],
    ["a quantity that doesn't match the units", { items: [{ ...dinner[0], quantity: 2 }] }],
    ["too many units", { items: [item("Bier", 100, Array(MAX_ITEM_QUANTITY + 1).fill(["anna"]))] }],
    ["a negative price", { items: [item("Pfand", -25, [["anna"]])] }],
    ["a fractional price", { items: [item("Cola", 3.5, [["anna"]])] }],
    ["a unit nobody had", { items: [item("Cola", 350, [[]])] }],
    ["a stranger", { items: [item("Cola", 350, [["mallory"]])] }],
    ["a prototype key as uid", { items: [item("Cola", 350, [["constructor"]])] }],
    ["the same person twice on a unit", { items: [item("Cola", 350, [["anna", "anna"]])] }],
  ])("rejects %s", (_, receipt) => {
    expect(validateReceipt(receipt, members)).toBe("invalid-receipt");
  });
});

describe("normalizeReceipt", () => {
  it("keeps only the stored fields, names trimmed", () => {
    const sent = {
      items: [
        { ...item(" Cola ", 350, [["anna"]]), extra: "x", units: [{ uids: ["anna"], y: 1 }] },
      ],
    };
    expect(normalizeReceipt(sent)).toEqual({
      items: [{ name: "Cola", quantity: 1, totalMinor: 350, units: [{ uids: ["anna"] }] }],
    });
  });
});
