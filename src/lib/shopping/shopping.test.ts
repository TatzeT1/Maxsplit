import { describe, expect, it } from "vitest";
import type { Expense, ShoppingItem } from "@/lib/types";
import {
  MAX_CATALOG_ENTRIES,
  addToCatalog,
  cleanText,
  filterSuggestions,
  groupByAisle,
  normalizeItemProduct,
  normalizeListIcon,
  shoppingNameKey,
  shoppingSuggestions,
  sortChecked,
} from "./shopping";

function item(id: string, patch: Partial<ShoppingItem> = {}): ShoppingItem {
  return {
    id,
    name: id,
    quantity: null,
    forUid: null,
    addedBy: "max",
    createdAt: "2026-10-22T10:00:00.000Z",
    checked: false,
    checkedBy: null,
    checkedChangedAt: null,
    ...patch,
  };
}

function receipt(...kinds: [string, string][]): Pick<Expense, "receipt" | "deletedAt"> {
  return {
    deletedAt: null,
    receipt: {
      items: kinds.map(([family, kind]) => ({
        name: kind.toUpperCase(),
        quantity: 1,
        totalMinor: 100,
        units: [],
        product: { family, kind },
      })) as unknown as NonNullable<Expense["receipt"]>["items"],
    },
  };
}

describe("cleanText / shoppingNameKey", () => {
  it("collapses whitespace, trims and cuts", () => {
    expect(cleanText("  Hafer   milch ", 80)).toBe("Hafer milch");
    expect(cleanText("abcdef", 3)).toBe("abc");
    expect(cleanText("   ", 10)).toBeNull();
    expect(cleanText(42, 10)).toBeNull();
  });

  it("treats case and spacing as the same name, and keeps keys usable as map keys", () => {
    expect(shoppingNameKey(" Milch ")).toBe(shoppingNameKey("MILCH"));
    expect(shoppingNameKey("Bier 0.5/l")).toBe("bier 0_5_l");
  });
});

describe("normalizeListIcon / normalizeItemProduct", () => {
  it("keeps only the offered icons", () => {
    expect(normalizeListIcon("🛒")).toBe("🛒");
    expect(normalizeListIcon("💣")).toBeNull();
    expect(normalizeListIcon(undefined)).toBeNull();
  });

  it("keeps only well-formed product classes, without extra fields", () => {
    expect(normalizeItemProduct({ family: "dairy", kind: "Milch", extra: 1 })).toEqual({
      family: "dairy",
      kind: "Milch",
    });
    expect(normalizeItemProduct({ family: "nonsense", kind: "Milch" })).toBeNull();
    expect(normalizeItemProduct({ family: "dairy", kind: " milch" })).toBeNull();
  });
});

describe("groupByAisle", () => {
  it("orders sections like the shop (food first), the unclassified last, oldest first inside", () => {
    const sections = groupByAisle([
      item("Shampoo", { product: { family: "drugstore", kind: "Shampoo" } }),
      item("Gurke", { product: { family: "produce", kind: "Gurke" } }),
      item("Irgendwas"),
      item("Hack", { product: { family: "meat", kind: "Hackfleisch" } }),
      item("Apfel", {
        product: { family: "produce", kind: "Apfel" },
        createdAt: "2026-10-22T09:00:00.000Z",
      }),
    ]);
    expect(sections.map((section) => section.family)).toEqual([
      "meat",
      "produce",
      "drugstore",
      null,
    ]);
    expect(sections[1].items.map((entry) => entry.id)).toEqual(["Apfel", "Gurke"]);
  });
});

describe("sortChecked", () => {
  it("puts what went into the cart last on top", () => {
    const sorted = sortChecked([
      item("a", { checked: true, checkedChangedAt: "2026-10-22T10:01:00.000Z" }),
      item("b", { checked: true, checkedChangedAt: "2026-10-22T10:05:00.000Z" }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

describe("addToCatalog", () => {
  it("counts a name again, keeps the newest spelling and the known aisle", () => {
    const first = addToCatalog(undefined, "milch", { family: "dairy", kind: "Milch" }, "t1");
    const second = addToCatalog(first, "Milch", null, "t2");
    expect(second.entries[shoppingNameKey("Milch")]).toEqual({
      name: "Milch",
      count: 2,
      lastAddedAt: "t2",
      product: { family: "dairy", kind: "Milch" },
    });
  });

  it("drops the least recently added names beyond the cap", () => {
    let catalog = addToCatalog(undefined, "oldest", null, "2026-01-01");
    for (let index = 0; index < MAX_CATALOG_ENTRIES; index++) {
      catalog = addToCatalog(
        catalog,
        `name ${index}`,
        null,
        `2026-02-${String(index).padStart(4, "0")}`,
      );
    }
    expect(Object.keys(catalog.entries)).toHaveLength(MAX_CATALOG_ENTRIES);
    expect(catalog.entries.oldest).toBeUndefined();
  });
});

describe("shoppingSuggestions", () => {
  it("ranks names put on lists above receipt kinds, merges both and skips what's open", () => {
    const catalog = addToCatalog(
      addToCatalog(undefined, "Hafermilch", null, "t1"),
      "Bananen",
      { family: "produce", kind: "Banane" },
      "t2",
    );
    const suggestions = shoppingSuggestions(
      catalog,
      [
        receipt(["dairy", "Hafermilch"], ["meat", "Mett"], ["meals", "Pizza"]),
        receipt(["meat", "Mett"]),
        { ...receipt(["sweets", "Chips"]), deletedAt: "2026-10-01" },
      ],
      [{ name: "bananen" }],
    );
    expect(suggestions.map((suggestion) => suggestion.name)).toEqual(["Hafermilch", "Mett"]);
    // A receipt fills in the aisle a hand-typed name didn't have yet.
    expect(suggestions[0].product).toEqual({ family: "dairy", kind: "Hafermilch" });
  });
});

describe("filterSuggestions", () => {
  it("finds names containing what's typed, but not the exact name itself", () => {
    const suggestions = [
      { name: "Milch", product: null, weight: 3 },
      { name: "Hafermilch", product: null, weight: 2 },
      { name: "Brot", product: null, weight: 1 },
    ];
    expect(filterSuggestions(suggestions, "milch").map((s) => s.name)).toEqual(["Hafermilch"]);
    expect(filterSuggestions(suggestions, "mil").map((s) => s.name)).toEqual([
      "Milch",
      "Hafermilch",
    ]);
    expect(filterSuggestions(suggestions, "  ")).toEqual([]);
  });
});
