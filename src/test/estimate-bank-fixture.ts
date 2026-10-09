/**
 * A tiny SYNTHETIC question bank for unit and emulator tests — fake facts about
 * made-up places and things ("Testberg", "Probefluss"), placeholder example.*
 * URLs. Never the real bank: nothing here is true, and nothing here may be used
 * as content. It has the final row shape and passes `validateEstimateBank`
 * (floors off), so it can stand in for `ESTIMATE_BANK` wherever a test
 * `vi.mock`s `@/lib/games/estimate-bank`.
 *
 * Ids follow the real format with numbers from 9001 up (`est-geo-9001`), so the
 * real bank (which counts up from 0001) can never collide with them. Mix:
 * 12 standard + 4 fun rows, ratio and interval, counts, years, two rows with a
 * tolerance (ratio and year) so a test can prefer a tolerance-free Stechfrage.
 */
import type { EstimateQuestion } from "@/lib/games/estimate-bank/types";

const VERIFIED = { by: "fixture", on: "2026-01-02" } as const;

const SOURCES: EstimateQuestion["sources"] = [
  { label: "Fixture authority (fake)", url: "https://example.org/fixture", kind: "primary" },
  { label: "Fixture reference (fake)", url: "https://example.com/fixture", kind: "secondary" },
];

/** A valid row to break one rule at a time: `makeEstimateRow({ value: "1e3" })`. */
export function makeEstimateRow(overrides: Partial<EstimateQuestion> = {}): EstimateQuestion {
  return {
    id: "est-geo-9001",
    category: "geography",
    tone: "standard",
    text: { de: "Wie hoch ist der Testberg?", en: "How high is Mount Test?" },
    unit: { de: "Meter", en: "metres", symbol: "m" },
    scale: "ratio",
    format: "quantity",
    value: "1234",
    definition: "Height of the fictional Mount Test above its base. Fixture data, not a fact.",
    asOf: 2024,
    sources: SOURCES.map((source) => ({ ...source })),
    verified: { ...VERIFIED },
    ...overrides,
  };
}

function row(
  id: string,
  category: EstimateQuestion["category"],
  rest: Omit<EstimateQuestion, "id" | "category" | "tone" | "asOf" | "sources" | "verified"> &
    Partial<Pick<EstimateQuestion, "tone" | "asOf">>,
): EstimateQuestion {
  return makeEstimateRow({ id, category, tone: "standard", asOf: 2024, ...rest });
}

export const ESTIMATE_FIXTURE_BANK: readonly EstimateQuestion[] = Object.freeze([
  row("est-geo-9001", "geography", {
    text: { de: "Wie hoch ist der Testberg?", en: "How high is Mount Test?" },
    unit: { de: "Meter", en: "metres", symbol: "m" },
    scale: "ratio",
    format: "quantity",
    value: "1234",
    definition: "Height of the fictional Mount Test above its base. Fixture data, not a fact.",
  }),
  row("est-geo-9002", "geography", {
    text: { de: "Wie lang ist der Probefluss?", en: "How long is the Sample River?" },
    unit: { de: "Kilometer", en: "kilometres", symbol: "km" },
    scale: "ratio",
    format: "quantity",
    value: "560",
    tolerance: "2",
    definition: "Course length of the fictional Sample River from source to mouth. Fixture data.",
    note: "Invented band: the fake sources disagree by a couple of percent.",
  }),
  row("est-geo-9003", "geography", {
    text: {
      de: "Wie viele Einwohner hat die Teststadt?",
      en: "How many inhabitants does Test City have?",
    },
    unit: { de: "Einwohner", en: "inhabitants", symbol: "" },
    scale: "ratio",
    format: "quantity",
    value: "83200",
    definition: "Resident count of the fictional Test City in its official register. Fixture data.",
  }),
  row("est-nat-9004", "nature", {
    text: {
      de: "Wie schwer ist ein typischer Teststein?",
      en: "How heavy is a typical test rock?",
    },
    unit: { de: "Kilogramm", en: "kilograms", symbol: "kg" },
    scale: "ratio",
    format: "quantity",
    value: "42.5",
    definition:
      "Mean mass of a made-up rock type found in the fictional Test Valley. Fixture data.",
  }),
  row("est-sci-9005", "science", {
    text: {
      de: "Bei wie vielen Grad Celsius schmilzt das Testmetall?",
      en: "At how many degrees Celsius does the test metal melt?",
    },
    unit: { de: "Grad Celsius", en: "degrees Celsius", symbol: "°C" },
    scale: "interval",
    format: "quantity",
    value: "660",
    definition: "Melting point of an invented metal at normal pressure. Fixture data, not a fact.",
  }),
  row("est-his-9006", "history", {
    text: {
      de: "In welchem Jahr wurde die Testbrücke eröffnet?",
      en: "In which year was the Test Bridge opened?",
    },
    unit: { de: "Jahr", en: "year", symbol: "" },
    scale: "interval",
    format: "year",
    value: "1927",
    definition: "Calendar year in which the fictional Test Bridge opened to traffic. Fixture data.",
  }),
  row("est-his-9007", "history", {
    text: {
      de: "In welchem Jahr wurde das Testarchiv gegründet?",
      en: "In which year was the Test Archive founded?",
    },
    unit: { de: "Jahr", en: "year", symbol: "" },
    scale: "interval",
    format: "year",
    value: "1850",
    tolerance: "1",
    definition: "Calendar year the fictional Test Archive was founded. Fixture data, not a fact.",
    note: "Invented band: the fake sources differ by one year.",
  }),
  row("est-nat-9008", "nature", {
    text: {
      de: "Wie viel Prozent der Testpflanze bestehen aus Wasser?",
      en: "What percentage of the test plant is water?",
    },
    unit: { de: "Prozent", en: "percent", symbol: "%" },
    scale: "interval",
    format: "quantity",
    value: "60",
    definition: "Water share of the fresh mass of an invented plant species. Fixture data.",
  }),
  row("est-spc-9009", "space", {
    text: {
      de: "Wie weit ist der Testmond von der Testerde entfernt?",
      en: "How far is Test Moon from Test Earth?",
    },
    unit: { de: "Kilometer", en: "kilometres", symbol: "km" },
    scale: "ratio",
    format: "quantity",
    value: "384400",
    definition:
      "Mean distance between the centres of two invented bodies. Fixture data, not a fact.",
  }),
  row("est-tec-9010", "technology", {
    text: {
      de: "Wie viele Kilogramm wiegt der Testroboter?",
      en: "How many kilograms does the test robot weigh?",
    },
    unit: { de: "Kilogramm", en: "kilograms", symbol: "kg" },
    scale: "ratio",
    format: "quantity",
    value: "1250",
    definition: "Empty mass of an invented service robot without its battery. Fixture data.",
  }),
  row("est-cul-9011", "culture", {
    text: {
      de: "Wie viele Seiten hat das Testbuch?",
      en: "How many pages does the test book have?",
    },
    unit: { de: "Seiten", en: "pages", symbol: "" },
    scale: "ratio",
    format: "quantity",
    value: "320",
    definition: "Printed page count of the first edition of an invented book. Fixture data.",
  }),
  row("est-spo-9012", "sport", {
    text: { de: "Wie lang ist die Testbahn?", en: "How long is the test track?" },
    unit: { de: "Meter", en: "metres", symbol: "m" },
    scale: "ratio",
    format: "quantity",
    value: "400",
    definition: "Length of one lap of an invented running track. Fixture data, not a fact.",
  }),
  row("est-foo-9013", "food", {
    tone: "fun",
    text: {
      de: "Wie viele Gramm Zucker enthält ein Testkeks?",
      en: "How many grams of sugar does a test biscuit contain?",
    },
    unit: { de: "Gramm", en: "grams", symbol: "g" },
    scale: "ratio",
    format: "quantity",
    value: "12",
    definition: "Sugar content of one invented biscuit as listed on its fake label. Fixture data.",
  }),
  row("est-ani-9014", "animals", {
    tone: "fun",
    text: { de: "Wie schnell läuft das Testtier?", en: "How fast does the test animal run?" },
    unit: { de: "Kilometer pro Stunde", en: "kilometres per hour", symbol: "km/h" },
    scale: "ratio",
    format: "quantity",
    value: "45",
    definition: "Top running speed of an invented animal over a short distance. Fixture data.",
  }),
  row("est-evd-9015", "everyday", {
    tone: "fun",
    text: {
      de: "Wie viele Stufen hat die Testtreppe?",
      en: "How many steps does the test staircase have?",
    },
    unit: { de: "Stufen", en: "steps", symbol: "" },
    scale: "ratio",
    format: "quantity",
    value: "350",
    definition:
      "Number of steps from the bottom to the top of an invented staircase. Fixture data.",
  }),
  row("est-bod-9016", "body", {
    tone: "fun",
    text: {
      de: "Wie viele Zähne hat der Testfisch?",
      en: "How many teeth does the test fish have?",
    },
    unit: { de: "Zähne", en: "teeth", symbol: "" },
    scale: "ratio",
    format: "quantity",
    value: "72",
    definition: "Total tooth count of an invented fish species in a complete jaw. Fixture data.",
  }),
]);

/** One fixture row by id; throws on an unknown id so a typo in a test fails loudly. */
export function estimateFixtureRow(id: string): EstimateQuestion {
  const found = ESTIMATE_FIXTURE_BANK.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no fixture row ${id}`);
  return found;
}
