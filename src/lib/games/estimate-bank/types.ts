/**
 * Shapes and tiny constants of the Schätzfragen question bank. NO data and NO
 * `server-only` import here: client code may `import type` from this file (the
 * rows themselves live in `rows/*`, behind `index.ts`, which is server-only —
 * see docs/DECISIONS.md ADR-006 for what that does and does not protect).
 */
import type {
  EstimateCategory,
  EstimateFormat,
  EstimateScale,
  EstimateSource,
  EstimateTone,
  EstimateUnit,
} from "@/lib/types";

export const ESTIMATE_CATEGORIES = [
  "geography",
  "nature",
  "animals",
  "body",
  "space",
  "science",
  "technology",
  "history",
  "culture",
  "food",
  "sport",
  "everyday",
] as const satisfies readonly EstimateCategory[];

export const ESTIMATE_TONES = ["standard", "fun"] as const satisfies readonly EstimateTone[];

/** The three letters of a row id (`est-geo-0001`) per category. */
export const CATEGORY_CODES: Record<EstimateCategory, string> = {
  geography: "geo",
  nature: "nat",
  animals: "ani",
  body: "bod",
  space: "spc",
  science: "sci",
  technology: "tec",
  history: "his",
  culture: "cul",
  food: "foo",
  sport: "spo",
  everyday: "evd",
};

/** Decimal literal, no float ever involved: "2962", "8848.86", "0.5". At most 13 integer digits and 3 decimals. */
export type DecimalString = string;

/**
 * The units a row may use: metric only ("" is a counted noun or a year). A new
 * unit is a reviewed change here AND a class in `ESTIMATE_BOUNDS`.
 */
export const ESTIMATE_UNIT_SYMBOLS = [
  "",
  "m",
  "km",
  "cm",
  "mm",
  "µm",
  "nm",
  "m²",
  "km²",
  "ha",
  "m³",
  "l",
  "ml",
  "mg",
  "g",
  "kg",
  "t",
  "s",
  "min",
  "h",
  "d",
  "Hz",
  "kHz",
  "MHz",
  "W",
  "kW",
  "MW",
  "V",
  "N",
  "J",
  "kJ",
  "kcal",
  "Pa",
  "bar",
  "°C",
  "K",
  "%",
  "m/s",
  "km/h",
  "km/s",
  "1/min",
] as const;

export type EstimateUnitSymbol = (typeof ESTIMATE_UNIT_SYMBOLS)[number];

/** A row of the bank, server-only: the question AND its truth. */
export interface EstimateQuestion {
  /** Immutable. `est-<cat3>-<nnnn>`; never reused after retirement (`RETIRED_IDS`). */
  id: string;
  category: EstimateCategory;
  tone: EstimateTone;
  /** Each ends with "?", <= 120 chars, no digits of the answer. */
  text: { de: string; en: string };
  /** Symbol in `ESTIMATE_UNIT_SYMBOLS` (metric only). */
  unit: EstimateUnit;
  scale: EstimateScale;
  /** "year": integer answer, shown without digit grouping and without unit ("1969"); requires scale "interval". */
  format: EstimateFormat;
  /** The true value in `unit`. Non-negative. ratio rows: > 0. */
  value: DecimalString;
  /**
   * Optional truth uncertainty (half-width of the band the truth may lie in).
   * Rare and small by design. scale "interval": absolute, in `unit` ("1" = ±1
   * year). scale "ratio": PERCENT of the value, at most 1 decimal ("2" = ±2 %).
   */
  tolerance?: DecimalString;
  // NO `bounds` field: the public guess range is a function of the unit class
  // (`ESTIMATE_BOUNDS`), so it carries no information about the answer.
  /** Editorial, English, >= 20 chars: exactly what is measured, which convention. Never shown while guessing. */
  definition: string;
  /** The year the value is valid for / was measured (1900..2100). */
  asOf: number;
  /** >= 2, >= 1 primary, distinct hostnames. */
  sources: EstimateSource[];
  /** Editorial, English, optional: caveats, why a tolerance. */
  note?: string;
  /**
   * Who opened both sources and when ("YYYY-MM-DD"). CI checks the format, not
   * the claim: it cannot prove a human looked, but it makes the claim
   * attributable, and the PR that adds rows pastes both URLs per row.
   */
  verified: { by: string; on: string };
}

/** `groups/{g}/estimateRounds/{r}/secrets/{stageIndex}` — server only (read AND write denied by the rules). */
export interface EstimateSecrets {
  stageIndex: number;
  /** The FULL row as played: a snapshot, so a later bank correction can never rewrite what was asked. */
  question: EstimateQuestion;
  /**
   * Hidden guesses until the stage reveals. Online: one key per submit; local:
   * written once at the submit. `by` = the uid whose session submitted it
   * (online: always the player; local: the device owner for every seat).
   */
  guesses: Record<string, { milli: number; at: string; by: string }>;
  createdAt: string;
}

/**
 * Ids that were removed from the bank and must never be reused (seen-sets
 * reference ids). `validateEstimateBank` rejects a row carrying one. Ids only —
 * never a truth.
 */
export const RETIRED_IDS: readonly string[] = [];

/**
 * The public guess range per unit class, keyed `${unit.symbol}|${scale}|${format}`
 * (`estimateClassKey`), as DecimalStrings in the row's unit. A CLOSED table, not
 * a row property: every row of a class exposes identical bounds, so the visible
 * range can neither narrow the answer nor be centred on it. A unit/scale/format
 * combination without an entry is not allowed in v1 (the validator's
 * `bounds-class` rule); a new class is a reviewed code change.
 *
 * Every number is a multiple of 0.001 (milli resolution) and at most 10^12
 * (`ESTIMATE_MAX_MILLI` = 10^15 milli).
 */
export const ESTIMATE_BOUNDS: Readonly<Record<string, { min: DecimalString; max: DecimalString }>> =
  {
    // counted nouns (inhabitants, bones, ...)
    "|ratio|quantity": { min: "1", max: "1000000000000" },
    // lengths
    "m|ratio|quantity": { min: "0.001", max: "10000000" },
    "km|ratio|quantity": { min: "0.01", max: "10000000000" },
    "cm|ratio|quantity": { min: "0.01", max: "10000000" },
    "mm|ratio|quantity": { min: "0.001", max: "1000000" },
    "µm|ratio|quantity": { min: "0.01", max: "100000000" },
    "nm|ratio|quantity": { min: "0.1", max: "1000000000" },
    // areas and volumes. The m³ floor is the smallest value the milli grid can
    // hold (the spec table's 0.000001 has no milli representation).
    "m²|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "km²|ratio|quantity": { min: "0.001", max: "1000000000" },
    "ha|ratio|quantity": { min: "0.001", max: "100000000" },
    "m³|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "l|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "ml|ratio|quantity": { min: "0.001", max: "100000000" },
    // masses
    "mg|ratio|quantity": { min: "0.001", max: "1000000000" },
    "g|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "kg|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "t|ratio|quantity": { min: "0.001", max: "1000000000000" },
    // durations
    "s|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "min|ratio|quantity": { min: "0.001", max: "1000000000" },
    "h|ratio|quantity": { min: "0.001", max: "1000000000" },
    "d|ratio|quantity": { min: "0.001", max: "1000000000" },
    // frequency, power, force, energy, pressure
    "Hz|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "W|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "N|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "J|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "Pa|ratio|quantity": { min: "0.001", max: "1000000000000" },
    "kHz|ratio|quantity": { min: "0.001", max: "1000000000" },
    "MHz|ratio|quantity": { min: "0.001", max: "1000000000" },
    "kW|ratio|quantity": { min: "0.001", max: "1000000000" },
    "MW|ratio|quantity": { min: "0.001", max: "1000000000" },
    "V|ratio|quantity": { min: "0.001", max: "1000000000" },
    "kJ|ratio|quantity": { min: "0.001", max: "1000000000" },
    "kcal|ratio|quantity": { min: "0.001", max: "1000000000" },
    "bar|ratio|quantity": { min: "0.001", max: "1000000000" },
    "K|ratio|quantity": { min: "0.001", max: "1000000000" },
    // speeds and rates
    "m/s|ratio|quantity": { min: "0.001", max: "1000000000" },
    "km/h|ratio|quantity": { min: "0.001", max: "1000000000" },
    "km/s|ratio|quantity": { min: "0.001", max: "1000000" },
    "1/min|ratio|quantity": { min: "0.001", max: "1000000" },
    // interval rows: a temperature, a share, a year
    "°C|interval|quantity": { min: "0", max: "10000" },
    "%|interval|quantity": { min: "0", max: "100" },
    "|interval|year": { min: "0", max: "2100" },
  };
