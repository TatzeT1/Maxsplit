import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const TECHNOLOGY_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-tec-0001",
    category: "technology",
    tone: "standard",
    text: {
      de: "Wie viel Megawatt installierte Leistung hat das Kraftwerk am Drei-Schluchten-Staudamm in China?",
      en: "What is the installed generating capacity of the power station at the Three Gorges Dam in China, in megawatts?",
    },
    unit: {
      de: "Megawatt",
      en: "megawatts",
      symbol: "MW",
    },
    scale: "ratio",
    format: "quantity",
    value: "22500",
    definition:
      "Total installed (nameplate) generating capacity of all turbo-generators of the Three Gorges hydropower station on the Yangtze, as stated by the operator.",
    asOf: 2025,
    sources: [
      {
        label: "China Three Gorges Corporation - Three Gorges Project",
        url: "https://www.ctg.com.cn/ctgenglish/business/clean_energy/hydropower7/2024080621171845881/index.html",
        kind: "primary",
      },
      {
        label: "ICOLD press item (dam capacity listing)",
        url: "https://www.icold-cigb.org/articles.asp?src_lang=GB&permalien_typeactu=press&permalien=icold-issues-a-new-bulletin-on-safe-passage-of-extreme-floods-november-2012",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0002",
    category: "technology",
    tone: "standard",
    text: {
      de: "Wie viele Turbinen-Generatoren stehen im Kraftwerk am Drei-Schluchten-Staudamm?",
      en: "How many turbo-generators does the Three Gorges Dam power station have?",
    },
    unit: {
      de: "Stück",
      en: "pieces",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "34",
    definition:
      "Number of hydropower turbo-generator units of the Three Gorges power station, counting the 32 main units and the 2 plant-service units together.",
    asOf: 2025,
    sources: [
      {
        label: "CTG - Three Gorges ship locks news item",
        url: "https://www.ctg.com.cn/ctgenglish/news_media/media56/2025070813370054483/index.html",
        kind: "primary",
      },
      {
        label: "Wikipedia - Three Gorges Dam",
        url: "https://en.wikipedia.org/wiki/Three_Gorges_Dam",
        kind: "secondary",
      },
    ],
    note: "Counts the two small plant-service generators; the 32 main units alone would be a different answer.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0003",
    category: "technology",
    tone: "standard",
    text: {
      de: "Wie viele supraleitende Dipolmagnete lenken die Teilchenstrahlen im Ring des LHC auf ihrer Kreisbahn?",
      en: "How many superconducting dipole magnets bend the particle beams around the Large Hadron Collider ring?",
    },
    unit: {
      de: "Stück",
      en: "pieces",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "1232",
    definition:
      "Number of main superconducting dipole (bending) magnets installed in the Large Hadron Collider ring at CERN.",
    asOf: 2025,
    sources: [
      {
        label: "CERN Courier - First dipole descends to LHC",
        url: "https://cerncourier.com/a/first-dipole-descends-to-lhc/",
        kind: "primary",
      },
      {
        label: "Abstract on LHC dipoles (air.unimi.it)",
        url: "https://air.unimi.it/handle/2434/664460",
        kind: "secondary",
      },
    ],
    note: "Evidence for 1232 comes from construction-era CERN-related sources; the count is a fixed design figure.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0004",
    category: "technology",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Gotthard-Basistunnel feierlich eröffnet?",
      en: "In which year was the Gotthard Base Tunnel ceremonially opened?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2016",
    definition:
      "Calendar year in which the Gotthard Base Tunnel in Switzerland was opened (ceremony and start of regular service fall in the same year).",
    asOf: 2016,
    sources: [
      {
        label: "Swiss Federal Office of Transport (BAV) - Gotthard Base Tunnel",
        url: "https://www.bav.admin.ch/de/10-jahre-gotthard-basistunnel",
        kind: "primary",
      },
      {
        label: "Prodir - New Gotthard tunnel writes a new page in Swiss history",
        url: "https://open.prodir.com/?p=2800",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0005",
    category: "technology",
    tone: "standard",
    text: {
      de: "In welchem Jahr gingen am Hauptstadtflughafen BER die ersten Passagierflüge in Betrieb?",
      en: "In which year did Berlin Brandenburg Airport (BER) finally begin handling its first passenger flights?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2020",
    definition:
      "Calendar year in which Terminal 1 of Berlin Brandenburg Airport opened and passenger operations started.",
    asOf: 2020,
    sources: [
      {
        label: "Bundesregierung - Der BER geht ans Netz",
        url: "https://www.bundesregierung.de/breg-de/aktuelles/ber-eroeffnung-1804372",
        kind: "primary",
      },
      {
        label: "Frankfurtflyer - Der neue Berliner Flughafen BER hat endlich eröffnet",
        url: "https://frankfurtflyer.de/der-neue-berliner-flughafen-ber-hat-endlich-eroeffnet/",
        kind: "secondary",
      },
      {
        label: "Land Berlin - Flughafen Berlin Brandenburg (BER)",
        url: "https://www.berlin.de/sen/uvk/verkehr/verkehrsplanung/luftfahrt/flugplaetze/flughafen-berlin-brandenburg-ber/",
        kind: "primary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0006",
    category: "technology",
    tone: "standard",
    text: {
      de: "Wie lang ist der Sueskanal von Port Said bis Sues nach den Angaben der Kanalbehörde?",
      en: "How long is the Suez Canal from Port Said to Suez, according to the canal authority?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "193.3",
    definition:
      "Overall length of the Suez Canal between Port Said and Suez as stated by the Suez Canal Authority after the 2015 expansion works.",
    asOf: 2025,
    sources: [
      {
        label: "Suez Canal Authority - FAQ",
        url: "https://www.suezcanal.gov.eg/English/Pages/FAQ.aspx",
        kind: "primary",
      },
      {
        label: "Wikipedia - Suez Canal",
        url: "https://en.wikipedia.org/wiki/Suez_Canal",
        kind: "secondary",
      },
    ],
    note: "Britannica rounds to 193 km and excludes dredged approach channels; the length was only 164 km at opening.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-tec-0007",
    category: "technology",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Sueskanal für die Schifffahrt eröffnet?",
      en: "In which year did the Suez Canal open to shipping?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1869",
    definition: "Calendar year in which the Suez Canal was opened to navigation.",
    asOf: 2025,
    sources: [
      {
        label: "Suez Canal Authority - Canal History",
        url: "https://www.suezcanal.gov.eg/English/About/SuezCanal/Pages/CanalHistory.aspx",
        kind: "primary",
      },
      {
        label: "Britannica - Suez Canal",
        url: "https://www.britannica.com/topic/Suez-Canal",
        kind: "secondary",
      },
    ],
    note: "Evidence rests on search-result summaries rather than a fetched page; the 1869 opening is long-established.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
