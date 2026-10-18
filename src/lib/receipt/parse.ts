// Turns what a vision model said about a receipt photo into line items the
// receipt editor can show. Models are told to answer with bare JSON, but the
// free ones wrap it in code fences, write "3,50" or "€ 3.50", leave out the
// quantity or invent a negative "Pfand" line — so this accepts all of that,
// and drops what it can't make sense of rather than guessing.

import { isIsoDate } from "@/lib/ledger-input";
import { PRODUCT_FAMILY_GUIDE, toProductClass } from "@/lib/products/products";
import type { ProductClass } from "@/lib/types";
import { MAX_ITEM_NAME_LENGTH, MAX_ITEM_QUANTITY, MAX_RECEIPT_ITEMS } from "./receipt";

/** A line the model read. Not yet assigned to anyone. */
export interface ScannedItem {
  name: string;
  quantity: number;
  totalMinor: number;
  /** What the model says the line is; `null` when its answer for it was unusable. */
  product: ProductClass | null;
}

/** What a scan returns to the client: a starting point the user corrects and assigns. */
export interface ScannedReceipt {
  merchant: string | null;
  /** yyyy-mm-dd, or null when the model saw none (or an impossible one). */
  date: string | null;
  /** The total printed on the receipt, tip excluded unless it was printed. */
  totalMinor: number | null;
  items: ScannedItem[];
}

/** The instruction every provider sends with the photo. */
export const RECEIPT_PROMPT = `You read restaurant and shop receipts. Look at the photo and answer with JSON only, no prose, in exactly this shape:
{"merchant": string | null, "date": "YYYY-MM-DD" | null, "total": number | null, "items": [{"name": string, "quantity": integer, "total": number, "family": string, "kind": string}]}
Rules:
- One entry per printed line item. "quantity" is how many units the line covers (1 if not printed). "total" is the line's price for all its units together, as a decimal number in the receipt's currency (e.g. 34.0 for "4x Spätzle 8,50 = 34,00").
- Keep item names as printed, in the receipt's language, without the quantity prefix.
- "kind" is what the product generically is, in German, singular, without brand, size, weight, variety or packaging, so that the same product on different receipts gets the same kind: "Kalbsleberwurst fein 125g" -> "Leberwurst", "Schweinemett" -> "Mett", "Rügenwalder Teewurst" -> "Teewurst", "Coca-Cola 0,5l" -> "Cola", "Vollkornbrot geschn." -> "Brot", "4x Käsespätzle" -> "Käsespätzle". Expand abbreviations you can read ("H-MILCH 1,5%" -> "Milch").
- "family" is exactly one of these ids:
${PRODUCT_FAMILY_GUIDE}
- Leave out subtotals, taxes/VAT summaries, payment lines, change, tips, and deposit returns. Discounts are not items.
- "total" at the top level is the final amount due printed on the receipt.
- If the image is not a receipt, answer {"merchant": null, "date": null, "total": null, "items": []}.`;

/** The first `{…}` block in a model's answer, fences and chatter around it ignored. */
function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * A money amount as minor units (every supported currency has two decimals),
 * from a number or a string like "3,50", "€ 1.234,50" or "12.5". `null` when
 * it isn't one.
 */
export function toMinor(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }
  if (typeof value !== "string") return null;
  let cleaned = value.replace(/[^\d,.-]/g, "");
  if (!/\d/.test(cleaned)) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  // Whichever separator comes last is the decimal one; the other groups thousands.
  if (lastComma > lastDot) cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  else cleaned = cleaned.replace(/,/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function toQuantity(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : value;
  if (typeof parsed !== "number" || !Number.isFinite(parsed)) return 1;
  // "0,5 l" style fractions are a size, not a count — that line is one unit.
  const rounded = Math.round(parsed);
  return Math.min(Math.max(rounded, 1), MAX_ITEM_QUANTITY);
}

function toName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/\s+/g, " ").trim().slice(0, MAX_ITEM_NAME_LENGTH).trim();
  return name || null;
}

/** Parses a model's answer, or returns `null` when it holds no usable JSON at all. */
export function parseScannedReceipt(text: string): ScannedReceipt | null {
  const json = extractJson(text);
  if (typeof json !== "object" || json === null) return null;
  const raw = json as Record<string, unknown>;

  const items: ScannedItem[] = [];
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  for (const entry of rawItems) {
    if (items.length >= MAX_RECEIPT_ITEMS) break;
    if (typeof entry !== "object" || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const name = toName(item.name);
    const quantity = toQuantity(item.quantity ?? item.qty);
    const totalMinor =
      toMinor(item.total ?? item.price) ??
      (() => {
        const unit = toMinor(item.unitPrice ?? item.unit_price);
        return unit === null ? null : unit * quantity;
      })();
    // A negative line is a deposit return or a discount: the receipt's
    // total already accounts for it, and the editor spreads the difference.
    if (!name || totalMinor === null || totalMinor < 0) continue;
    const product = toProductClass(item.family ?? item.category, item.kind ?? item.type);
    items.push({ name, quantity, totalMinor, product });
  }

  const totalMinor = toMinor(raw.total);
  const date = typeof raw.date === "string" && isIsoDate(raw.date) ? raw.date : null;
  return {
    merchant: toName(raw.merchant),
    date,
    totalMinor: totalMinor !== null && totalMinor > 0 ? totalMinor : null,
    items,
  };
}
