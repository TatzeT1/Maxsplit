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

type TextLocale = "de" | "en";

/** `canonical * 10^exponent` as a canonical decimal string ("3.1", 9 -> "3100000000"). */
function shiftDecimal(canonical: string, exponent: number): string {
  const [integer, fraction = ""] = canonical.split(".");
  const digits = integer + fraction;
  const point = integer.length + exponent;
  if (point >= digits.length)
    return canonicalDecimal(digits + "0".repeat(point - digits.length), "");
  return canonicalDecimal(digits.slice(0, point), digits.slice(point));
}

/**
 * A scale word right after a digit token ("3,1 Mrd.", "2.5 million"). Only the
 * unambiguous ones: "m", "k" and "bn" also mean metre, kilo and billion in a
 * unit. German "Billion" is 10^12, English "billion" 10^9.
 */
const SCALE_AFTER_DIGITS: Record<TextLocale, [string, number][]> = {
  de: [
    ["milliarden?", 9],
    ["mrd", 9],
    ["millionen?", 6],
    ["mio", 6],
    ["billionen?", 12],
    ["tausend", 3],
    ["tsd", 3],
  ],
  en: [
    ["billions?", 9],
    ["millions?", 6],
    ["trillions?", 12],
    ["thousand", 3],
  ],
};

/** Every value a digit token followed by a scale word could stand for ("3,1 Mrd." -> 3100000000). */
function scaledNumbersIn(text: string, locale: TextLocale): Set<string> {
  const found = new Set<string>();
  for (const [scale, exponent] of SCALE_AFTER_DIGITS[locale]) {
    const pattern = new RegExp(
      `(\\d+(?:[.,'’\\u00A0\\u202F ]\\d+)*)\\s*${scale}(?![\\p{L}])`,
      "giu",
    );
    for (const match of text.matchAll(pattern)) {
      const groups = match[1].split(/[^\d]+/).filter((group) => group !== "");
      const forms = [canonicalDecimal(groups.join(""), "")];
      if (groups.length > 1) {
        forms.push(canonicalDecimal(groups.slice(0, -1).join(""), groups[groups.length - 1]));
      }
      for (const form of forms) found.add(shiftDecimal(form, exponent));
    }
  }
  return found;
}

// A number spelled in words ("achthundertsechsundsiebzig", "eight hundred seventy-six").
type NumberAtom =
  | { kind: "unit" | "tens"; value: number }
  | { kind: "hundred" }
  | { kind: "scale"; value: number }
  | { kind: "and" };

const EN_ATOMS: Record<string, NumberAtom> = {
  and: { kind: "and" },
  hundred: { kind: "hundred" },
  thousand: { kind: "scale", value: 1e3 },
  million: { kind: "scale", value: 1e6 },
  billion: { kind: "scale", value: 1e9 },
  trillion: { kind: "scale", value: 1e12 },
};
[
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
].forEach((word, value) => (EN_ATOMS[word] = { kind: "unit", value }));
["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"].forEach(
  (word, index) => (EN_ATOMS[word] = { kind: "tens", value: 20 + 10 * index }),
);

const DE_ATOMS: Record<string, NumberAtom> = {
  und: { kind: "and" },
  hundert: { kind: "hundred" },
  tausend: { kind: "scale", value: 1e3 },
  million: { kind: "scale", value: 1e6 },
  millionen: { kind: "scale", value: 1e6 },
  mio: { kind: "scale", value: 1e6 },
  milliarde: { kind: "scale", value: 1e9 },
  milliarden: { kind: "scale", value: 1e9 },
  mrd: { kind: "scale", value: 1e9 },
  billion: { kind: "scale", value: 1e12 },
  billionen: { kind: "scale", value: 1e12 },
  eins: { kind: "unit", value: 1 },
  eine: { kind: "unit", value: 1 },
  zwo: { kind: "unit", value: 2 },
  fuenf: { kind: "unit", value: 5 },
  zwoelf: { kind: "unit", value: 12 },
  fuenfzehn: { kind: "unit", value: 15 },
  dreissig: { kind: "tens", value: 30 },
  fuenfzig: { kind: "tens", value: 50 },
};
[
  "null",
  "ein",
  "zwei",
  "drei",
  "vier",
  "fünf",
  "sechs",
  "sieben",
  "acht",
  "neun",
  "zehn",
  "elf",
  "zwölf",
  "dreizehn",
  "vierzehn",
  "fünfzehn",
  "sechzehn",
  "siebzehn",
  "achtzehn",
  "neunzehn",
].forEach((word, value) => (DE_ATOMS[word] = { kind: "unit", value }));
["zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"].forEach(
  (word, index) => (DE_ATOMS[word] = { kind: "tens", value: 20 + 10 * index }),
);
const DE_ATOM_WORDS = Object.keys(DE_ATOMS).sort((a, b) => b.length - a.length);

/** A German compound ("sechsundsiebzig", "zweitausendvierhundert") as atoms, or `null` if any part is no number word. */
function germanAtoms(word: string, from = 0): NumberAtom[] | null {
  if (from === word.length) return [];
  for (const candidate of DE_ATOM_WORDS) {
    if (!word.startsWith(candidate, from)) continue;
    const rest = germanAtoms(word, from + candidate.length);
    if (rest) return [DE_ATOMS[candidate], ...rest];
  }
  return null;
}

function atomsOf(word: string, locale: TextLocale): NumberAtom[] | null {
  if (locale === "en") return Object.hasOwn(EN_ATOMS, word) ? [EN_ATOMS[word]] : null;
  return word.length <= 40 ? germanAtoms(word) : null;
}

/** `hundred`/`thousand`/... after a partial value, in the usual left-to-right reading. */
function runValue(atoms: readonly NumberAtom[]): number {
  let total = 0;
  let current = 0;
  for (const atom of atoms) {
    if (atom.kind === "unit" || atom.kind === "tens") current += atom.value;
    else if (atom.kind === "hundred") current = (current === 0 ? 1 : current) * 100;
    else if (atom.kind === "scale") {
      total += (current === 0 ? 1 : current) * atom.value;
      current = 0;
    }
  }
  return total + current;
}

/** The numbers a text spells in words: every maximal run of number words, read as one number. */
function wordNumbersIn(text: string, locale: TextLocale): Set<string> {
  const found = new Set<string>();
  let run: NumberAtom[] = [];
  const flush = () => {
    const meaningful = run.filter((atom) => atom.kind !== "and");
    // A lone "one"/"ein"/"eine" is an article or a pronoun far more often than an answer.
    const lone = meaningful.length === 1 && runValue(meaningful) === 1;
    if (meaningful.length > 0 && !lone) found.add(String(runValue(meaningful)));
    run = [];
  };
  for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
    const atoms = atomsOf(word, locale);
    if (atoms === null) {
      flush();
      continue;
    }
    for (const atom of atoms) {
      const previous = run[run.length - 1];
      const startsNewNumber =
        atom.kind === "unit" && previous !== undefined && previous.kind === "unit";
      const strayConnector = atom.kind === "and" && run.length === 0;
      if (startsNewNumber) flush();
      if (!strayConnector) run.push(atom);
    }
  }
  flush();
  return found;
}

/**
 * True iff `text` gives away `value`: as digits (either locale's grouping), as
 * digits plus a scale word ("3,1 Mrd."), or — for the question text — spelled in
 * words. A reviewer still has to read it: this catches the plain cases.
 */
function containsAnswer(
  text: unknown,
  value: string,
  locale: TextLocale,
  options: { words: boolean },
): boolean {
  if (typeof text !== "string") return false;
  const numbers = numbersIn(text);
  for (const scaled of scaledNumbersIn(text, locale)) numbers.add(scaled);
  if (options.words) for (const word of wordNumbersIn(text, locale)) numbers.add(word);
  return answerForms(value).some((form) => numbers.has(form));
}

// --- unit labels -------------------------------------------------------------

const lower = (...labels: string[]) => labels;

/**
 * The labels (lower case) a symbol may carry, German and English: the symbol
 * drives the bounds and the display, the label drives what the player reads,
 * so "km" with "metres" is a content bug. "" (a counted noun, a year) is free.
 * A new symbol in `ESTIMATE_UNIT_SYMBOLS` needs a line here (a test pins it).
 */
export const ESTIMATE_UNIT_LABELS: Record<string, { de: string[]; en: string[] }> = {
  m: { de: lower("meter"), en: lower("metres", "meters", "metre", "meter") },
  km: { de: lower("kilometer"), en: lower("kilometres", "kilometers", "kilometre", "kilometer") },
  cm: {
    de: lower("zentimeter"),
    en: lower("centimetres", "centimeters", "centimetre", "centimeter"),
  },
  mm: {
    de: lower("millimeter"),
    en: lower("millimetres", "millimeters", "millimetre", "millimeter"),
  },
  µm: {
    de: lower("mikrometer"),
    en: lower("micrometres", "micrometers", "micrometre", "micrometer", "microns"),
  },
  nm: {
    de: lower("nanometer"),
    en: lower("nanometres", "nanometers", "nanometre", "nanometer"),
  },
  "m²": {
    de: lower("quadratmeter"),
    en: lower("square metres", "square meters", "square metre", "square meter"),
  },
  "km²": {
    de: lower("quadratkilometer"),
    en: lower("square kilometres", "square kilometers", "square kilometre", "square kilometer"),
  },
  ha: { de: lower("hektar"), en: lower("hectares", "hectare") },
  "m³": {
    de: lower("kubikmeter"),
    en: lower("cubic metres", "cubic meters", "cubic metre", "cubic meter"),
  },
  l: { de: lower("liter"), en: lower("litres", "liters", "litre", "liter") },
  ml: {
    de: lower("milliliter"),
    en: lower("millilitres", "milliliters", "millilitre", "milliliter"),
  },
  mg: { de: lower("milligramm"), en: lower("milligrams", "milligram") },
  g: { de: lower("gramm"), en: lower("grams", "gram") },
  kg: { de: lower("kilogramm"), en: lower("kilograms", "kilogram") },
  t: { de: lower("tonne", "tonnen"), en: lower("tonnes", "tonne", "metric tons") },
  s: { de: lower("sekunde", "sekunden"), en: lower("seconds", "second") },
  min: { de: lower("minute", "minuten"), en: lower("minutes", "minute") },
  h: {
    de: lower("stunde", "stunden", "stunden pro tag"),
    en: lower("hours", "hour", "hours per day"),
  },
  d: { de: lower("tag", "tage", "erdentage"), en: lower("days", "day", "earth days") },
  Hz: { de: lower("hertz"), en: lower("hertz") },
  kHz: { de: lower("kilohertz"), en: lower("kilohertz") },
  MHz: { de: lower("megahertz"), en: lower("megahertz") },
  W: { de: lower("watt"), en: lower("watts", "watt") },
  kW: { de: lower("kilowatt"), en: lower("kilowatts", "kilowatt") },
  MW: { de: lower("megawatt"), en: lower("megawatts", "megawatt") },
  V: { de: lower("volt"), en: lower("volts", "volt") },
  N: { de: lower("newton"), en: lower("newtons", "newton") },
  J: { de: lower("joule"), en: lower("joules", "joule") },
  kJ: { de: lower("kilojoule"), en: lower("kilojoules", "kilojoule") },
  kcal: {
    de: lower("kilokalorien", "kilokalorie", "kcal"),
    en: lower("kilocalories", "kilocalorie", "kcal"),
  },
  Pa: { de: lower("pascal"), en: lower("pascals", "pascal") },
  bar: { de: lower("bar"), en: lower("bar") },
  "°C": { de: lower("grad celsius"), en: lower("degrees celsius", "degree celsius") },
  K: { de: lower("kelvin"), en: lower("kelvin") },
  "%": { de: lower("prozent"), en: lower("percent", "per cent") },
  "m/s": {
    de: lower("meter pro sekunde"),
    en: lower("metres per second", "meters per second"),
  },
  "km/h": {
    de: lower("kilometer pro stunde"),
    en: lower("kilometres per hour", "kilometers per hour"),
  },
  "km/s": {
    de: lower("kilometer pro sekunde"),
    en: lower("kilometres per second", "kilometers per second"),
  },
  // "<thing> per minute" is any rate (beats, breaths, revolutions): the suffix is checked in `unitLabelProblem`.
  "1/min": { de: lower("pro minute"), en: lower("per minute") },
};

/** Lower case, single spaces, a trailing explanation in brackets dropped: "Hertz (Flügelschläge pro Sekunde)" is "hertz". */
function normalizeLabel(label: string): string {
  return label
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Why `label` does not name `symbol` in `locale`, or `null`. Skips a symbol it knows nothing about (the symbol rule reports that). */
function unitLabelProblem(symbol: string, locale: TextLocale, label: unknown): string | null {
  if (!isNonEmptyString(label) || !Object.hasOwn(ESTIMATE_UNIT_LABELS, symbol)) return null;
  const accepted = ESTIMATE_UNIT_LABELS[symbol][locale];
  const normalized = normalizeLabel(label);
  if (accepted.includes(normalized)) return null;
  // A rate per minute names its thing first: "Schläge pro Minute", "beats per minute".
  if (symbol === "1/min" && accepted.some((suffix) => normalized.endsWith(` ${suffix}`))) {
    return null;
  }
  return `unit.${locale} ${JSON.stringify(label)} does not name the symbol ${JSON.stringify(symbol)} (expected e.g. ${JSON.stringify(accepted[0])})`;
}

// --- distinct sources: registrable domains -----------------------------------

/** Public suffixes of two labels under which an organisation registers one label more ("bbc.co.uk"). A closed, small list of the common ones. */
const TWO_LABEL_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "net.uk",
  "sch.uk",
  "com.au",
  "net.au",
  "org.au",
  "gov.au",
  "edu.au",
  "co.nz",
  "org.nz",
  "govt.nz",
  "ac.nz",
  "co.jp",
  "or.jp",
  "go.jp",
  "ac.jp",
  "co.in",
  "org.in",
  "gov.in",
  "ac.in",
  "co.za",
  "org.za",
  "gov.za",
  "ac.za",
  "com.br",
  "org.br",
  "gov.br",
  "com.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  "co.kr",
  "go.kr",
  "ac.kr",
  "com.tr",
  "gov.tr",
  "com.sg",
  "gov.sg",
  "edu.sg",
  "com.hk",
  "gov.hk",
  "edu.hk",
  "com.tw",
  "gov.tw",
  "edu.tw",
  "com.mx",
  "gob.mx",
  "com.ar",
  "gob.ar",
  "co.il",
  "org.il",
  "gov.il",
  "ac.il",
  "co.at",
  "or.at",
  "gv.at",
  "ac.at",
]);

/**
 * Hosting domains whose subdomains belong to different, unrelated owners
 * ("alice.github.io" and "bob.github.io" are two parties). The one place where
 * distinct subdomains count as distinct sources; every other subdomain
 * ("pmc.ncbi.nlm.nih.gov", "de.wikipedia.org") belongs to its parent's organisation.
 */
const TENANT_DOMAINS = new Set([
  "github.io",
  "gitlab.io",
  "blogspot.com",
  "wordpress.com",
  "herokuapp.com",
  "netlify.app",
  "vercel.app",
  "pages.dev",
  "web.app",
  "firebaseapp.com",
]);

/**
 * An approximation of eTLD+1 without the public suffix list: the last two
 * labels, three under a common two-label suffix ("bbc.co.uk", "ons.gov.uk") or
 * a tenant domain ("alice.github.io"). Good enough for "are these two sources
 * the same organisation"; a reviewer decides the rest.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const labels = host.split(".");
  if (labels.length <= 2 || /^[\d.]+$/.test(host) || host.startsWith("[")) return host;
  const suffix = labels.slice(-2).join(".");
  const take = TWO_LABEL_SUFFIXES.has(suffix) || TENANT_DOMAINS.has(suffix) ? 3 : 2;
  return labels.slice(-take).join(".");
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
  for (const locale of ["de", "en"] as const) {
    // A pound or a Zoll is reported once, by the non-metric rule.
    const label = unit[locale];
    const nonMetricPattern = locale === "de" ? DE_NON_METRIC : EN_NON_METRIC;
    if (typeof label === "string" && nonMetricPattern.test(label)) continue;
    const labelProblem = unitLabelProblem(unit.symbol, locale, label);
    if (labelProblem) fail("unit", labelProblem);
  }

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
      if (containsAnswer(text[locale], row.value, locale, { words: true })) {
        fail("answer-not-in-text", `text.${locale} spells out the answer`);
      }
    }
  }

  // definition
  if (!isNonEmptyString(row.definition) || row.definition.trim().length < 20) {
    fail("definition", "definition must be at least 20 characters (what exactly is measured)");
  } else if (
    valueMilli !== null &&
    containsAnswer(row.definition, row.value, "en", { words: false })
  ) {
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
  const domains = new Set<string>();
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
    domains.add(registrableDomain(parsed.hostname));
  });
  if (sources.length >= 2 && domains.size < 2) {
    fail(
      "sources",
      "the sources must come from at least 2 distinct organisations (registrable domains: two hosts of nasa.gov are one)",
    );
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

// --- the same fact twice -----------------------------------------------------

/** Lower case, letters and digits only, single spaces: "  Wie HOCH ist der Berg ?" and "wie hoch ist der berg" meet. */
function normalizeQuestionText(text: unknown): string {
  if (typeof text !== "string") return "";
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** A URL without scheme, "www.", fragment and trailing slashes, or the raw string if it does not parse. */
function normalizeSourceUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/+$/, "")}${parsed.search}`;
  } catch {
    return null;
  }
}

function canonicalValue(value: unknown): string | null {
  if (typeof value !== "string" || !VALUE_FORMAT.test(value)) return null;
  const [integer, fraction = ""] = value.split(".");
  return canonicalDecimal(integer, fraction);
}

interface FactKey {
  text: string;
  value: string | null;
  symbol: string;
  scale: string;
  urls: Set<string>;
}

function factKey(row: EstimateQuestion): FactKey {
  const urls = new Set<string>();
  for (const source of Array.isArray(row.sources) ? row.sources : []) {
    const url = normalizeSourceUrl(source?.url);
    if (url !== null) urls.add(url);
  }
  return {
    text: normalizeQuestionText(row.text?.de),
    value: canonicalValue(row.value),
    symbol: String(row.unit?.symbol),
    scale: String(row.scale),
    urls,
  };
}

function sameFactKey(a: FactKey, b: FactKey): boolean {
  if (a.text !== "" && a.text === b.text) return true;
  if (a.value === null || a.value !== b.value || a.symbol !== b.symbol || a.scale !== b.scale) {
    return false;
  }
  for (const url of a.urls) if (b.urls.has(url)) return true;
  return false;
}

/**
 * Two rows state the same fact: the same value in the same unit symbol and
 * scale AND at least one source URL in common, or the same German question text
 * (case and punctuation aside). The draw avoids such a pair within one round
 * (a Stechfrage that is the twin of the question just answered re-ties for
 * certain), the validator rejects it in the bank (`duplicate-fact`).
 */
export function isDuplicateFact(a: EstimateQuestion, b: EstimateQuestion): boolean {
  return sameFactKey(factKey(a), factKey(b));
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
  const keys: { id: string | null; key: FactKey }[] = [];
  for (const row of rows) {
    problems.push(...validateRow(row, ctx));
    const key = factKey(row);
    const twin = keys.find((earlier) => earlier.id !== row.id && sameFactKey(earlier.key, key));
    if (twin) {
      problems.push({
        id: typeof row.id === "string" ? row.id : "(no id)",
        rule: "duplicate-fact",
        message: `the same fact as ${twin.id ?? "(no id)"}: equal value, unit and scale with a shared source, or the same German text`,
      });
    }
    keys.push({ id: typeof row.id === "string" ? row.id : null, key });
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
