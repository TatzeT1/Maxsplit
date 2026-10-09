import { maxPayerCount } from "@/lib/games/payers";
import type {
  EstimateDistance,
  EstimatePublicQuestion,
  EstimateRound,
  EstimateScale,
  EstimateStage,
} from "@/lib/types";

/**
 * Everything of the Schätzfragen rules a CLIENT may import: the constants, the
 * locale-aware number parser, the range check, the formatters, the exact
 * distance comparison, the error text and the small round helpers. Pure — no
 * `Date.now()`, no randomness, no React, no Firestore, no i18n (text comes
 * back structured, the components map it to keys).
 *
 * Client-safe on purpose: this module must NOT import the question bank, and
 * it carries neither the classifier nor the Stechen state machine — those are
 * `estimate-rules.ts`, which only the server and the lazily loaded audit table
 * import (ESLint enforces both, eslint.config.mjs). Every number is an integer
 * in milli-units, compared exactly (BigInt cross-multiplication for ratios;
 * `BigInt(x)` calls only, the tsconfig target has no `10n` literals — and none
 * at module level, so a browser without BigInt only fails when a ratio is
 * actually compared, never on import).
 *
 * It may import the TYPES of `estimate-bank/types`, but not the runtime of
 * `estimate-bank/public`: that module reads its constants from here.
 *
 * Spec section C (C.1 - C.5, C.8 - C.9, C.12).
 */

// ---------------------------------------------------------------------------
// Quantisation and constants (spec C.1)
// ---------------------------------------------------------------------------

/** A value in thousandths of the question's unit: a safe integer in `[0, ESTIMATE_MAX_MILLI]`. */
export type Milli = number;
export type EstimateLocale = "de" | "en";

/** Stamped on every round; `replayEstimateAudit` dispatches on it, so a later rules fix never flips an old verdict. */
export const ESTIMATE_RULES_VERSION = 1;
export const ESTIMATE_MILLI = 1000;
/** Typed integer digits (an input cap; the real ceiling is `ESTIMATE_MAX_MILLI`). */
export const ESTIMATE_MAX_INT_DIGITS = 13;
export const ESTIMATE_MAX_DECIMALS = 3;
/** 10^12 units; below 2^53, so sums like `a + b` stay exact. */
export const ESTIMATE_MAX_MILLI = 10 ** 15;
/** Same cap as luck rounds and brackets. */
export const ESTIMATE_MAX_PLAYERS = 32;
/** Stechfragen after the main question; the lot decides after the third. */
export const ESTIMATE_MAX_STECHEN = 3;
/** 5 min / 15 min / 1 h. */
export const ESTIMATE_ANSWER_WINDOWS_MS = [300_000, 900_000, 3_600_000] as const;
export const ESTIMATE_DEFAULT_WINDOW_MS = 300_000;
/** A guess is accepted until `closesAt` + grace; "Jetzt auswerten" opens at the same instant. */
export const ESTIMATE_GRACE_MS = 5_000;
/** The last call: absent players get this long after the first close. */
export const ESTIMATE_LAST_CALL_MS = 120_000;
/** The `<input maxLength>`. */
export const ESTIMATE_INPUT_MAX_CHARS = 24;
/** Anti-spam only: round creations per member per group. */
export const ESTIMATE_CREATE_CAP = { windowMs: 3_600_000, max: 12 } as const;
/** A finished one-phone round can be claimed by an expense for 2 h. */
export const ESTIMATE_CLAIM_WINDOW_MS = 7_200_000;

/** Non-breaking space: between a number and its unit, so a line never breaks inside "2.962 m". */
const NBSP = "\u00A0";

// ---------------------------------------------------------------------------
// Locale-aware parser (spec C.2)
// ---------------------------------------------------------------------------

export type EstimateParseError =
  "empty" | "chars" | "negative" | "format" | "too-many-decimals" | "too-long";
export type EstimateParse = { ok: true; milli: Milli } | { ok: false; error: EstimateParseError };

/** Everything a typed number may consist of: digits, the two marks and the neutral group separators. */
const ALLOWED_CHARS = /^[0-9.,\u0020\u00A0\u202F'\u2019]+$/;
/** A leading sign: hyphen-minus, U+2212, en dash — and a plus (the answer is non-negative, "no sign"). */
const LEADING_SIGN = /^[-\u2212\u2013+]/;
/** Group separators that belong to no locale (space, NBSP, narrow NBSP, apostrophes): one kind among themselves. */
const NEUTRAL_SEPARATORS = new Set(["\u0020", "\u00A0", "\u202F", "'", "\u2019"]);
const DIGITS_ONLY = /^[0-9]*$/;
const FIRST_GROUP = /^[1-9][0-9]{0,2}$/;
const NEXT_GROUP = /^[0-9]{3}$/;

function parseFail(error: EstimateParseError): EstimateParse {
  return { ok: false, error };
}

/**
 * The digits of an integer part that is a VALID thousands grouping, or `null`:
 * one kind of separator throughout (the neutral ones count as one kind), a first
 * group of 1-3 digits that does not start with `0`, every further group exactly
 * three digits. A grouped number never starts with a zero, so `de "0.125"` is no
 * grouping — it is 0.125.
 */
function ungroup(integerPart: string): string | null {
  const separators = integerPart.replace(/[0-9]/g, "");
  const first = separators.charAt(0);
  for (const c of separators) {
    const sameKind = c === first || (NEUTRAL_SEPARATORS.has(c) && NEUTRAL_SEPARATORS.has(first));
    if (!sameKind) return null;
  }
  const groups = integerPart.split(/[^0-9]/);
  if (!FIRST_GROUP.test(groups[0])) return null;
  for (let i = 1; i < groups.length; i += 1) {
    if (!NEXT_GROUP.test(groups[i])) return null;
  }
  return groups.join("");
}

/**
 * Parses what a player typed, for their locale: `de "1.000"` is 1000, `en "1,000"`
 * is 1000, `de "1.5"` is 1.5. Never rounds silently: what the echo line shows is
 * exactly what is submitted. Never throws.
 */
export function parseEstimateInput(raw: string, locale: EstimateLocale): EstimateParse {
  const text = raw.trim();
  if (text === "") return parseFail("empty");
  if (LEADING_SIGN.test(text)) return parseFail("negative");
  if (!ALLOWED_CHARS.test(text)) return parseFail("chars");

  const decimalMark = locale === "de" ? "," : ".";
  const foreignMark = locale === "de" ? "." : ",";

  // The locale's own decimal mark may occur at most once; what follows is the fraction.
  const pieces = text.split(decimalMark);
  if (pieces.length > 2) return parseFail("format");
  const hasDecimalMark = pieces.length === 2;
  const integerPart = pieces[0];
  let fraction = hasDecimalMark ? pieces[1] : "";
  if (!DIGITS_ONLY.test(fraction)) return parseFail("format");

  let integerDigits: string;
  if (DIGITS_ONLY.test(integerPart)) {
    integerDigits = integerPart;
  } else {
    const grouped = ungroup(integerPart);
    const separators = integerPart.replace(/[0-9]/g, "");
    if (grouped !== null) {
      integerDigits = grouped;
    } else if (!hasDecimalMark && separators === foreignMark) {
      // One lone foreign mark that is no valid grouping ("1.5" in de, "1,5" in en, "0.125", and a trailing "5."):
      // people type what their keyboard shows, so it is the decimal mark.
      const at = integerPart.indexOf(foreignMark);
      integerDigits = integerPart.slice(0, at);
      fraction = integerPart.slice(at + 1);
    } else {
      return parseFail("format");
    }
  }
  if (integerDigits === "" && fraction === "") return parseFail("format");

  integerDigits = integerDigits.replace(/^0+/, "");
  if (integerDigits.length > ESTIMATE_MAX_INT_DIGITS) return parseFail("too-long");
  fraction = fraction.replace(/0+$/, "");
  if (fraction.length > ESTIMATE_MAX_DECIMALS) return parseFail("too-many-decimals");

  const units = integerDigits === "" ? 0 : Number(integerDigits);
  const thousandths = fraction === "" ? 0 : Number(fraction.padEnd(ESTIMATE_MAX_DECIMALS, "0"));
  const maxUnits = ESTIMATE_MAX_MILLI / ESTIMATE_MILLI;
  // Compared on the parts: `units * 1000` of a 13-digit integer is not exact.
  if (units > maxUnits || (units === maxUnits && thousandths > 0)) return parseFail("too-long");
  return { ok: true, milli: units * ESTIMATE_MILLI + thousandths };
}

// ---------------------------------------------------------------------------
// Range / shape check, shared by client and server (spec C.3)
// ---------------------------------------------------------------------------

export type EstimateGuessProblem = "invalid" | "zero" | "not-whole" | "below-min" | "above-max";

/** `null` = the guess is acceptable for this question. The server runs the same function against the stage's public question. */
export function checkEstimateGuess(
  milli: Milli,
  question: Pick<EstimatePublicQuestion, "scale" | "format" | "bounds">,
): EstimateGuessProblem | null {
  if (!Number.isSafeInteger(milli) || milli < 0 || milli > ESTIMATE_MAX_MILLI) return "invalid";
  if (question.scale === "ratio" && milli === 0) return "zero";
  if (question.format === "year" && milli % ESTIMATE_MILLI !== 0) return "not-whole";
  if (milli < question.bounds.minMilli) return "below-min";
  if (milli > question.bounds.maxMilli) return "above-max";
  return null;
}

// ---------------------------------------------------------------------------
// Formatting: pure string arithmetic, no `Intl`, so SSR/CSR/ICU can never disagree (spec C.4)
// ---------------------------------------------------------------------------

/** "1234567" -> "1.234.567" (separator between groups of three, from the right). */
function groupDigits(digits: string, separator: string): string {
  const head = digits.length % 3;
  let out = digits.slice(0, head);
  for (let i = head; i < digits.length; i += 3) {
    out += (out === "" ? "" : separator) + digits.slice(i, i + 3);
  }
  return out;
}

/** Integer digits and an already zero-trimmed fraction, in the locale's marks. */
function joinNumber(
  integerDigits: string,
  fractionDigits: string,
  locale: EstimateLocale,
  grouping: boolean,
): string {
  const integerText = grouping
    ? groupDigits(integerDigits, locale === "de" ? "." : ",")
    : integerDigits;
  if (fractionDigits === "") return integerText;
  return integerText + (locale === "de" ? "," : ".") + fractionDigits;
}

/** A non-negative integer `scaled` read as `scaled / 10^decimals`, zero-trimmed ("140" at 2 -> "1,4"). */
function formatScaled(
  scaled: bigint,
  decimals: number,
  locale: EstimateLocale,
  grouping: boolean,
): string {
  const digits = scaled.toString().padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  return joinNumber(digits.slice(0, cut), digits.slice(cut).replace(/0+$/, ""), locale, grouping);
}

/** "1.000" for 1 000 000 milli in German, "1,234.567" for 1 234 567 in English; the fraction is zero-trimmed. */
export function formatEstimateValue(
  milli: Milli,
  locale: EstimateLocale,
  options?: { grouping?: boolean },
): string {
  if (!Number.isSafeInteger(milli) || milli < 0) {
    throw new RangeError(`not a milli value: ${String(milli)}`);
  }
  const units = Math.floor(milli / ESTIMATE_MILLI);
  const thousandths = milli % ESTIMATE_MILLI;
  return joinNumber(
    String(units),
    thousandths === 0 ? "" : String(thousandths).padStart(3, "0").replace(/0+$/, ""),
    locale,
    options?.grouping !== false,
  );
}

/** The unit's symbol, else its label; `""` for a year. */
export function estimateUnitText(
  question: Pick<EstimatePublicQuestion, "unit" | "format">,
  locale: EstimateLocale,
): string {
  if (question.format === "year") return "";
  return question.unit.symbol || question.unit[locale];
}

/** "2.962 m", "21 °C", "71 %" (German) / "71%" (English), "83.200.000 Einwohner"; a year prints bare ("1969"). */
export function formatEstimateWithUnit(
  milli: Milli,
  question: Pick<EstimatePublicQuestion, "unit" | "format">,
  locale: EstimateLocale,
): string {
  const value = formatEstimateValue(milli, locale, { grouping: question.format !== "year" });
  const unit = estimateUnitText(question, locale);
  if (unit === "") return value;
  const attached = unit === "%" && locale === "en";
  return value + (attached ? "" : NBSP) + unit;
}

/** "= 1.000 m": how the typed number was read. */
export function formatEstimateEcho(
  milli: Milli,
  question: Pick<EstimatePublicQuestion, "unit" | "format">,
  locale: EstimateLocale,
): string {
  return `= ${formatEstimateWithUnit(milli, question, locale)}`;
}

/** The one pattern both readings accept: one separator followed by exactly three digits ("1.000"). */
const AMBIGUOUS = /^([1-9][0-9]{0,2})[.,]([0-9]{3})$/;

/**
 * Non-null only for the one pattern both readings accept (`a<sep>bbb`).
 * `value` = what `parseEstimateInput` returned, `alt` = the other reading,
 * `altInput` = the string that parses to `alt`.
 */
export function estimateAmbiguousReading(
  raw: string,
  locale: EstimateLocale,
): { value: Milli; alt: Milli; altInput: string } | null {
  const match = AMBIGUOUS.exec(raw.trim());
  if (!match) return null;
  const parsed = parseEstimateInput(raw, locale);
  if (!parsed.ok) return null;
  // "a.bbb" is either the decimal a + bbb/1000 (a*1000 + bbb milli) or the thousands abbb (a*1000 + bbb units).
  const asDecimal = Number(match[1]) * ESTIMATE_MILLI + Number(match[2]);
  const asThousands = asDecimal * ESTIMATE_MILLI;
  const alt = parsed.milli === asThousands ? asDecimal : asThousands;
  return {
    value: parsed.milli,
    alt,
    altInput: formatEstimateValue(alt, locale, { grouping: false }),
  };
}

// ---------------------------------------------------------------------------
// Distance and exact comparison (spec C.5)
// ---------------------------------------------------------------------------

function direction(guess: Milli, truth: Milli): "high" | "low" | "exact" {
  return guess > truth ? "high" : guess < truth ? "low" : "exact";
}

function assertMilliValue(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} is not a non-negative integer milli value: ${String(value)}`);
  }
}

/**
 * ratio: the factor `hi / lo` (the log of it is the error, but no logarithm is
 * ever evaluated for a decision); interval: `|guess - truth|`. Throws
 * `RangeError` on a ratio with a value <= 0.
 */
export function estimateDistance(
  scale: EstimateScale,
  guess: Milli,
  truth: Milli,
): EstimateDistance {
  assertMilliValue(guess, "guess");
  assertMilliValue(truth, "truth");
  if (scale === "ratio") {
    if (guess <= 0 || truth <= 0) {
      throw new RangeError("a ratio distance needs a guess and a truth above zero");
    }
    return {
      kind: "ratio",
      hi: Math.max(guess, truth),
      lo: Math.min(guess, truth),
      direction: direction(guess, truth),
    };
  }
  return {
    kind: "interval",
    diffMilli: Math.abs(guess - truth),
    direction: direction(guess, truth),
  };
}

/**
 * -1: `a` is CLOSER, 1: `a` is FURTHER, 0: exactly as far. Ratios compare by
 * BigInt cross-multiplication (`a.hi / a.lo < b.hi / b.lo <=> a.hi*b.lo < b.hi*a.lo`:
 * the log is monotone, so the order of the errors is the order of the factors).
 * Throws if the kinds differ.
 */
export function compareEstimateDistance(a: EstimateDistance, b: EstimateDistance): -1 | 0 | 1 {
  if (a.kind === "interval" && b.kind === "interval") {
    return a.diffMilli < b.diffMilli ? -1 : a.diffMilli > b.diffMilli ? 1 : 0;
  }
  if (a.kind === "ratio" && b.kind === "ratio") {
    const left = BigInt(a.hi) * BigInt(b.lo);
    const right = BigInt(b.hi) * BigInt(a.lo);
    return left < right ? -1 : left > right ? 1 : 0;
  }
  throw new TypeError("cannot compare a ratio distance with an interval distance");
}

// ---------------------------------------------------------------------------
// Display text for an error (spec C.12): structured, i18n lives in the component
// ---------------------------------------------------------------------------

export type EstimateErrorText =
  | { kind: "exact" }
  /** "1,4" -> "Faktor 1,4 zu hoch" */
  | { kind: "factor"; direction: "high" | "low"; factor: string }
  /** "0,4 %" (factor < 1.05, so "Faktor 1" never lies) */
  | { kind: "percent"; direction: "high" | "low"; percent: string }
  /** "17 m" / "6" (+ year units in the UI) */
  | { kind: "interval"; direction: "high" | "low"; amount: string; isYear: boolean }
  /** Last resort of `describeEstimateDistances`. */
  | { kind: "fraction"; direction: "high" | "low"; hi: string; lo: string };

/** More decimals than this is a mistake, not a precision (it would only allocate). */
const MAX_EXTRA_DECIMALS = 40;

function pow10(exponent: number): bigint {
  return BigInt(`1${"0".repeat(exponent)}`);
}

/** `num / den`, half up (both non-negative, `den > 0`). */
function divideHalfUp(num: bigint, den: bigint): bigint {
  const two = BigInt(2);
  return (num * two + den) / (den * two);
}

function assertRatioDistance(hi: number, lo: number): void {
  if (!Number.isSafeInteger(hi) || !Number.isSafeInteger(lo) || lo <= 0 || hi < lo) {
    throw new RangeError(`not a ratio distance: ${String(hi)} / ${String(lo)}`);
  }
}

/**
 * `extraDecimals`: 0 (default) = the default precision; 1, 2, ... = that many
 * decimals more (ratio rows only: interval amounts are exact already).
 *
 * Factor: `hi / lo` rounded half up to 2 decimals below 10, 1 below 100, a whole
 * number from there, zero-trimmed and grouped like any number. A factor below
 * 1.05 is told as percent instead ("0,4 %", at least "0,1 %"): "Faktor 1"
 * would be a lie about a guess that is not exact.
 */
export function describeEstimateDistance(
  distance: EstimateDistance,
  question: Pick<EstimatePublicQuestion, "unit" | "format">,
  locale: EstimateLocale,
  extraDecimals: number = 0,
): EstimateErrorText {
  if (!Number.isInteger(extraDecimals) || extraDecimals < 0 || extraDecimals > MAX_EXTRA_DECIMALS) {
    throw new RangeError(`extraDecimals out of range: ${String(extraDecimals)}`);
  }
  const way = distance.direction;
  if (way === "exact") return { kind: "exact" };

  if (distance.kind === "interval") {
    assertMilliValue(distance.diffMilli, "diffMilli");
    if (question.format === "year") {
      return {
        kind: "interval",
        direction: way,
        amount: formatEstimateValue(distance.diffMilli, locale, { grouping: false }),
        isYear: true,
      };
    }
    return {
      kind: "interval",
      direction: way,
      amount: formatEstimateWithUnit(distance.diffMilli, question, locale),
      isYear: false,
    };
  }

  assertRatioDistance(distance.hi, distance.lo);
  const hi = BigInt(distance.hi);
  const lo = BigInt(distance.lo);
  if (hi * BigInt(100) < lo * BigInt(105)) {
    // Percent, with one decimal by default: tenths of a percent, never below 0,1.
    const decimals = 1 + extraDecimals;
    // (hi - lo) / lo is the excess as a fraction; times 100 it is percent, times 10^decimals it is counted in the last decimal.
    let scaled = divideHalfUp((hi - lo) * pow10(decimals + 2), lo);
    if (scaled < BigInt(1)) scaled = BigInt(1);
    const sign = locale === "de" ? `${NBSP}%` : "%";
    return {
      kind: "percent",
      direction: way,
      percent: formatScaled(scaled, decimals, locale, true) + sign,
    };
  }
  const whole = hi / lo;
  const baseDecimals = whole < BigInt(10) ? 2 : whole < BigInt(100) ? 1 : 0;
  const decimals = baseDecimals + extraDecimals;
  return {
    kind: "factor",
    direction: way,
    factor: formatScaled(divideHalfUp(hi * pow10(decimals), lo), decimals, locale, true),
  };
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a;
  let y = b;
  while (y > BigInt(0)) {
    const rest = x % y;
    x = y;
    y = rest;
  }
  return x;
}

/** The exact factor as a reduced fraction of whole numbers: the last resort when decimals cannot tell two errors apart. */
function fractionText(
  distance: Extract<EstimateDistance, { kind: "ratio" }>,
  locale: EstimateLocale,
): EstimateErrorText {
  const way = distance.direction;
  if (way === "exact") return { kind: "exact" };
  const hi = BigInt(distance.hi);
  const lo = BigInt(distance.lo);
  const divisor = gcd(hi, lo);
  const separator = locale === "de" ? "." : ",";
  return {
    kind: "fraction",
    direction: way,
    hi: groupDigits((hi / divisor).toString(), separator),
    lo: groupDigits((lo / divisor).toString(), separator),
  };
}

/** How many decimals more a ratio row may be given before the exact fraction is printed instead. */
const MAX_EXTRA_FACTOR = 12;
const MAX_EXTRA_PERCENT = 6;

/** What the reader sees of an error, without the direction: two rows with equal keys look equally far off. */
function magnitudeKey(text: EstimateErrorText): string {
  switch (text.kind) {
    case "exact":
      return "exact";
    case "factor":
      return `factor:${text.factor}`;
    case "percent":
      return `percent:${text.percent}`;
    case "interval":
      return `interval:${text.amount}`;
    case "fraction":
      return `fraction:${text.hi}/${text.lo}`;
  }
}

interface DescribeGroup {
  /** First and last row index (a run of rows with exactly equal distances: exact ties print alike). */
  from: number;
  to: number;
  distance: EstimateDistance;
  extra: number;
  fraction: boolean;
}

/**
 * One text per row of a ranking (ranked order, furthest first). Prints more
 * digits where the default would hide the margin that decided who pays, so two
 * adjacent rows never print equal text but rank differently: truth 1000 with
 * guesses 700 and 1430 would both read "Faktor 1,43" at two decimals, although
 * 1,428571... is closer than 1,43. Both rows get one more decimal until they
 * differ (factor up to 12 more, percent up to 6); only if they still agree at
 * the cap both print the exact fraction. Exact ties print the same text.
 */
export function describeEstimateDistances(
  rows: readonly { uid: string; distance: EstimateDistance | null }[],
  question: Pick<EstimatePublicQuestion, "unit" | "format">,
  locale: EstimateLocale,
): Record<string, EstimateErrorText | null> {
  const groups: DescribeGroup[] = [];
  const groupOf: (DescribeGroup | null)[] = rows.map(() => null);
  rows.forEach((row, index) => {
    if (row.distance === null) return;
    const last = groups[groups.length - 1];
    if (
      last &&
      last.to === index - 1 &&
      last.distance.kind === row.distance.kind &&
      compareEstimateDistance(last.distance, row.distance) === 0
    ) {
      last.to = index;
      groupOf[index] = last;
      return;
    }
    const group: DescribeGroup = {
      from: index,
      to: index,
      distance: row.distance,
      extra: 0,
      fraction: false,
    };
    groups.push(group);
    groupOf[index] = group;
  });

  const textOf = (group: DescribeGroup, distance: EstimateDistance): EstimateErrorText =>
    group.fraction && distance.kind === "ratio"
      ? fractionText(distance, locale)
      : describeEstimateDistance(distance, question, locale, group.extra);

  let changed = true;
  while (changed) {
    changed = false;
    for (let g = 0; g + 1 < groups.length; g += 1) {
      const a = groups[g];
      const b = groups[g + 1];
      if (b.from !== a.to + 1 || a.distance.kind !== b.distance.kind) continue;
      if (compareEstimateDistance(a.distance, b.distance) === 0) continue;
      if (magnitudeKey(textOf(a, a.distance)) !== magnitudeKey(textOf(b, b.distance))) continue;
      // Different distances, same words: one more decimal for both.
      const cap =
        describeEstimateDistance(a.distance, question, locale).kind === "percent"
          ? MAX_EXTRA_PERCENT
          : MAX_EXTRA_FACTOR;
      let raised = false;
      for (const group of [a, b]) {
        if (!group.fraction && group.extra < cap) {
          group.extra += 1;
          raised = true;
        }
      }
      if (!raised) {
        a.fraction = true;
        b.fraction = true;
      }
      changed = true;
    }
  }

  const texts: Record<string, EstimateErrorText | null> = {};
  rows.forEach((row, index) => {
    const group = groupOf[index];
    texts[row.uid] = row.distance === null || group === null ? null : textOf(group, row.distance);
  });
  return texts;
}

// ---------------------------------------------------------------------------
// Small helpers (spec C.9, C.8)
// ---------------------------------------------------------------------------

/** `maxPayerCount(poolSize)`: pool - 1, at least 1. */
export function maxEstimateLoserCount(poolSize: number): number {
  return maxPayerCount(poolSize);
}

/** `Number.isInteger(k) && k >= 1 && 2 <= poolSize <= ESTIMATE_MAX_PLAYERS && k <= poolSize - 1`. */
export function isValidEstimateCount(k: number, poolSize: number): boolean {
  return (
    Number.isInteger(k) &&
    Number.isInteger(poolSize) &&
    k >= 1 &&
    poolSize >= 2 &&
    poolSize <= ESTIMATE_MAX_PLAYERS &&
    k <= poolSize - 1
  );
}

/** Online, a player guesses only for themself: true iff the round is running, the last stage is guessing and `uid` is one of its contenders. */
export function canGuess(round: Pick<EstimateRound, "status" | "stages">, uid: string): boolean {
  if (round.status !== "running") return false;
  const last = round.stages[round.stages.length - 1];
  return !!last && last.status === "guessing" && last.contenders.includes(uid);
}

/** `Date.parse(closesAt) + ESTIMATE_GRACE_MS`; `null` if the stage has no deadline (or none that can be read). */
export function guessDeadlineMs(stage: Pick<EstimateStage, "closesAt">): number | null {
  if (stage.closesAt === null) return null;
  const closes = Date.parse(stage.closesAt);
  return Number.isNaN(closes) ? null : closes + ESTIMATE_GRACE_MS;
}

/** Guessing, a deadline and `nowMs >= deadline`. */
export function isStageTimedOut(
  stage: Pick<EstimateStage, "closesAt" | "status">,
  nowMs: number,
): boolean {
  if (stage.status !== "guessing") return false;
  const deadline = guessDeadlineMs(stage);
  return deadline !== null && nowMs >= deadline;
}

/** Contenders without a locked guess. */
export function absentContenders(stage: Pick<EstimateStage, "contenders" | "submitted">): string[] {
  const submitted = new Set(stage.submitted);
  return stage.contenders.filter((uid) => !submitted.has(uid));
}

/** What "Jetzt auswerten" would do right now. The server and the confirmation dialog read the same function. */
export type CloseAction = "wait" | "last-call" | "reveal";

/** Not timed out -> "wait"; timed out, someone absent, `lastCallAt === null` -> "last-call"; otherwise "reveal". */
export function nextCloseAction(
  stage: Pick<EstimateStage, "closesAt" | "status" | "contenders" | "submitted" | "lastCallAt">,
  nowMs: number,
): CloseAction {
  if (!isStageTimedOut(stage, nowMs)) return "wait";
  if (stage.lastCallAt === null && absentContenders(stage).length > 0) return "last-call";
  return "reveal";
}

/** The payers decided so far in booking order: every stage's `reveal.payers`, then the last stage's `lotPayers`. */
export function roundPayers(stages: readonly EstimateStage[]): string[] {
  const payers: string[] = [];
  for (const stage of stages) {
    if (stage.reveal) payers.push(...stage.reveal.payers);
  }
  const last = stages[stages.length - 1];
  if (last?.reveal?.lotPayers) payers.push(...last.reveal.lotPayers);
  return payers;
}

/** True once the last stage is revealed with `next !== "stechen"`. */
export function isEstimateDecided(round: Pick<EstimateRound, "stages">): boolean {
  const last = round.stages[round.stages.length - 1];
  return !!last && last.reveal !== null && last.reveal.next !== "stechen";
}
