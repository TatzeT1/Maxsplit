import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-007). */
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
  {
    id: "est-cul-0006",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie viele Schriftzeichen umfasst Japans offizielle Liste der Alltags-Kanji (Jōyō-Kanji)?",
      en: "How many characters are on Japan's official list of everyday kanji (the Jōyō kanji)?",
    },
    unit: {
      de: "Schriftzeichen",
      en: "characters",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "2136",
    definition:
      "Number of kanji on the Jōyō kanji table currently in force in Japan, a government guideline for kanji use in everyday writing; names-only kanji are not included.",
    asOf: 2010,
    sources: [
      {
        label: "Agency for Cultural Affairs (bunka.go.jp): Joyo kanji table explainer",
        url: "https://www.bunka.go.jp/prmagazine/rensai/kotoba/kotoba_009.html",
        kind: "primary",
      },
      {
        label: "Japanese Wikipedia: 常用漢字",
        url: "https://ja.wikipedia.org/wiki/%E5%B8%B8%E7%94%A8%E6%BC%A2%E5%AD%97",
        kind: "secondary",
      },
    ],
    note: "Value in force since the cabinet notice of 30 November 2010 (previous list had 1,945 characters). The primary page was seen only as a search-result snippet; the official table PDF is at bunka.go.jp/seisaku/bunkashingikai/kokugo/kokugo/kokugo_45/pdf/jouyoukanjihyou_h22.pdf (appeared in search results).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0007",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie viele Schriftzeichen enthält Chinas amtliche Tabelle der allgemein gültigen Standardzeichen von 2013?",
      en: "How many characters does China's official 2013 table of General Standard Chinese Characters list?",
    },
    unit: {
      de: "Schriftzeichen",
      en: "characters",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "8105",
    definition:
      "Total number of characters in the main table of the General Standard Chinese Characters list (通用规范汉字表) published by China's State Council, all three tiers together.",
    asOf: 2013,
    sources: [
      {
        label: "State Council notice on the table (gov.cn, 国发〔2013〕23号)",
        url: "https://www.gov.cn/zhengce/zhengceku/2013-08/19/content_1289.htm",
        kind: "primary",
      },
      {
        label: "Wikipedia: List of Commonly Used Standard Chinese Characters",
        url: "https://en.wikipedia.org/wiki/List_of_Commonly_Used_Standard_Chinese_Characters",
        kind: "secondary",
      },
    ],
    note: "Counts the simplified-character standard list only; the full number of Chinese characters in existence is far higher and not defined.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0008",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie hoch ist der Hauptturm des Ulmer Münsters?",
      en: "How tall is the main tower of Ulm Minster in Germany?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "161.53",
    definition:
      "Height of the west tower (main tower) of Ulm Minster from ground level to the tip of its spire, as given by the city of Ulm.",
    asOf: 2025,
    sources: [
      {
        label: "Stadt Ulm: Das Ulmer Münster",
        url: "https://www.ulm.de/tourismus/ulmer-muenster",
        kind: "primary",
      },
      {
        label: "German Wikipedia: Ulmer Münster",
        url: "https://de.wikipedia.org/wiki/Ulmer_M%C3%BCnster",
        kind: "secondary",
      },
    ],
    note: "Some secondary sources round to 161 m or 161.5 m. The Christ tower of the Sagrada Familia has reportedly overtaken it as tallest church tower, which does not affect this measurement.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0009",
    category: "culture",
    tone: "standard",
    text: {
      de: "Auf welche Frequenz ist der Kammerton a' laut internationaler Norm festgelegt?",
      en: "What frequency does the international standard set for the note A above middle C?",
    },
    unit: {
      de: "Hertz",
      en: "hertz",
      symbol: "Hz",
    },
    scale: "ratio",
    format: "quantity",
    value: "440",
    definition:
      "Standard tuning frequency of the note A in the treble stave (A above middle C) according to the ISO standard on standard musical pitch.",
    asOf: 2022,
    sources: [
      {
        label: "ISO 16:1975 Acoustics: Standard tuning frequency (iso.org)",
        url: "https://www.iso.org/standard/3601.html",
        kind: "primary",
      },
      {
        label: "Wikipedia: A440 (pitch standard)",
        url: "https://en.wikipedia.org/wiki/A440_(pitch_standard)",
        kind: "secondary",
      },
    ],
    note: "The question asks for the standardised value; many ensembles in practice tune to 442 Hz or other values.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0010",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie viele Tage dauert ein Baktun im Long-Count-Kalender der Maya?",
      en: "How many days make up one baktun in the Maya Long Count calendar?",
    },
    unit: {
      de: "Tage",
      en: "days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "144000",
    definition:
      "Length in days of one baktun, the Long Count unit made of 20 katuns, where a katun is 20 tuns of 360 days each.",
    asOf: 2025,
    sources: [
      {
        label: "Smithsonian National Museum of the American Indian: Maya calendar",
        url: "https://maya.nmai.si.edu/calendar/maya-calendar-converter",
        kind: "primary",
      },
      {
        label: "AAAS: Myths of the Mayan Long Count calendar",
        url: "https://www.aaas.org/myths-mayan-long-count-calendar",
        kind: "secondary",
      },
      {
        label: "Britannica: Calendar, the sacred calendar",
        url: "https://www.britannica.com/science/calendar/The-sacred-calendar",
        kind: "secondary",
      },
    ],
    note: "The Smithsonian quote is a paraphrase of the search-result summary (katun 7,200 days); the 144,000 figure itself was seen at AAAS and Britannica.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0011",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie hoch ist der Tokyo Skytree, der höchste Turm Japans?",
      en: "How tall is the Tokyo Skytree, Japan's tallest tower?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "634",
    definition:
      "Official structural height of the Tokyo Skytree broadcasting and observation tower from ground to the top of its antenna mast.",
    asOf: 2025,
    sources: [
      {
        label: "Tokyo Skytree official site: Outline",
        url: "https://en.tokyo-skytree.jp/about/outline/",
        kind: "primary",
      },
      {
        label: "Japan National Tourism Organization: Tokyo Skytree",
        url: "https://www.japan.travel/en/spot/1680/",
        kind: "secondary",
      },
    ],
    note: "The primary quote is from a search-result summary of the official site; the figure 634 m was also given by Go Tokyo and Wikipedia results.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-cul-0012",
    category: "culture",
    tone: "standard",
    text: {
      de: "Wie hoch ist der Berliner Fernsehturm am Alexanderplatz mit Antenne?",
      en: "How tall is Berlin's TV tower at Alexanderplatz including its antenna?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "368",
    definition:
      "Total height of the Berlin Fernsehturm from the ground to the tip of its antenna since the antenna was replaced in 1997, rounded to whole metres.",
    asOf: 2025,
    sources: [
      {
        label: "Berlin.de: Fernsehturm (history walk)",
        url: "https://www.berlin.de/ost-west-ost-kulturbahnhoefe/history-walk/artikel.1558558.php",
        kind: "primary",
      },
      {
        label: "Structurae: Berliner Fernsehturm",
        url: "https://structurae.net/de/bauwerke/berliner-fernsehturm",
        kind: "secondary",
      },
    ],
    note: "Before the 1997 antenna the tower was 365 m; the question specifies the current total height with antenna.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
