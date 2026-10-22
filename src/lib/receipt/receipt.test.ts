import { describe, expect, it } from "vitest";
import type { ReceiptItem } from "@/lib/types";
import {
  allocateReceipt,
  MAX_ITEM_QUANTITY,
  normalizeReceipt,
  receiptItemsTotal,
  receiptLineShares,
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

  it("rounds a line once, not unit by unit — the odd cents don't pile up on the same people", () => {
    // 6 yoghurts at 0,50 for three: unit by unit was 17/17/16 six times (102/102/96).
    const everyone = ["a", "b", "c"];
    const yoghurt = item(
      "Joghurt",
      300,
      Array.from({ length: 6 }, () => everyone),
    );
    expect(allocateReceipt(300, [yoghurt])).toEqual({ a: 100, b: 100, c: 100 });
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
    expect(() => allocateReceipt(-100, [item("Cola", 500, [["a"]])])).toThrow();
  });

  it("credits a deposit return to whoever brought the bottles back", () => {
    // Ben's shopping, Anna's empties on the same receipt: she ends up with a credit.
    const items = [item("Brot", 1000, [["ben"]]), item("Pfand", -25, [["anna"]])];
    expect(allocateReceipt(975, items)).toEqual({ ben: 1000, anna: -25 });
  });

  it("spreads a tip only over the people on the bill's side", () => {
    const items = [item("Brot", 1000, [["ben"], ["carl"]]), item("Pfand", -50, [["anna"]])];
    const booked = allocateReceipt(1050, items);
    expect(booked).toEqual({ ben: 550, carl: 550, anna: -50 });
    expect(sum(booked)).toBe(1050);
  });

  it("splits a deposit slip as a credit for everyone on it", () => {
    const slip = [item("Leergut", -325, [["anna", "ben", "carl"]])];
    expect(allocateReceipt(-325, slip)).toEqual({ anna: -109, ben: -108, carl: -108 });
    expect(() => allocateReceipt(325, slip)).toThrow();
  });
});

describe("validateReceipt", () => {
  const members = new Set(["anna", "ben", "carl"]);

  it("accepts a well-formed receipt", () => {
    expect(validateReceipt({ items: dinner }, members)).toBeNull();
  });

  it("accepts a deposit return as a negative line", () => {
    expect(validateReceipt({ items: [item("Pfand", -25, [["anna"]])] }, members)).toBeNull();
  });

  it.each([
    ["no items", { items: [] }],
    ["not an object", "receipt"],
    ["a blank name", { items: [item("  ", 100, [["anna"]])] }],
    ["a quantity that doesn't match the units", { items: [{ ...dinner[0], quantity: 2 }] }],
    ["too many units", { items: [item("Bier", 100, Array(MAX_ITEM_QUANTITY + 1).fill(["anna"]))] }],
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

describe("receiptLineShares", () => {
  it("gives each line its part of the bill, per person, tip spread like the split", () => {
    // 44,50 of items, paid 50,00: the 5,50 tip goes by what each person had.
    const shares = receiptLineShares(5000, dinner);
    const booked = allocateReceipt(5000, dinner);
    for (const uid of Object.keys(booked)) {
      expect(shares.reduce((total, line) => total + (line[uid] ?? 0), 0)).toBe(booked[uid]);
    }
    expect(shares.reduce((total, line) => total + sum(line), 0)).toBe(5000);
    // Without a tip a line is exactly what its people had of it.
    expect(receiptLineShares(4450, dinner)).toEqual([
      { anna: 350, ben: 350, carl: 350 },
      { anna: 1700, ben: 850, carl: 850 },
    ]);
  });

  it("spreads a discount too, and leaves nobody a negative line", () => {
    const shares = receiptLineShares(4000, dinner);
    expect(shares.reduce((total, line) => total + sum(line), 0)).toBe(4000);
    expect(shares.every((line) => Object.values(line).every((amount) => amount > 0))).toBe(true);
  });

  it("sums exactly over random receipts", () => {
    const people = ["a", "b", "c", "d"];
    for (let run = 0; run < 200; run++) {
      const items = Array.from({ length: 1 + (run % 5) }, (_, index) =>
        item(
          `x${index}`,
          1 + ((run * 37 + index * 101) % 2000),
          Array.from({ length: 1 + ((run + index) % 3) }, (_, unit) =>
            people.slice(0, 1 + ((run + unit) % people.length)),
          ),
        ),
      );
      const itemsTotal = receiptItemsTotal(items);
      const amount = itemsTotal + ((run % 7) - 3) * 13;
      if (amount <= 0) continue;
      let shares: Record<string, number>[];
      try {
        shares = receiptLineShares(amount, items);
      } catch {
        continue;
      }
      expect(shares.reduce((total, line) => total + sum(line), 0)).toBe(amount);
    }
  });
});

describe("receiptLineShares with a deposit line", () => {
  it("keeps the credit on its own line", () => {
    const items = [item("Bier", 1000, [["anna"], ["ben"]]), item("Pfand", -16, [["anna"]])];
    const shares = receiptLineShares(984, items);
    expect(shares).toEqual([{ anna: 500, ben: 500 }, { anna: -16 }]);
  });
});

describe("a receipt line's product class", () => {
  const members = new Set(["anna", "ben", "carl"]);

  it("is optional, and stored as given when well-formed", () => {
    const withProduct = {
      items: [{ ...dinner[0], product: { family: "drinks" as const, kind: "Cola" } }, dinner[1]],
    };
    expect(validateReceipt(withProduct, members)).toBeNull();
    const normalized = normalizeReceipt({
      items: [{ ...withProduct.items[0], extra: 1 } as ReceiptItem, dinner[1]],
    });
    expect(normalized.items[0].product).toEqual({ family: "drinks", kind: "Cola" });
    expect(normalized.items[1]).not.toHaveProperty("product");
  });

  it.each([
    [{ family: "drinks", kind: "cola" }],
    [{ family: "beverages", kind: "Cola" }],
    [{ family: "drinks" }],
    [null],
  ])("refuses %j", (product) => {
    expect(validateReceipt({ items: [{ ...dinner[0], product }] }, members)).toBe(
      "invalid-receipt",
    );
  });
});
