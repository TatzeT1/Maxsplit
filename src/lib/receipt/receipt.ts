// A receipt split: the bill's line items, each unit of each line handed to
// the people who had it, and the per-person amounts that follow. Shared by
// the receipt editor (which shows the amounts as you assign) and the Server
// Action (which recomputes them and refuses a booking that disagrees) —
// "define once, used by both sides that must agree".

import { distributeByWeights } from "@/lib/money/split";
import type { ExpenseReceipt, ReceiptItem } from "@/lib/types";

/** Line items on one receipt. A long supermarket receipt fits; a pasted novel doesn't. */
export const MAX_RECEIPT_ITEMS = 80;

/** Units on one line — "30x Bier" is a long night, not a typo for 3. */
export const MAX_ITEM_QUANTITY = 30;

/** A line item's name. Receipts abbreviate; 60 covers the longest real ones. */
export const MAX_ITEM_NAME_LENGTH = 60;

/**
 * The receipt photo as a data URL, in characters. Server Actions refuse a
 * request body over 1 MB, so the client scales the photo down until it fits
 * this, leaving room for the rest of the request.
 */
export const MAX_RECEIPT_IMAGE_CHARS = 900_000;

/** Photos a user may have read per day — the free model quotas are small and shared by everyone. */
export const RECEIPT_SCANS_PER_DAY = 25;

/** The image types the client sends (it re-encodes every photo as JPEG). */
export const RECEIPT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** Sum of the line totals: what the receipt costs before tip, discount or rounding. */
export function receiptItemsTotal(items: readonly Pick<ReceiptItem, "totalMinor">[]): number {
  return items.reduce((sum, item) => sum + item.totalMinor, 0);
}

/**
 * What each person owes for a receipt booked at `amountMinor`.
 *
 * Each line is split by how much of it each person had: a unit counts in
 * full for whoever had it alone, by half for each of two who shared it,
 * and so on (4x Spätzle, two Anna's, one Ben's, one shared by Ben and
 * Carl → 4 : 3 : 1 of 34,00). The line is rounded once, as a whole — not
 * unit by unit, which handed every unit's odd cent to the same people
 * (6 yoghurts at 0,50 for three: 17/17/16 cents six times over left the
 * third person 6 cents short). The difference between `amountMinor` and
 * the line totals — a tip when positive, a discount when negative — is
 * then spread in proportion to what each person had. Every step is the
 * largest-remainder method, so the result always sums to `amountMinor`
 * exactly.
 *
 * Throws when a unit has nobody, the lines add up to nothing, or the
 * discount would be the whole bill: there is no fair split to compute.
 */
export function allocateReceipt(
  amountMinor: number,
  items: readonly ReceiptItem[],
): Record<string, number> {
  const subtotals: Record<string, number> = {};
  for (const item of items) {
    if (item.units.length === 0) throw new Error("A receipt item needs at least one unit");
    if (item.units.some((unit) => unit.uids.length === 0)) {
      throw new Error("Every unit needs at least one person");
    }
    // Integer weights: a unit shared by n people is worth `common / n` to
    // each, where `common` is a multiple of every n on the line (n ≤ the
    // group's size, so this stays small).
    const common = item.units.reduce((acc, unit) => lcm(acc, unit.uids.length), 1);
    const weights: Record<string, number> = {};
    for (const unit of item.units) {
      for (const uid of unit.uids) {
        weights[uid] = (weights[uid] ?? 0) + common / unit.uids.length;
      }
    }
    for (const [uid, share] of Object.entries(distributeByWeights(item.totalMinor, weights))) {
      subtotals[uid] = (subtotals[uid] ?? 0) + share;
    }
  }

  const itemsTotal = receiptItemsTotal(items);
  if (itemsTotal <= 0) throw new Error("The receipt items add up to nothing");
  const adjustment = amountMinor - itemsTotal;
  if (-adjustment >= itemsTotal) throw new Error("The discount covers the whole receipt");

  const weighted = Object.fromEntries(Object.entries(subtotals).filter(([, amount]) => amount > 0));
  const result = { ...subtotals };
  if (adjustment !== 0) {
    // A discount below the items total never takes anyone below zero: each
    // share is under that person's subtotal (see distributeByWeights).
    const spread = distributeByWeights(Math.abs(adjustment), weighted);
    for (const [uid, share] of Object.entries(spread)) {
      result[uid] += Math.sign(adjustment) * share;
    }
  }
  return Object.fromEntries(Object.entries(result).filter(([, amount]) => amount > 0));
}

/**
 * Shape checks on a receipt a client sends with an expense — every field,
 * since a bad one would break the detail view for the whole group. Returns
 * an error code, or `null` when the receipt is well-formed and every person
 * on it is in `memberIds`.
 */
export function validateReceipt(
  receipt: unknown,
  memberIds: ReadonlySet<string>,
): "invalid-receipt" | null {
  if (typeof receipt !== "object" || receipt === null) return "invalid-receipt";
  const { items } = receipt as Partial<ExpenseReceipt>;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_RECEIPT_ITEMS) {
    return "invalid-receipt";
  }
  for (const item of items as unknown[]) {
    if (!isValidItem(item, memberIds)) return "invalid-receipt";
  }
  return null;
}

function isValidItem(value: unknown, memberIds: ReadonlySet<string>): boolean {
  if (typeof value !== "object" || value === null) return false;
  const { name, quantity, totalMinor, units } = value as Partial<ReceiptItem>;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_ITEM_NAME_LENGTH) return false;
  if (!Number.isInteger(quantity) || quantity! < 1 || quantity! > MAX_ITEM_QUANTITY) return false;
  if (!Number.isSafeInteger(totalMinor) || totalMinor! < 0) return false;
  if (!Array.isArray(units) || units.length !== quantity) return false;
  return units.every((unit: unknown) => {
    const uids = (unit as { uids?: unknown } | null)?.uids;
    return (
      Array.isArray(uids) &&
      uids.length > 0 &&
      new Set(uids).size === uids.length &&
      uids.every((uid) => typeof uid === "string" && memberIds.has(uid))
    );
  });
}

/** Exactly the stored fields, in a fixed order — never whatever else a request carried along. */
export function normalizeReceipt(receipt: ExpenseReceipt): ExpenseReceipt {
  return {
    items: receipt.items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity,
      totalMinor: item.totalMinor,
      units: item.units.map((unit) => ({ uids: [...unit.uids] })),
    })),
  };
}
