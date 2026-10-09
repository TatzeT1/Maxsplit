/**
 * The data-free half of the question bank: no rows, no `server-only` import,
 * so the pure rules and the server can share it. Everything here either turns
 * a row's decimal strings into exact integers or projects a row onto what a
 * client may see while guessing.
 */
import { ESTIMATE_MAX_MILLI, type Milli } from "@/lib/games/estimate-input";
import { ESTIMATE_BOUNDS, type EstimateQuestion } from "@/lib/games/estimate-bank/types";
import type { EstimatePublicQuestion, EstimateTolerance } from "@/lib/types";

const DECIMAL = /^(\d{1,13})(?:\.(\d{1,3}))?$/;

/**
 * "8848.86" -> 8_848_860. String split on ".", never `parseFloat`: the result
 * is exact. Throws on anything but `/^\d{1,13}(\.\d{1,3})?$/` ("1e3", "1,5",
 * "01.1234") and on a value above `ESTIMATE_MAX_MILLI`.
 */
export function decimalToMilli(value: string): Milli {
  const match = typeof value === "string" ? DECIMAL.exec(value) : null;
  if (!match) throw new RangeError(`not a decimal literal: ${JSON.stringify(value)}`);
  const integer = Number(match[1]);
  // 13 digits can overshoot 2^53 once multiplied: refuse before multiplying.
  if (integer > ESTIMATE_MAX_MILLI / 1000) {
    throw new RangeError(`decimal above the maximum: ${value}`);
  }
  const milli = integer * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  if (milli > ESTIMATE_MAX_MILLI) throw new RangeError(`decimal above the maximum: ${value}`);
  return milli;
}

/** The class key of a row in `ESTIMATE_BOUNDS`: `${unit.symbol}|${scale}|${format}`. */
export function estimateClassKey(row: Pick<EstimateQuestion, "unit" | "scale" | "format">): string {
  return `${row.unit.symbol}|${row.scale}|${row.format}`;
}

/**
 * The public guess range of a row: a table lookup by unit class, so it is the
 * same for every row of a class and says nothing about the answer. Throws on a
 * class without an entry.
 */
export function estimateBoundsFor(row: Pick<EstimateQuestion, "unit" | "scale" | "format">): {
  minMilli: number;
  maxMilli: number;
} {
  const key = estimateClassKey(row);
  const bounds = Object.hasOwn(ESTIMATE_BOUNDS, key) ? ESTIMATE_BOUNDS[key] : undefined;
  if (!bounds) throw new RangeError(`no bounds for the unit class ${JSON.stringify(key)}`);
  return { minMilli: decimalToMilli(bounds.min), maxMilli: decimalToMilli(bounds.max) };
}

/** The true value in milli-units. */
export function rowTruthMilli(row: EstimateQuestion): Milli {
  return decimalToMilli(row.value);
}

/**
 * The row's truth band as the rules use it. interval: the absolute half-width
 * in milli; ratio: PERCENT of the value (at most 1 decimal) as permille.
 * `null` for a row without a tolerance.
 */
export function rowTolerance(row: EstimateQuestion): EstimateTolerance | null {
  if (row.tolerance === undefined || row.tolerance === "") return null;
  const milli = decimalToMilli(row.tolerance);
  if (row.scale === "interval") return { kind: "interval", milli };
  // `milli` counts thousandths of a percent; 1 permille = 0.1 % = 100 of them, so at most one decimal -> whole permille.
  if (milli % 100 !== 0) {
    throw new RangeError(`a ratio tolerance has at most 1 decimal: ${row.tolerance}`);
  }
  return { kind: "ratio", permille: milli / 100 };
}

/**
 * What a client may see while guessing: EXACTLY these keys, copied field by
 * field so a stray property of a row can never travel with it.
 */
export function toPublicQuestion(row: EstimateQuestion): EstimatePublicQuestion {
  return {
    id: row.id,
    category: row.category,
    tone: row.tone,
    text: { de: row.text.de, en: row.text.en },
    unit: { de: row.unit.de, en: row.unit.en, symbol: row.unit.symbol },
    scale: row.scale,
    format: row.format,
    bounds: estimateBoundsFor(row),
  };
}
