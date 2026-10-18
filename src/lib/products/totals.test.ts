import { describe, expect, it } from "vitest";
import type { Expense, ProductClass, ReceiptItem } from "@/lib/types";
import { computeProductTotals, inPeriod, shiftPeriod } from "./totals";

const MEAT = (kind: string): ProductClass => ({ family: "meat", kind });

function expense(
  id: string,
  date: string,
  splits: Record<string, number>,
  extra: Partial<Expense> = {},
): Expense {
  const amountMinor = Object.values(splits).reduce((sum, amount) => sum + amount, 0);
  return {
    id,
    description: id,
    amountMinor,
    currency: "EUR",
    date,
    category: null,
    paidBy: { anna: amountMinor },
    splitMode: "exact",
    splits: Object.fromEntries(
      Object.entries(splits).map(([uid, amount]) => [
        uid,
        { rawValue: amount, amountMinor: amount },
      ]),
    ),
    createdBy: "anna",
    createdAt: `${date}T12:00:00Z`,
    updatedAt: `${date}T12:00:00Z`,
    deletedAt: null,
    ...extra,
  };
}

function line(name: string, totalMinor: number, uids: string[][], product?: ProductClass) {
  return {
    name,
    quantity: uids.length,
    totalMinor,
    units: uids.map((unit) => ({ uids: unit })),
    ...(product ? { product } : {}),
  } satisfies ReceiptItem;
}

// A butcher's receipt, 10,00 paid for 9,50 of items: a 0,50 tip, spread
// 650 : 300 by what each had — Anna 6,84, Ben 3,16.
const butcher = expense(
  "butcher",
  "2026-10-03",
  { anna: 684, ben: 316 },
  {
    amountMinor: 1000,
    receipt: {
      items: [
        line("Schweinemett", 600, [["anna"], ["ben"]], MEAT("Mett")),
        line("Kalbsleberwurst", 350, [["anna"]], MEAT("Leberwurst")),
      ],
    },
  },
);
const rent = expense(
  "rent",
  "2026-10-01",
  { anna: 40000, ben: 40000 },
  { product: { family: "housing", kind: "Miete" } },
);
const pizza = expense("pizza", "2026-09-20", { anna: 1200, ben: 1200 });
const deletedMett = expense(
  "gone",
  "2026-10-05",
  { anna: 999 },
  { product: MEAT("Mett"), deletedAt: "2026-10-06T00:00:00Z" },
);

const all = [butcher, rent, pizza, deletedMett];
const october = { kind: "month", year: 2026, month: 10 } as const;

describe("computeProductTotals", () => {
  it("sums the group's spending by family and kind, biggest first, tip included", () => {
    const totals = computeProductTotals(all, october);
    expect(totals.amountMinor).toBe(81000);
    expect(totals.families.map((family) => family.family)).toEqual(["housing", "meat"]);
    const meat = totals.families[1];
    expect(meat.amountMinor).toBe(1000);
    expect(meat.kinds.map((kind) => [kind.kind, kind.amountMinor])).toEqual([
      ["Mett", 632],
      ["Leberwurst", 368],
    ]);
    // Who had the Mett: one each, Anna's 6,84 spread over her two lines.
    expect(meat.kinds[0].byUid).toEqual({ anna: 316, ben: 316 });
    expect(totals.unclassified.count).toBe(0);
  });

  it("counts one person's share only, and leaves out what they had none of", () => {
    const totals = computeProductTotals(all, october, "ben");
    expect(totals.amountMinor).toBe(40316);
    const meat = totals.families.find((family) => family.family === "meat")!;
    expect(meat.kinds.map((kind) => kind.kind)).toEqual(["Mett"]);
    expect(meat.kinds[0].byUid).toEqual({ ben: 316 });
  });

  it("shows what has no class as its own row, in the total", () => {
    const totals = computeProductTotals(all, { kind: "all" });
    expect(totals.unclassified).toEqual({
      amountMinor: 2400,
      byUid: { anna: 1200, ben: 1200 },
      count: 1,
    });
    expect(totals.amountMinor).toBe(83400);
    const rows = totals.families.reduce((sum, family) => sum + family.amountMinor, 0);
    expect(rows + totals.unclassified.amountMinor).toBe(totals.amountMinor);
  });

  it("sums kinds that differ only in case into one row", () => {
    const a = expense("a", "2026-10-02", { anna: 100 }, { product: MEAT("Mett") });
    const b = expense("b", "2026-10-03", { anna: 200 }, { product: MEAT("mett") });
    const totals = computeProductTotals([a, b], october);
    expect(totals.families[0].kinds).toEqual([
      { kind: "Mett", amountMinor: 300, byUid: { anna: 300 }, count: 2 },
    ]);
  });

  it("falls back to the split for a receipt that no longer allocates", () => {
    const broken = expense(
      "broken",
      "2026-10-04",
      { anna: 500 },
      { receipt: { items: [line("Nichts", 0, [["anna"]], MEAT("Mett"))] } },
    );
    const totals = computeProductTotals([broken], october);
    expect(totals.unclassified.amountMinor).toBe(500);
  });
});

describe("periods", () => {
  it("matches dates by month and year", () => {
    expect(inPeriod("2026-10-31", october)).toBe(true);
    expect(inPeriod("2026-01-31", october)).toBe(false);
    expect(inPeriod("2026-01-31", { kind: "year", year: 2026 })).toBe(true);
    expect(inPeriod("2025-12-31", { kind: "year", year: 2026 })).toBe(false);
  });

  it("steps across year boundaries", () => {
    expect(shiftPeriod({ kind: "month", year: 2026, month: 1 }, -1)).toEqual({
      kind: "month",
      year: 2025,
      month: 12,
    });
    expect(shiftPeriod({ kind: "month", year: 2026, month: 12 }, 1)).toEqual({
      kind: "month",
      year: 2027,
      month: 1,
    });
    expect(shiftPeriod({ kind: "year", year: 2026 }, 1)).toEqual({ kind: "year", year: 2027 });
    expect(shiftPeriod({ kind: "all" }, 1)).toEqual({ kind: "all" });
  });
});
