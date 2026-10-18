// What an expense or a receipt line was spent on, for the Auswertung tab:
// a fixed family ("Fleisch & Wurst") and a free, normalized kind ("Mett").
// Shared by the client (editor, picker, totals) and the server (validation,
// the model's answers) — one list, so both sides agree on what is valid.

import type { TranslationKey } from "@/lib/i18n/translate";
import type { Expense, ProductClass, ProductFamilyId } from "@/lib/types";

/** In the order the picker lists them: food first, then the household, then the rest. */
export const PRODUCT_FAMILY_IDS: readonly ProductFamilyId[] = [
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
  "groceries",
  "meals",
  "household",
  "drugstore",
  "health",
  "housing",
  "utilities",
  "transport",
  "travel",
  "leisure",
  "clothing",
  "electronics",
  "fees",
  "other",
];

const FAMILY_EMOJI: Record<ProductFamilyId, string> = {
  meat: "🥩",
  fish: "🐟",
  dairy: "🧀",
  bakery: "🥖",
  produce: "🥦",
  staples: "🍝",
  frozen: "🧊",
  sweets: "🍫",
  drinks: "🥤",
  alcohol: "🍺",
  groceries: "🛒",
  meals: "🍽️",
  household: "🧽",
  drugstore: "🧴",
  health: "💊",
  housing: "🏠",
  utilities: "💡",
  transport: "🚗",
  travel: "✈️",
  leisure: "🎟️",
  clothing: "👕",
  electronics: "📱",
  fees: "🧾",
  other: "📦",
};

/** "Jetzt einordnen" runs a user may start per day — each spends up to two requests of the shared free quota. */
export const CLASSIFY_RUNS_PER_DAY = 20;

/** A product kind, in characters. "Kartoffelsalat" fits; a receipt line's full text doesn't need to. */
export const MAX_PRODUCT_KIND_LENGTH = 40;

export function isProductFamilyId(value: unknown): value is ProductFamilyId {
  return typeof value === "string" && (PRODUCT_FAMILY_IDS as readonly string[]).includes(value);
}

export function productFamilyEmoji(family: ProductFamilyId): string {
  return FAMILY_EMOJI[family];
}

export function productFamilyLabelKey(family: ProductFamilyId): TranslationKey {
  return `productFamilies.${family}`;
}

/**
 * The one spelling a kind is stored and summed under: whitespace collapsed,
 * first letter upper case — "  mett " and "Mett" are one row in the table,
 * not two. `null` when nothing is left.
 */
export function normalizeProductKind(value: string): string | null {
  const kind = value.replace(/\s+/g, " ").trim().slice(0, MAX_PRODUCT_KIND_LENGTH).trim();
  if (!kind) return null;
  return kind.charAt(0).toLocaleUpperCase("de-DE") + kind.slice(1);
}

/** The key two kinds are summed under when their spelling differs only in case. */
export function productKindKey(kind: string): string {
  return kind.toLocaleLowerCase("de-DE");
}

/**
 * A well-formed ProductClass, exactly as stored — as a client must send it.
 * Strict: an unknown family has no label or emoji and would break the tab.
 */
export function isValidProductClass(value: unknown): value is ProductClass {
  if (typeof value !== "object" || value === null) return false;
  const { family, kind } = value as Partial<ProductClass>;
  return (
    isProductFamilyId(family) && typeof kind === "string" && normalizeProductKind(kind) === kind
  );
}

/**
 * A model's answer for one product, made usable: the family lower-cased and
 * checked, the kind normalized (an empty kind falls back to nothing — the
 * table needs a row name). `null` when either is unusable.
 */
export function toProductClass(family: unknown, kind: unknown): ProductClass | null {
  const familyId = typeof family === "string" ? family.trim().toLowerCase() : family;
  if (!isProductFamilyId(familyId) || typeof kind !== "string") return null;
  const normalized = normalizeProductKind(kind);
  return normalized ? { family: familyId, kind: normalized } : null;
}

/** The family list as the prompts spell it out for the model, with what belongs where. */
export const PRODUCT_FAMILY_GUIDE = `- meat: Fleisch, Wurst, Aufschnitt (Mett, Leberwurst, Teewurst, Hackfleisch, Salami, Schinken)
- fish: Fisch und Meeresfrüchte
- dairy: Milch, Joghurt, Käse, Butter, Sahne, Eier
- bakery: Brot, Brötchen, Kuchen, Gebäck
- produce: Obst, Gemüse, Kräuter, Salat
- staples: Nudeln, Reis, Mehl, Zucker, Öl, Gewürze, Konserven, Müsli, Aufstriche
- frozen: Tiefkühlware, Fertiggerichte, Pizza aus dem Kühlregal
- sweets: Süßigkeiten, Schokolade, Chips, Knabberzeug, Eis
- drinks: alkoholfreie Getränke (Wasser, Saft, Limo, Cola, Kaffee, Tee)
- alcohol: Bier, Wein, Sekt, Spirituosen
- groceries: ein Lebensmitteleinkauf, dessen einzelne Produkte unbekannt sind ("Edeka", "Wocheneinkauf")
- meals: Essen und Getränke im Restaurant, Café, Imbiss, Lieferdienst (ein Gericht vom Restaurantbeleg)
- household: Putzmittel, Spülmittel, Küchenrolle, Müllbeutel, Haushaltswaren, Möbel
- drugstore: Drogerie, Körperpflege, Kosmetik, Toilettenpapier
- health: Apotheke, Medikamente, Arzt
- housing: Miete, Nebenkosten der Wohnung, Reparaturen
- utilities: Strom, Gas, Wasser, Internet, Handy, Rundfunkbeitrag, Abos
- transport: Tanken, Bahn, Bus, Taxi, Parken, Auto
- travel: Hotel, Ferienwohnung, Flug, Ausflug
- leisure: Kino, Konzert, Sport, Freizeit, Spiele, Bücher, Geschenke
- clothing: Kleidung, Schuhe
- electronics: Technik, Elektronik, Zubehör
- fees: Pfand, Gebühren, Service, Versand, Tüten
- other: alles andere`;

/**
 * Which parts of an expense still wait for a ProductClass: the whole
 * expense when it has no receipt, otherwise the receipt lines without one.
 * Shared by the server (what to ask the model) and the Auswertung (what to
 * count as "Noch nicht eingeordnet").
 */
export function missingProductClasses(
  expense: Pick<Expense, "product" | "receipt" | "deletedAt">,
): { expense: boolean; lines: number[] } {
  if (expense.deletedAt) return { expense: false, lines: [] };
  const items = expense.receipt?.items;
  if (items && items.length > 0) {
    const lines = items.flatMap((item, index) => (item.product ? [] : [index]));
    return { expense: false, lines };
  }
  return { expense: !expense.product, lines: [] };
}

export function needsProductClass(
  expense: Pick<Expense, "product" | "receipt" | "deletedAt">,
): boolean {
  const missing = missingProductClasses(expense);
  return missing.expense || missing.lines.length > 0;
}
