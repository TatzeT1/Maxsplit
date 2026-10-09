/**
 * `validateEstimateBank`: the function CI runs over every row of the question
 * bank (`bank.test.ts`, with the floors off; `pnpm check:bank-floors`, with
 * them on). Pure and data-free: no `server-only` import, the rows are passed
 * in. Each problem names the rule it breaks (spec D.3) so a content PR's
 * failure reads like a review comment.
 *
 * What it cannot do: prove that a human opened both sources. `verified` makes
 * the claim attributable, nothing more (docs/DECISIONS.md, ADR-006).
 */
import {
  decimalToMilli,
  estimateClassKey,
  estimateBoundsFor,
} from "@/lib/games/estimate-bank/public";
import {
  CATEGORY_CODES,
  ESTIMATE_BOUNDS,
  ESTIMATE_CATEGORIES,
  ESTIMATE_TONES,
  ESTIMATE_UNIT_SYMBOLS,
  RETIRED_IDS,
  type EstimateQuestion,
} from "@/lib/games/estimate-bank/types";

export interface EstimateBankProblem {
  /** The row's id; `"(bank)"` for a problem of the bank as a whole (the floors). */
  id: string;
  /** One of the rule names of spec D.3, e.g. `"id-format"`, `"sources"`, `"blocklist"`. */
  rule: string;
  message: string;
}

export interface ValidateEstimateBankOptions {
  /** Enforce the minimum bank size. Default `true`; off for fixture banks and for the default `pnpm test`. */
  floors?: boolean;
  /** Ids that must never be used again. Default: `RETIRED_IDS`. */
  retiredIds?: readonly string[];
  /** "YYYY-MM-DD", the day `verified.on` must not lie after. Default: today (UTC). */
  today?: string;
}

/** The minimum bank size (`floors: true`). The launch target (250 standard, 60 fun) is not enforced. */
export const ESTIMATE_BANK_FLOORS = {
  standard: 100,
  fun: 30,
  /** Percent of all rows each of `ratio` and `interval` must make up. */
  scaleSharePercent: 25,
  /** Standard rows per category. */
  perCategory: 8,
  /** Percent of all rows that may carry a tolerance. */
  toleranceSharePercent: 15,
} as const;

/** The proper noun the death blocklist would otherwise trip over (the Dead Sea, in its German forms); a closed, reviewed list. */
export const ESTIMATE_ALLOWED_PHRASES = [
  "Totes Meer",
  "Toten Meer",
  // The nominative with the article ("das Tote Meer"), the form a German question actually uses.
  "Tote Meer",
  "Dead Sea",
] as const;

/** The earliest `verified.on`: the day the bank process started. */
const VERIFIED_NOT_BEFORE = "2026-01-01";

const ID_FORMAT = new RegExp(`^est-(${Object.values(CATEGORY_CODES).join("|")})-\\d{4}$`);
const VALUE_FORMAT = /^\d{1,13}(\.\d{1,3})?$/;
const RATIO_TOLERANCE_FORMAT = /^\d{1,2}(\.\d)?$/;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

// --- the content blocklists (spec D.4) -------------------------------------

// Word-bounded, case-insensitive, umlaut-aware: `\b` does not know "ü", so the
// boundaries are spelled with Unicode letter classes and `\w*` is widened.
const WORD_START = "(?<![\\p{L}\\p{N}_])";
const WORD_END = "(?![\\p{L}\\p{N}_])";

function wordRegex(alternatives: string): RegExp {
  const widened = alternatives.replace(/\\w/g, "[\\p{L}\\p{N}_]");
  return new RegExp(`${WORD_START}(?:${widened})${WORD_END}`, "iu");
}

const DE_DEATH = wordRegex(
  "tot|tote|toten|toter|totes|gestorben|verstorben|starb\\w*|sterben|sterbe\\w*|todes\\w*|ums leben|getötet|ermordet|mord\\w*|opfer|massaker|völkermord|holocaust|krieg\\w*|terror\\w*|anschlag|attentat|suizid|selbstmord|hinrichtung|katastroph\\w*|unglück\\w*|erdbeben|tsunami|überschwemmung|hochwasser|hurrikan|taifun|absturz|abgestürzt|explosion|brand|pandemie|seuche|epidemie|hungersnot|lawine|vulkanausbruch|amok|unfall\\w*",
);
const EN_DEATH = wordRegex(
  "dead|death\\w*|died|dies|dying|kill\\w*|fatalit\\w*|casualt\\w*|victims?|murder\\w*|war|wars|warfare|terror\\w*|attack\\w*|massacre|genocide|holocaust|suicide|execution|disaster\\w*|catastroph\\w*|earthquake|tsunami|flood\\w*|hurricane|typhoon|crash\\w*|explosion|pandemic|epidemic|famine|avalanche|eruption|accident\\w*",
);
const DE_PERSON = wordRegex(
  "geboren|alter|vermögen|gehalt|präsident(in)?|kanzler(in)?|könig(in)?|kaiser(in)?|papst|prinz(essin)?|sänger(in)?|schauspieler(in)?|fußballer(in)?|spieler(in)?|trainer(in)?|autor(in)?|erfinder(in)?|wissenschaftler(in)?|künstler(in)?|maler(in)?|komponist(in)?|regisseur(in)?|astronaut(in)?|kosmonaut(in)?",
);
const EN_PERSON = wordRegex(
  "born|age|net worth|salary|president|chancellor|king|queen|emperor|empress|pope|prince|princess|singer|actor|actress|footballer|player|coach|author|inventor|scientist|artist|painter|composer|director|astronaut|cosmonaut",
);

const EN_NON_METRIC = wordRegex(
  "feet|foot|ft|inch(es)?|yards?|yd|miles?|mi|pounds?|lbs?|ounces?|oz|gallons?|gal|mph|fahrenheit|°F",
);
const DE_NON_METRIC = wordRegex("fuß|füße|zoll|yard|meilen?|pfund|unzen?|gallonen?|fahrenheit");

function withoutAllowedPhrases(text: string): string {
  let result = text;
  for (const phrase of ESTIMATE_ALLOWED_PHRASES) {
    result = result.replace(new RegExp(phrase, "gi"), " ");
  }
  return result;
}

// --- numbers inside prose ---------------------------------------------------

const NUMBER_TOKEN = /\d+(?:[.,'’   ]\d+)*/g;

function canonicalDecimal(integer: string, fraction: string): string {
  const int = integer.replace(/^0+(?=\d)/, "") || "0";
  const frac = fraction.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/**
 * Every number a token of `text` could be read as, in either locale: for each
 * run of digit groups, the groups glued together (separators as thousands
 * marks) and, with at least two groups, the last separator as a decimal mark.
 * Canonical form, so "2.962" and "2962" meet.
 */
function numbersIn(text: string): Set<string> {
  const found = new Set<string>();
  for (const token of text.match(NUMBER_TOKEN) ?? []) {
    const groups = token.split(/[^\d]+/).filter((group) => group !== "");
    for (let from = 0; from < groups.length; from++) {
      for (let to = from; to < groups.length; to++) {
        const run = groups.slice(from, to + 1);
        found.add(canonicalDecimal(run.join(""), ""));
        if (run.length > 1) {
          found.add(canonicalDecimal(run.slice(0, -1).join(""), run[run.length - 1]));
        }
      }
    }
  }
  return found;
}

/** The value a text must not spell out: its canonical form and, for a non-integer, its integer part. */
function answerForms(value: string): string[] {
  const [integer, fraction = ""] = value.split(".");
  const forms = [canonicalDecimal(integer, fraction)];
  if (fraction.replace(/0+$/, "") !== "") forms.push(canonicalDecimal(integer, ""));
  return forms;
}

function containsAnswer(text: unknown, value: string): boolean {
  if (typeof text !== "string") return false;
  const numbers = numbersIn(text);
  return answerForms(value).some((form) => numbers.has(form));
}

// --- one row ----------------------------------------------------------------

interface RowContext {
  today: string;
  retiredIds: ReadonlySet<string>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function safeMilli(value: unknown, pattern: RegExp): number | null {
  if (typeof value !== "string" || !pattern.test(value)) return null;
  try {
    return decimalToMilli(value);
  } catch {
    return null;
  }
}

/** `a * factor <= b` without leaving the exact integers (milli values reach 10^15). */
function timesAtMost(a: number, factor: number, b: number): boolean {
  return BigInt(a) * BigInt(factor) <= BigInt(b);
}

/** `a * factor >= b`, exact. */
function timesAtLeast(a: number, factor: number, b: number): boolean {
  return BigInt(a) * BigInt(factor) >= BigInt(b);
}

function verifiedProblem(row: EstimateQuestion, ctx: RowContext): string | null {
  const { verified } = row;
  if (!verified || typeof verified !== "object") return "verified is missing";
  if (typeof verified.by !== "string" || verified.by.trim().length < 2 || verified.by.length > 40) {
    return "verified.by must be 2-40 characters";
  }
  const on = verified.on;
  if (typeof on !== "string" || !DATE_FORMAT.test(on)) return "verified.on must be YYYY-MM-DD";
  const parsed = new Date(`${on}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== on) {
    return `verified.on is not a real date: ${on}`;
  }
  if (on > ctx.today) return `verified.on lies in the future: ${on}`;
  if (on < VERIFIED_NOT_BEFORE) return `verified.on is before ${VERIFIED_NOT_BEFORE}: ${on}`;
  return null;
}

function validateRow(row: EstimateQuestion, ctx: RowContext): EstimateBankProblem[] {
  const id = typeof row.id === "string" ? row.id : "(no id)";
  const problems: EstimateBankProblem[] = [];
  const fail = (rule: string, message: string) => problems.push({ id, rule, message });

  const categoryKnown = (ESTIMATE_CATEGORIES as readonly string[]).includes(row.category);
  const scaleKnown = row.scale === "ratio" || row.scale === "interval";
  const formatKnown = row.format === "quantity" || row.format === "year";

  // id-format (uniqueness and retirement are checked across rows)
  if (typeof row.id !== "string" || !ID_FORMAT.test(row.id)) {
    fail("id-format", "id must look like est-<cat3>-<nnnn>");
  } else if (categoryKnown && row.id.slice(4, 7) !== CATEGORY_CODES[row.category]) {
    fail(
      "id-format",
      `id code ${row.id.slice(4, 7)} does not match category ${row.category} (${CATEGORY_CODES[row.category]})`,
    );
  }
  if (typeof row.id === "string" && ctx.retiredIds.has(row.id)) {
    fail("id-retired", "this id was retired and must never be reused");
  }

  // enums
  if (!categoryKnown) fail("enums", `unknown category: ${String(row.category)}`);
  if (!(ESTIMATE_TONES as readonly string[]).includes(row.tone)) {
    fail("enums", `unknown tone: ${String(row.tone)}`);
  }
  if (!scaleKnown) fail("enums", `unknown scale: ${String(row.scale)}`);
  if (!formatKnown) fail("enums", `unknown format: ${String(row.format)}`);

  // text
  const text = row.text ?? ({} as EstimateQuestion["text"]);
  for (const locale of ["de", "en"] as const) {
    const t = text[locale];
    if (!isNonEmptyString(t)) {
      fail("text", `text.${locale} is empty`);
      continue;
    }
    if (t !== t.trim()) fail("text", `text.${locale} is not trimmed`);
    if (!/^\p{Lu}/u.test(t.trim())) fail("text", `text.${locale} must start with a capital letter`);
    if (!t.trimEnd().endsWith("?")) fail("text", `text.${locale} must end with "?"`);
    if (t.length > 120) fail("text", `text.${locale} is longer than 120 characters`);
    if (/[\r\n]/.test(t)) fail("text", `text.${locale} contains a line break`);
  }
  if (isNonEmptyString(text.de) && text.de === text.en) {
    fail("text", "text.de and text.en are identical (a missing translation?)");
  }

  // unit
  const unit = row.unit ?? ({} as EstimateQuestion["unit"]);
  if (!(ESTIMATE_UNIT_SYMBOLS as readonly string[]).includes(unit.symbol)) {
    fail("unit", `unit.symbol is not an allowed metric symbol: ${JSON.stringify(unit.symbol)}`);
  }
  if (!isNonEmptyString(unit.de) || !isNonEmptyString(unit.en)) {
    fail("unit", "unit.de and unit.en must be non-empty");
  }
  if (row.format === "year" && unit.symbol !== "")
    fail("unit", 'a year row has the unit symbol ""');

  // non-metric
  const nonMetric: [string, unknown, RegExp][] = [
    ["text.de", text.de, DE_NON_METRIC],
    ["unit.de", unit.de, DE_NON_METRIC],
    ["text.en", text.en, EN_NON_METRIC],
    ["unit.en", unit.en, EN_NON_METRIC],
    ["definition", row.definition, EN_NON_METRIC],
  ];
  for (const [field, content, pattern] of nonMetric) {
    const hit = typeof content === "string" ? pattern.exec(content) : null;
    if (hit) fail("non-metric", `${field} uses a non-metric unit: "${hit[0]}"`);
  }

  // decimals
  const valueMilli = safeMilli(row.value, VALUE_FORMAT);
  if (valueMilli === null) {
    fail(
      "decimals",
      `value must be a decimal with at most 3 decimals and at most 10^12: ${JSON.stringify(row.value)}`,
    );
  }
  let toleranceMilli: number | null = null;
  const hasTolerance = row.tolerance !== undefined;
  if (hasTolerance) {
    toleranceMilli = safeMilli(
      row.tolerance,
      row.scale === "ratio" ? RATIO_TOLERANCE_FORMAT : VALUE_FORMAT,
    );
    if (toleranceMilli === null) {
      fail(
        "decimals",
        row.scale === "ratio"
          ? `a ratio tolerance is a percent with at most 1 decimal: ${JSON.stringify(row.tolerance)}`
          : `an interval tolerance is a decimal with at most 3 decimals: ${JSON.stringify(row.tolerance)}`,
      );
    }
  }
  const sane = scaleKnown && formatKnown;

  // ratio-positive
  const ratioZero = row.scale === "ratio" && valueMilli === 0;
  if (ratioZero)
    fail("ratio-positive", "a ratio row needs a value above 0 (zero is for interval rows only)");

  // bounds-class
  let classRange: { min: number; max: number } | null = null;
  if (sane && Object.hasOwn(ESTIMATE_BOUNDS, estimateClassKey(row))) {
    const { minMilli, maxMilli } = estimateBoundsFor(row);
    classRange = { min: minMilli, max: maxMilli };
  } else if (sane) {
    fail("bounds-class", `no bounds for the unit class ${JSON.stringify(estimateClassKey(row))}`);
  }
  if (classRange && valueMilli !== null && !ratioZero) {
    const { min, max } = classRange;
    if (!(min < valueMilli && valueMilli < max)) {
      fail("bounds-class", `value lies outside the class range ${min / 1000}..${max / 1000}`);
    } else if (row.scale === "ratio") {
      if (!timesAtMost(min, 10, valueMilli) || !timesAtMost(valueMilli, 10, max)) {
        fail(
          "bounds-class",
          "the unit does not suit the value: pick a unit within a factor of 10 of the class range",
        );
      }
    } else if (
      !timesAtLeast(valueMilli - min, 50, max - min) ||
      !timesAtLeast(max - valueMilli, 50, max - min)
    ) {
      fail(
        "bounds-class",
        "an interval value must lie at least 2 % of the class range away from both edges",
      );
    }
  }

  // year
  if (row.format === "year") {
    if (row.scale !== "interval") fail("year", 'a year row has scale "interval"');
    if (valueMilli !== null && valueMilli % 1000 !== 0) fail("year", "a year is a whole number");
  }

  // tolerance
  if (hasTolerance && toleranceMilli !== null) {
    if (toleranceMilli <= 0) {
      fail("tolerance", "a tolerance must be above 0 (leave it out for none)");
    } else if (row.scale === "ratio") {
      if (toleranceMilli > 5000) fail("tolerance", "a ratio tolerance is at most 5 %");
    } else if (row.scale === "interval") {
      if (valueMilli !== null && !timesAtMost(toleranceMilli, 50, valueMilli)) {
        fail("tolerance", "an interval tolerance is at most 2 % of the value");
      }
      if (classRange && !timesAtMost(toleranceMilli, 100, classRange.max - classRange.min)) {
        fail("tolerance", "an interval tolerance is at most 1 % of the class range");
      }
      if (row.format === "year" && toleranceMilli > 2000) {
        fail("tolerance", "a year tolerance is at most 2 years");
      }
    }
  }

  // answer-not-in-text
  if (valueMilli !== null && typeof row.value === "string") {
    for (const locale of ["de", "en"] as const) {
      if (containsAnswer(text[locale], row.value)) {
        fail("answer-not-in-text", `text.${locale} spells out the answer`);
      }
    }
  }

  // definition
  if (!isNonEmptyString(row.definition) || row.definition.trim().length < 20) {
    fail("definition", "definition must be at least 20 characters (what exactly is measured)");
  } else if (valueMilli !== null && containsAnswer(row.definition, row.value)) {
    fail("definition", "the definition spells out the answer");
  }

  // asOf
  if (!Number.isInteger(row.asOf) || row.asOf < 1900 || row.asOf > 2100) {
    fail("asOf", "asOf must be a year between 1900 and 2100");
  }

  // sources
  const sources = Array.isArray(row.sources) ? row.sources : [];
  if (sources.length < 2) fail("sources", "at least 2 sources are required");
  if (!sources.some((source) => source?.kind === "primary")) {
    fail("sources", "at least 1 primary source is required");
  }
  const hostnames = new Set<string>();
  const urls = new Set<string>();
  sources.forEach((source, index) => {
    const label = `sources[${index}]`;
    if (!source || typeof source !== "object") {
      fail("sources", `${label} is not an object`);
      return;
    }
    if (source.kind !== "primary" && source.kind !== "secondary") {
      fail("sources", `${label}.kind must be "primary" or "secondary"`);
    }
    if (
      typeof source.label !== "string" ||
      source.label.trim().length < 2 ||
      source.label.length > 80
    ) {
      fail("sources", `${label}.label must be 2-80 characters`);
    }
    if (typeof source.url !== "string" || /\s/.test(source.url)) {
      fail("sources", `${label}.url must be a URL without whitespace`);
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(source.url);
    } catch {
      fail("sources", `${label}.url does not parse: ${source.url}`);
      return;
    }
    if (parsed.protocol !== "https:") fail("sources", `${label}.url must be https`);
    if (!parsed.hostname.includes(".")) fail("sources", `${label}.url needs a real hostname`);
    if (urls.has(source.url)) fail("sources", `${label}.url is listed twice: ${source.url}`);
    urls.add(source.url);
    hostnames.add(parsed.hostname.toLowerCase().replace(/^www\./, ""));
  });
  if (sources.length >= 2 && hostnames.size < 2) {
    fail("sources", "the sources must come from at least 2 distinct hostnames");
  }

  // verified
  const verifiedMessage = verifiedProblem(row, ctx);
  if (verifiedMessage) fail("verified", verifiedMessage);

  // tone-category
  if (
    row.tone === "fun" &&
    categoryKnown &&
    !["animals", "body", "everyday", "food"].includes(row.category)
  ) {
    fail("tone-category", "a fun row belongs to animals, body, everyday or food");
  }

  // blocklist
  const blocklist: [string, unknown, RegExp[]][] = [
    ["text.de", text.de, [DE_DEATH, DE_PERSON]],
    ["unit.de", unit.de, [DE_DEATH, DE_PERSON]],
    ["text.en", text.en, [EN_DEATH, EN_PERSON]],
    ["unit.en", unit.en, [EN_DEATH, EN_PERSON]],
    ["definition", row.definition, [EN_DEATH, EN_PERSON]],
    ["note", row.note, [EN_DEATH, EN_PERSON]],
  ];
  for (const [field, content, patterns] of blocklist) {
    if (typeof content !== "string") continue;
    const scanned = withoutAllowedPhrases(content);
    for (const pattern of patterns) {
      const hit = pattern.exec(scanned);
      if (hit)
        fail(
          "blocklist",
          `${field} mentions "${hit[0]}" (no persons, death or disaster): reword the question`,
        );
    }
  }

  return problems;
}

// --- the bank ----------------------------------------------------------------

/** `[]` = fine. */
export function validateEstimateBank(
  rows: readonly EstimateQuestion[],
  options: ValidateEstimateBankOptions = {},
): EstimateBankProblem[] {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const ctx: RowContext = {
    today,
    retiredIds: new Set(options.retiredIds ?? RETIRED_IDS),
  };
  const problems: EstimateBankProblem[] = [];

  const seenIds = new Set<string>();
  for (const row of rows) {
    problems.push(...validateRow(row, ctx));
    if (typeof row.id === "string") {
      if (seenIds.has(row.id)) {
        problems.push({
          id: row.id,
          rule: "id-unique",
          message: "this id is used by more than one row",
        });
      }
      seenIds.add(row.id);
    }
  }

  if (options.floors ?? true) problems.push(...floorProblems(rows, ctx));
  return problems;
}

function floorProblems(rows: readonly EstimateQuestion[], ctx: RowContext): EstimateBankProblem[] {
  const problems: EstimateBankProblem[] = [];
  const fail = (message: string) => problems.push({ id: "(bank)", rule: "floors", message });

  // Only rows with an attributable verification count towards the floors.
  const counted = rows.filter((row) => verifiedProblem(row, ctx) === null);
  const standard = counted.filter((row) => row.tone === "standard");
  const fun = counted.filter((row) => row.tone === "fun");
  const floors = ESTIMATE_BANK_FLOORS;

  if (standard.length < floors.standard) {
    fail(`${standard.length} verified standard rows, at least ${floors.standard} are required`);
  }
  if (fun.length < floors.fun) {
    fail(`${fun.length} verified fun rows, at least ${floors.fun} are required`);
  }
  if (counted.length > 0) {
    for (const scale of ["ratio", "interval"] as const) {
      const count = counted.filter((row) => row.scale === scale).length;
      if (count * 100 < counted.length * floors.scaleSharePercent) {
        fail(
          `${count} of ${counted.length} rows are ${scale} rows, at least ${floors.scaleSharePercent} % are required`,
        );
      }
    }
    const tolerant = counted.filter((row) => row.tolerance !== undefined).length;
    if (tolerant * 100 > counted.length * floors.toleranceSharePercent) {
      fail(
        `${tolerant} of ${counted.length} rows carry a tolerance, at most ${floors.toleranceSharePercent} % are allowed`,
      );
    }
  }
  for (const category of ESTIMATE_CATEGORIES) {
    const count = standard.filter((row) => row.category === category).length;
    if (count < floors.perCategory) {
      fail(
        `${count} verified standard rows in ${category}, at least ${floors.perCategory} are required`,
      );
    }
  }
  return problems;
}
