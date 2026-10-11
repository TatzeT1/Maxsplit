import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const FOOD_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-foo-0001",
    category: "food",
    tone: "fun",
    text: {
      de: "Wie viele Liter Wasser stecken im Schnitt in der Erzeugung von einem Kilogramm Rindfleisch?",
      en: "How many litres of water does it take to produce one kilogram of beef, worldwide on a mean basis?",
    },
    unit: {
      de: "Liter",
      en: "litres",
      symbol: "l",
    },
    scale: "ratio",
    format: "quantity",
    value: "15400",
    tolerance: "3",
    definition:
      "Global mean total water use (rain-fed green water, irrigation blue water and pollution-dilution grey water, mostly for feed) per kilogram of beef, from the Mekonnen and Hoekstra farm-animal study.",
    asOf: 2012,
    sources: [
      {
        label: "Mekonnen & Hoekstra 2012: Water footprint of farm animal products",
        url: "https://waterfootprint.org/resources/Mekonnen-Hoekstra-2012-WaterFootprintFarmAnimalProducts_1.pdf",
        kind: "primary",
      },
      {
        label: "University of Twente: High-meat diet puts pressure on freshwater",
        url: "https://www.utwente.nl/en/about-us/news-events-ceremonies/news/2011/1/176997/high-meat-diet-puts-pressure-on-earths-freshwater-resources",
        kind: "secondary",
      },
    ],
    note: "Earlier Hoekstra publications state about 15,000 to 15,500 l/kg; about 94 percent is green (rain) water. Tolerance covers the rounding spread.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0002",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Hektar Rebfläche waren 2024 in Deutschland mit Keltertrauben bestockt?",
      en: "How many hectares of Germany were planted with wine grapevines in 2024?",
    },
    unit: {
      de: "Hektar",
      en: "hectares",
      symbol: "ha",
    },
    scale: "ratio",
    format: "quantity",
    value: "103295",
    definition:
      "Total area planted with wine grape varieties (white and red varieties combined) in Germany in 2024, according to the official vineyard area survey.",
    asOf: 2024,
    sources: [
      {
        label: "Destatis: Rebflaechen nach Rebsorten im Zeitvergleich",
        url: "https://www.destatis.de/DE/Themen/Branchen-Unternehmen/Landwirtschaft-Forstwirtschaft-Fischerei/Wein/Tabellen/rebflaeche.html",
        kind: "primary",
      },
      {
        label: "Lebensmittelpraxis: Pilzresistente Rebsorten legen zu",
        url: "https://lebensmittelpraxis.de/industrie-aktuell/43715-weinbau-pilzresistente-rebsorten-legen-zu.html",
        kind: "secondary",
      },
      {
        label: "Statista: Rebflaeche weisse Rebsorten Deutschland",
        url: "https://de.statista.com/statistik/daten/studie/5709/umfrage/entwicklung-der-weinanbauflaeche-in-deutschland-nach-rebsorten",
        kind: "secondary",
      },
    ],
    note: "Destatis reports 101,965 ha for 2025; the value here is for 2024.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0003",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Eier isst eine Person in Deutschland im Schnitt pro Jahr, auch die in Nudeln und Gebäck versteckten?",
      en: "How many eggs does the average person in Germany eat in a year, including those hidden in pasta and baked goods?",
    },
    unit: {
      de: "Eier",
      en: "eggs",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "252",
    definition:
      "Calculated per-capita egg consumption in Germany in 2025 from the national supply balance, counting shell eggs plus eggs processed in food products, in pieces per person per year (preliminary figure).",
    asOf: 2025,
    sources: [
      {
        label: "BLE/BZL press release: Vier Eier mehr pro Kopf (Eierbilanz 2025)",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2026/260311_Eierbilanz.html",
        kind: "primary",
      },
      {
        label: "Nordkurier: Eierverbrauch steigt weiter, 252 pro Kopf",
        url: "https://www.nordkurier.de/wirtschaft/eierverbrauch-steigt-weiter-252-pro-kopf-im-jahr-4424956",
        kind: "secondary",
      },
    ],
    note: "Calculated, preliminary value. The 2024 value was first published as 249 and later revised to 248.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0004",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Kilo Kartoffeln isst eine Person in Deutschland pro Jahr im Schnitt, Pommes und Chips eingerechnet?",
      en: "How many kilograms of potatoes does the average person in Germany eat per year, including fries and crisps?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "63.5",
    definition:
      "Calculated per-capita potato consumption in Germany in the 2023/24 marketing year, fresh table potatoes plus potato products such as fries, potato salad and crisps, in kg per person (preliminary figure).",
    asOf: 2024,
    sources: [
      {
        label: "BLE press release: Pro-Kopf-Verbrauch von Kartoffeln ueber 60 kg",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2024/241212_Kartoffelbilanz.html",
        kind: "primary",
      },
      {
        label: "topagrar: Pro-Kopf-Verbrauch von Kartoffeln wieder ueber 60 kg",
        url: "https://www.topagrar.com/markt/news/pro-kopf-verbrauch-von-kartoffeln-erstmals-wieder-uber-60-kg-20009716.html",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure; could be revised in later supply balances.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0005",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Kilo frische Speisekartoffeln isst eine Person in Deutschland pro Jahr im Schnitt, ohne Pommes und Chips?",
      en: "How many kilograms of fresh table potatoes does the average person in Germany eat per year, excluding fries?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "25.5",
    definition:
      "Calculated per-capita consumption of fresh table potatoes only (no processed products) in Germany in the 2023/24 marketing year, in kg per person (preliminary figure).",
    asOf: 2024,
    sources: [
      {
        label: "BLE press release: Pro-Kopf-Verbrauch von Kartoffeln ueber 60 kg",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2024/241212_Kartoffelbilanz.html",
        kind: "primary",
      },
      {
        label: "topagrar: Pro-Kopf-Verbrauch von Kartoffeln wieder ueber 60 kg",
        url: "https://www.topagrar.com/markt/news/pro-kopf-verbrauch-von-kartoffeln-erstmals-wieder-uber-60-kg-20009716.html",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure; could be revised in later supply balances.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0006",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Kilo Kartoffelprodukte wie Pommes, Chips und Salat isst eine Person in Deutschland pro Jahr?",
      en: "How many kilograms of processed potato products, like fries and crisps, does the average German eat per year?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "38",
    definition:
      "Calculated per-capita consumption of processed potato products (fries, potato salad, crisps and similar) in Germany in the 2023/24 marketing year, in kg per person (preliminary figure).",
    asOf: 2024,
    sources: [
      {
        label: "BLE press release: Pro-Kopf-Verbrauch von Kartoffeln ueber 60 kg",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2024/241212_Kartoffelbilanz.html",
        kind: "primary",
      },
      {
        label: "topagrar: Pro-Kopf-Verbrauch von Kartoffeln wieder ueber 60 kg",
        url: "https://www.topagrar.com/markt/news/pro-kopf-verbrauch-von-kartoffeln-erstmals-wieder-uber-60-kg-20009716.html",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure; could be revised in later supply balances.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0007",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Liter Kaffee trinkt eine Person in Deutschland im Schnitt pro Jahr?",
      en: "How many litres of coffee does the average person in Germany drink in a year?",
    },
    unit: {
      de: "Liter",
      en: "litres",
      symbol: "l",
    },
    scale: "ratio",
    format: "quantity",
    value: "163",
    definition:
      "Estimated per-capita consumption of brewed coffee in Germany in 2024, in litres of prepared coffee per person per year, as published by the German coffee association.",
    asOf: 2024,
    sources: [
      {
        label: "Deutscher Kaffeeverband: Deutscher Kaffeemarkt 2024",
        url: "https://kaffeeverband.de/de/presse/Deutscher-Kaffeemarkt-2024",
        kind: "primary",
      },
      {
        label: "Hogapage: Tag des Kaffees, 10 Fakten",
        url: "https://www.hogapage.de/nachrichten/beverage/kaffee-tee/tag-des-kaffees-10-spannende-fakten-zum-lieblingsgetr%C3%A4nk-der-deutschen/",
        kind: "secondary",
      },
    ],
    note: "Both sources trace back to the industry association's own estimate; later figure for 2025 is about 161 l.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
