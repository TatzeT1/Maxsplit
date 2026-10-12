import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-007). */
export const HISTORY_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-his-0001",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Kölner Dom nach Jahrhunderten Bauzeit endlich vollendet?",
      en: "In which year was Cologne Cathedral finally completed after centuries of construction?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1880",
    definition:
      "Calendar year in which construction of Cologne Cathedral was officially completed and celebrated, after the medieval work had stood unfinished for centuries.",
    asOf: 2025,
    sources: [
      {
        label: "deutschland.de - Kölner Dom: Geschichte, Bedeutung, Architektur",
        url: "https://www.deutschland.de/de/topic/kultur/koelner-dom-geschichte-bedeutung-architektur",
        kind: "primary",
      },
      {
        label: "Planet Wissen (WDR/SWR/BR) - Superlative des Kölner Doms",
        url: "https://www.planet-wissen.de/kultur/nordrhein_westfalen/koelner_dom/pwiesuperlativedeskoelnerdoms100.html",
        kind: "secondary",
      },
      {
        label: "Wikipedia - Cologne Cathedral",
        url: "https://en.wikipedia.org/wiki/Cologne_Cathedral",
        kind: "secondary",
      },
    ],
    note: "Sources give 14 August or 15 October 1880 for the celebration; the year is the same.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0002",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr stand der Eiffelturm in Paris fertig da?",
      en: "In which year was the Eiffel Tower in Paris completed?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1889",
    definition:
      "Calendar year in which construction of the Eiffel Tower in Paris was finished, in time for the Exposition Universelle.",
    asOf: 2025,
    sources: [
      {
        label: "Eiffel Tower official site - Origins and construction",
        url: "https://toureiffel.paris/en/the-monument/history",
        kind: "primary",
      },
      {
        label: "Structurae - Eiffel Tower",
        url: "https://structurae.net/structures/eiffel-tower",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0003",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde die Londoner Tower Bridge feierlich eröffnet?",
      en: "In which year was London's Tower Bridge formally opened?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1894",
    definition:
      "Calendar year of the formal opening of Tower Bridge over the River Thames in London.",
    asOf: 2025,
    sources: [
      {
        label: "Tower Bridge - Timeline: the construction of Tower Bridge",
        url: "https://www.towerbridge.org.uk/stories/timeline-the-construction-of-tower-bridge",
        kind: "primary",
      },
      {
        label: "Encyclopaedia Britannica - Tower Bridge",
        url: "https://www.britannica.com/topic/Tower-Bridge",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0004",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Londoner Uhrturm am Parlament, in dem Big Ben hängt, fertiggestellt?",
      en: "In which year was the London clock tower at Parliament that houses Big Ben completed?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1859",
    definition:
      "Calendar year in which the clock tower of the Palace of Westminster (foundation stone laid 1843) was completed and its Great Clock started keeping time.",
    asOf: 2025,
    sources: [
      {
        label: "UK Parliament - A brief history of Big Ben and the clock tower",
        url: "https://www.parliament.uk/about/living-heritage/building/palace/big-ben/building-clock-tower/key-dates-/",
        kind: "primary",
      },
      {
        label: "Wikipedia - Big Ben",
        url: "https://en.wikipedia.org/wiki/Big_Ben",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0005",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde das Brandenburger Tor in Berlin fertiggestellt?",
      en: "In which year was the Brandenburg Gate in Berlin finished?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1791",
    definition:
      "Calendar year in which construction of the Brandenburg Gate in Berlin (begun 1788) was completed; the chariot sculpture on top was added later.",
    asOf: 2025,
    sources: [
      {
        label: "berlin.de - Brandenburg Gate",
        url: "https://www.berlin.de/en/attractions-and-sights/3560266-3104052-brandenburg-gate.en.html",
        kind: "primary",
      },
      {
        label: "Structurae - Brandenburg Gate",
        url: "https://structurae.net/en/structures/brandenburg-gate",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0006",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Panamakanal für den Schiffsverkehr eröffnet?",
      en: "In which year did the Panama Canal open to ship traffic?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1914",
    definition:
      "Calendar year in which the Panama Canal was officially opened to world shipping, with the first full transit by a ship.",
    asOf: 1914,
    sources: [
      {
        label: "Library of Congress - Panama Canal: Topics in Chronicling America",
        url: "https://guides.loc.gov/chronicling-america-panama-canal",
        kind: "primary",
      },
      {
        label: "Encyclopaedia Britannica - Panama Canal",
        url: "https://www.britannica.com/topic/Panama-Canal",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0007",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde die Hamburger Elbphilharmonie mit einem Festakt und Konzert eröffnet?",
      en: "In which year was Hamburg's Elbphilharmonie opened with a ceremony and concert?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2017",
    definition:
      "Calendar year of the official opening ceremony and first concert in the main hall of the Elbphilharmonie concert hall in Hamburg.",
    asOf: 2017,
    sources: [
      {
        label: "German History Docs (GHI Washington) - Opening of the Elbphilharmonie",
        url: "https://germanhistorydocs.org/de/ein-neues-deutschland-1990-2023/die-eroeffnung-der-elbphilharmonie-11-januar-2017",
        kind: "primary",
      },
      {
        label: "deutschland.de - Die Elbphilharmonie in Hamburg",
        url: "https://www.deutschland.de/de/topic/kultur/kuenste-und-architektur/die-elbphilharmonie-in-hamburg",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-his-0008",
    category: "history",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Nord-Ostsee-Kanal eröffnet?",
      en: "In which year was the Kiel Canal opened?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1895",
    definition:
      "Calendar year of the official opening of the Kiel Canal (Nord-Ostsee-Kanal) linking the North Sea and the Baltic Sea in Germany, after construction from 1887.",
    asOf: 2025,
    sources: [
      {
        label: "City of Kiel - The history of the Kiel Canal",
        url: "https://www.kiel.de/en/english_Kopie/canalhistory_en.php",
        kind: "primary",
      },
      {
        label: "Wikipedia - Kiel Canal",
        url: "https://en.wikipedia.org/wiki/Kiel_Canal",
        kind: "secondary",
      },
    ],
    note: "Opening day is given as 20 or 21 June 1895 depending on source; the year is not in dispute. Renamed Nord-Ostsee-Kanal in 1948.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
