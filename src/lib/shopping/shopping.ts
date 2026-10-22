// Shopping lists: limits, validation, sorting by aisle and the quick-add
// suggestions. Shared by the client (the list screen) and the server
// (lib/actions/shopping.ts) — one definition, so both sides agree.

import { PRODUCT_FAMILY_IDS, isValidProductClass, productKindKey } from "@/lib/products/products";
import type {
  Expense,
  ProductClass,
  ProductFamilyId,
  ShoppingCatalog,
  ShoppingCatalogEntry,
  ShoppingItem,
} from "@/lib/types";

export const MAX_LIST_NAME_LENGTH = 40;
export const MAX_ITEM_NAME_LENGTH = 80;
export const MAX_QUANTITY_LENGTH = 30;
/** Lists per group, items per list: far above any real shop, low enough that a runaway client can't flood a group. */
export const MAX_LISTS_PER_GROUP = 30;
export const MAX_ITEMS_PER_LIST = 300;
/** Names the catalog remembers; the least recently added drop out first. */
export const MAX_CATALOG_ENTRIES = 300;

/** A client-chosen list or item id (a UUID) — what makes a retried create safe. */
export const SHOPPING_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** The icons a list can pick from. */
export const SHOPPING_LIST_ICONS = [
  "🛒",
  "🥦",
  "🧴",
  "🏠",
  "🔥",
  "🎉",
  "🍝",
  "🥖",
  "🍺",
  "🐶",
  "👶",
  "🎁",
];

/** Families that make sense on a shopping list — the suggestions from receipts keep to these. */
const SHOPPABLE_FAMILIES: ReadonlySet<ProductFamilyId> = new Set([
  "meat",
  "fish",
  "dairy",
  "bakery",
  "produce",
  "staples",
  "frozen",
  "sweets",
  "drinks",
  "alcohol",
  "household",
  "drugstore",
  "health",
]);

/** Whitespace collapsed and trimmed, cut to `max`; null when nothing is left. */
export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, max).trim();
  return text || null;
}

/** The key a name is remembered and compared under: "Milch", " milch " and "MILCH" are one. */
export function shoppingNameKey(name: string): string {
  // Firestore map keys can't be empty and read badly with dots or slashes in them.
  return productKindKey(name.replace(/\s+/g, " ").trim()).replace(/[./]/g, "_");
}

/** A list icon as stored: one of SHOPPING_LIST_ICONS, else null (the default). */
export function normalizeListIcon(value: unknown): string | null {
  return typeof value === "string" && SHOPPING_LIST_ICONS.includes(value) ? value : null;
}

/** A ProductClass a client sent along (picked from a suggestion), or null. */
export function normalizeItemProduct(value: unknown): ProductClass | null {
  return isValidProductClass(value) ? { family: value.family, kind: value.kind } : null;
}

export interface AisleSection {
  /** null = not classified yet. */
  family: ProductFamilyId | null;
  items: ShoppingItem[];
}

/**
 * The open items grouped by aisle in the order of PRODUCT_FAMILY_IDS (food
 * first, the drugstore later), the not-yet-classified last; inside a
 * section, oldest first — the order they were thought of.
 */
export function groupByAisle(items: readonly ShoppingItem[]): AisleSection[] {
  const byFamily = new Map<ProductFamilyId | null, ShoppingItem[]>();
  for (const item of items) {
    const family = item.product?.family ?? null;
    const section = byFamily.get(family) ?? [];
    section.push(item);
    byFamily.set(family, section);
  }
  const order: (ProductFamilyId | null)[] = [...PRODUCT_FAMILY_IDS, null];
  return order
    .filter((family) => byFamily.has(family))
    .map((family) => ({
      family,
      items: byFamily.get(family)!.sort(byCreatedAt),
    }));
}

function byCreatedAt(a: ShoppingItem, b: ShoppingItem): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id.localeCompare(b.id);
}

/** Checked items, most recently checked first — what just went into the cart sits on top. */
export function sortChecked(items: readonly ShoppingItem[]): ShoppingItem[] {
  return [...items].sort((a, b) => {
    const at = a.checkedChangedAt ?? "";
    const bt = b.checkedChangedAt ?? "";
    return at < bt ? 1 : at > bt ? -1 : byCreatedAt(a, b);
  });
}

/**
 * The catalog after `name` was put on a list once more: counted, its spelling
 * and (when known) aisle updated, and the least recently added names dropped
 * beyond MAX_CATALOG_ENTRIES.
 */
export function addToCatalog(
  catalog: ShoppingCatalog | undefined,
  name: string,
  product: ProductClass | null,
  now: string,
): ShoppingCatalog {
  const entries = { ...catalog?.entries };
  const key = shoppingNameKey(name);
  const previous = entries[key];
  const known = product ?? previous?.product ?? null;
  entries[key] = {
    name,
    count: (previous?.count ?? 0) + 1,
    lastAddedAt: now,
    ...(known ? { product: known } : {}),
  };
  const keys = Object.keys(entries);
  if (keys.length > MAX_CATALOG_ENTRIES) {
    keys
      .sort((a, b) => (entries[a].lastAddedAt < entries[b].lastAddedAt ? -1 : 1))
      .slice(0, keys.length - MAX_CATALOG_ENTRIES)
      .forEach((stale) => delete entries[stale]);
  }
  return { entries };
}

export interface ShoppingSuggestion {
  name: string;
  product: ProductClass | null;
  /** How often it was bought or put on a list — the ranking. */
  weight: number;
}

/**
 * What to offer as one-tap adds: the names this group has put on lists
 * before, plus what its receipts show it buys (the product kind of every
 * receipt line, groceries and household only) — minus what's already open on
 * the list. Most frequent first.
 */
export function shoppingSuggestions(
  catalog: ShoppingCatalog | null,
  expenses: readonly Pick<Expense, "receipt" | "deletedAt">[],
  openItems: readonly Pick<ShoppingItem, "name">[],
  limit = 24,
): ShoppingSuggestion[] {
  const byKey = new Map<string, ShoppingSuggestion>();
  for (const entry of Object.values(catalog?.entries ?? {}) as ShoppingCatalogEntry[]) {
    // Weighted up: put on a list by hand says more than once seen on a receipt.
    byKey.set(shoppingNameKey(entry.name), {
      name: entry.name,
      product: entry.product ?? null,
      weight: entry.count * 2,
    });
  }
  for (const expense of expenses) {
    if (expense.deletedAt) continue;
    for (const item of expense.receipt?.items ?? []) {
      const product = item.product;
      if (!product || !SHOPPABLE_FAMILIES.has(product.family)) continue;
      const key = shoppingNameKey(product.kind);
      const existing = byKey.get(key);
      if (existing) {
        existing.weight += 1;
        existing.product ??= product;
      } else {
        byKey.set(key, { name: product.kind, product, weight: 1 });
      }
    }
  }
  const open = new Set(openItems.map((item) => shoppingNameKey(item.name)));
  return [...byKey.entries()]
    .filter(([key]) => !open.has(key))
    .map(([, suggestion]) => suggestion)
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name, "de"))
    .slice(0, limit);
}

/** Suggestions whose name contains `query` (case-insensitive), for the add field's autocomplete. */
export function filterSuggestions(
  suggestions: readonly ShoppingSuggestion[],
  query: string,
  limit = 6,
): ShoppingSuggestion[] {
  const needle = shoppingNameKey(query);
  if (!needle) return [];
  return suggestions
    .filter((suggestion) => {
      const key = shoppingNameKey(suggestion.name);
      return key !== needle && key.includes(needle);
    })
    .slice(0, limit);
}
