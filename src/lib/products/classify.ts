import "server-only";

// Classifies texts — an expense's description, a receipt line typed by
// hand — into a ProductClass with the same free models that read receipts
// (lib/receipt/scan.ts). Several texts go in one request: the free quotas
// count requests, not tokens, and catching up on a group's history would
// otherwise spend a day's quota on one click.

import { askModels, ModelLimitError, type AskOptions } from "@/lib/receipt/scan";
import type { ProductClass } from "@/lib/types";
import { PRODUCT_FAMILY_GUIDE, toProductClass } from "./products";

/** Texts per request. A long answer from a free model is where it starts to drop entries. */
export const CLASSIFY_BATCH_SIZE = 60;

/** A text to classify, with the expense category a member picked as a hint. */
export interface ClassifyEntry {
  text: string;
  /** e.g. "restaurant" — tells "Krone" the inn from "Krone" the beer. */
  hint?: string | null;
}

function classifyPrompt(entries: readonly ClassifyEntry[]): string {
  const lines = entries
    .map((entry, index) => {
      const text = JSON.stringify(entry.text);
      return entry.hint ? `${index}: ${text} (category: ${entry.hint})` : `${index}: ${text}`;
    })
    .join("\n");
  return `You classify what money in a shared household or group of friends was spent on. Each numbered line is either an expense's description ("Miete Oktober", "Edeka", "Pizza Freitag") or one line of a shop receipt ("Schweinemett", "H-MILCH 1,5%"). Answer with JSON only, no prose, in exactly this shape:
{"items": [{"i": integer, "family": string, "kind": string}]}
Rules:
- One entry per numbered line, "i" being its number.
- "kind" is what it generically is, in German, singular, without brand, size, weight, variety, date or person names, so that the same thing always gets the same kind: "Kalbsleberwurst fein" -> "Leberwurst", "Schweinemett" -> "Mett", "Miete Oktober" -> "Miete", "Edeka" -> "Supermarkt-Einkauf", "Pizza Freitag" -> "Pizza", "Tanken Aral" -> "Tanken".
- "family" is exactly one of these ids:
${PRODUCT_FAMILY_GUIDE}

${lines}`;
}

/**
 * The model's answer as one ProductClass (or `null`) per entry, in order —
 * or `null` when the answer holds no usable entry at all, so the next
 * provider is asked.
 */
export function parseClassification(text: string, count: number): (ProductClass | null)[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const items = (json as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return null;
  const result: (ProductClass | null)[] = Array.from({ length: count }, () => null);
  for (const entry of items) {
    if (typeof entry !== "object" || entry === null) continue;
    const { i, family, kind } = entry as Record<string, unknown>;
    const index = typeof i === "string" ? Number(i) : i;
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= count) continue;
    result[index as number] ??= toProductClass(family, kind);
  }
  return result.some((product) => product !== null) ? result : null;
}

/**
 * Classifies `entries`, CLASSIFY_BATCH_SIZE per request. An entry the model
 * left out (or a batch nobody answered, or one the group's AI allowance no
 * longer covered) comes back `null`: unclassified, for the next try.
 */
export async function classifyEntries(
  entries: readonly ClassifyEntry[],
  options: AskOptions = {},
): Promise<(ProductClass | null)[]> {
  const result: (ProductClass | null)[] = [];
  for (let start = 0; start < entries.length; start += CLASSIFY_BATCH_SIZE) {
    const batch = entries.slice(start, start + CLASSIFY_BATCH_SIZE);
    let answer: (ProductClass | null)[] | null;
    try {
      answer = await askModels(
        { prompt: classifyPrompt(batch) },
        (text) => parseClassification(text, batch.length),
        "product-classify",
        options,
        batch.map((entry) => entry.text),
      );
    } catch (error) {
      if (!(error instanceof ModelLimitError)) throw error;
      result.push(...entries.slice(start).map(() => null));
      break;
    }
    result.push(...(answer ?? batch.map(() => null)));
  }
  return result;
}
