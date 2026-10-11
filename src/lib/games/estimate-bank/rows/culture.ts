import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const CULTURE_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-cul-0001",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie viele Saiten hat eine moderne Konzertharfe (Pedalharfe) üblicherweise?",
      en: "How many strings does a typical modern concert pedal harp have?",
    },
    unit: {
      de: "Saiten",
      en: "strings",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "47",
    definition:
      "Number of strings on the standard modern concert pedal harp (seven strings per octave over a range of six and a half octaves).",
    asOf: 2025,
    sources: [
      {
        label: "Staatliches Institut für Musikforschung (SIM), Museum guide on harps",
        url: "https://www.simpk.de/fileadmin/user_upload_sim/Dokumente/Museum/Sammlung/FuehrungsBlaetter_07_GB_pre.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia: Pedal harp",
        url: "https://en.wikipedia.org/wiki/Pedal_harp",
        kind: "secondary",
      },
      {
        label: "Vienna Symphonic Library Academy: Harp",
        url: "https://www.vsl.co.at/academy/strings/harp",
        kind: "secondary",
      },
    ],
    note: "Smaller lever/Celtic harps have fewer strings; the question is about the concert pedal harp.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0002",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie hoch ist der Südturm des Kölner Doms?",
      en: "How tall is the south tower of Cologne Cathedral?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "157.22",
    definition:
      "Height of the south tower of Cologne Cathedral from ground level to the tip of its spire, as listed by the cathedral chapter.",
    asOf: 2025,
    sources: [
      {
        label: "Kölner Dom (Metropolitankapitel): Der Dom in Zahlen",
        url: "https://www.koelner-dom.de/erleben/der-dom-in-zahlen",
        kind: "primary",
      },
      {
        label: "Traveller.com.au: Cologne's Kolner Dom",
        url: "https://www.traveller.com.au/colognes-kolner-dom-cathedral-germany-once-the-tallest-building-in-the-world-h27ei8",
        kind: "secondary",
      },
    ],
    note: "Older references give 157.31 m (south) and 157.38 m (north); all agree on about 157 m. The official 157.22 m is used.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0003",
    category: "culture",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der gregorianische Kalender per päpstlichem Erlass eingeführt?",
      en: "In which year was the Gregorian calendar introduced by papal decree?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1582",
    definition:
      "Calendar year in which the Gregorian calendar replaced the Julian calendar in the first Catholic countries by papal bull.",
    asOf: 2025,
    sources: [
      {
        label: "Library of Congress blog: Inter Gravissimas",
        url: "https://blogs.loc.gov/law/2013/01/inter-gravissimas-or-why-the-pope-is-never-late-for-tea/",
        kind: "primary",
      },
      {
        label: "Britannica: Ten Days That Vanished",
        url: "https://www.britannica.com/story/ten-days-that-vanished-the-switch-to-the-gregorian-calendar",
        kind: "secondary",
      },
    ],
    note: "Bull dated February 1582; first applied in October 1582. Great Britain adopted it only in 1752.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0004",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie viele Schaltjahre hat ein vollständiger Zyklus von 400 Jahren im gregorianischen Kalender?",
      en: "How many leap years does one full 400-year cycle of the Gregorian calendar contain?",
    },
    unit: {
      de: "Schaltjahre",
      en: "leap years",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "97",
    definition:
      "Number of leap years (366 days) in each complete 400-year cycle of the Gregorian calendar, which gives a mean year of 365.2425 days.",
    asOf: 2025,
    sources: [
      {
        label: "US Naval Observatory: Leap Years",
        url: "https://aa.usno.navy.mil/faq/leap_years",
        kind: "primary",
      },
      {
        label: "Wikipedia: Gregorian calendar",
        url: "https://en.wikipedia.org/wiki/Gregorian_calendar",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0005",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie hoch über dem Hallenboden hängt die Oberkante eines Basketballkorbs?",
      en: "How high above the floor is the top edge of a regulation basketball rim?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "305",
    definition:
      "Height of the top edge of the basketball ring above the playing floor according to the FIBA equipment rules.",
    asOf: 2025,
    sources: [
      {
        label: "FIBA Official Basketball Rules 2024: Basketball Equipment",
        url: "https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2024-official-basketball-rules-and-basketball-equipment.pdf",
        kind: "primary",
      },
      {
        label: "Anthony's International Basketball Officiating Site",
        url: "https://jazzace.ca/hoop/ask_ace.html",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
