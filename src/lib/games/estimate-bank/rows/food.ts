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
  {
    id: "est-foo-0008",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viel Käse hat eine Person in Deutschland 2025 im Schnitt verbraucht?",
      en: "How much cheese did a person in Germany consume on average in 2025?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "26.4",
    definition:
      "Per-capita consumption of all cheese types (hard, semi-hard, soft, fresh and processed cheese) in Germany in calendar year 2025, from the preliminary BZL/BLE milk supply balance.",
    asOf: 2025,
    sources: [
      {
        label: "BLE press release: Versorgungsbilanz Milch 2025 (April 2026)",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2026/260415_Versorgungsbilanz_Milch.html",
        kind: "primary",
      },
      {
        label: "topagrar: Deutsche verbrauchen weniger Milch, dafür mehr Käse und Butter",
        url: "https://www.topagrar.com/rind/news/deutsche-verbrauchen-weniger-milch-dafur-mehr-kase-und-butter-20024757.html",
        kind: "secondary",
      },
      {
        label: "Milchindustrie-Verband: Pro-Kopf-Verbrauch Milchprodukte 2019-2025",
        url: "https://milchindustrie.de/wp-content/uploads/2026/04/ProkopfDeutschland_Mopro_2019-2025_Homepage.pdf",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure; per-capita values since 2022 are based on the 2022 census population and are not comparable with older years.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0009",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viel Fleisch aller Sorten hat eine Person in Deutschland 2025 im Schnitt verzehrt?",
      en: "How much meat of all kinds did a person in Germany eat on average in 2025?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "54.9",
    definition:
      "Per-capita meat consumption (Verzehr) of all meat types combined in Germany in calendar year 2025, from the preliminary BZL/BLE meat supply balance.",
    asOf: 2025,
    sources: [
      {
        label: "BLE press release: Fleischverzehr steigt um 1,4 Kilogramm pro Person",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2026/260407_Fleischbilanz.html",
        kind: "primary",
      },
      {
        label: "topagrar: Fast 55 kg pro Kopf",
        url: "https://www.topagrar.com/markt/news/deutsche-essen-mehr-fleisch-heimische-produktion-sinkt-20024593.html",
        kind: "secondary",
      },
      {
        label: "Lebensmittel Praxis: BZL-Daten, Verbraucher essen mehr Fleisch",
        url: "https://lebensmittelpraxis.de/handel-aktuell/48229-bundesinformationszentrum-landwirtschaft-verbraucher-in-deutschland-essen-mehr-fleisch.html",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure based on the census-2022 population; 2024 was earlier reported as 53.2 kg and later as 53.5 kg after a recalculation, so compare only within the same series.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0010",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viel Schweinefleisch hat eine Person in Deutschland 2025 im Schnitt verzehrt?",
      en: "How much pork did a person in Germany eat on average in 2025?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "28.3",
    definition:
      "Per-capita consumption (Verzehr) of pork in Germany in calendar year 2025, from the preliminary BZL/BLE meat supply balance.",
    asOf: 2025,
    sources: [
      {
        label: "BLE press release: Fleischverzehr steigt um 1,4 Kilogramm pro Person",
        url: "https://www.ble.de/SharedDocs/Pressemitteilungen/DE/2026/260407_Fleischbilanz.html",
        kind: "primary",
      },
      {
        label: "Lebensmittel Praxis: BZL-Daten, Verbraucher essen mehr Fleisch",
        url: "https://lebensmittelpraxis.de/handel-aktuell/48229-bundesinformationszentrum-landwirtschaft-verbraucher-in-deutschland-essen-mehr-fleisch.html",
        kind: "secondary",
      },
    ],
    note: "Preliminary BZL figure; pork is the most consumed meat in Germany.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0011",
    category: "food",
    tone: "standard",
    text: {
      de: "Wie viele Tonnen Spargel wurden 2025 in Deutschland geerntet?",
      en: "How many tonnes of asparagus were harvested in Germany in 2025?",
    },
    unit: {
      de: "Tonnen",
      en: "tonnes",
      symbol: "t",
    },
    scale: "ratio",
    format: "quantity",
    value: "103900",
    definition:
      "Total harvest quantity of asparagus in Germany in 2025 as published by the federal statistical office.",
    asOf: 2025,
    sources: [
      {
        label: "Destatis press release 20 July 2026: Freiland-Erdbeeren und Spargel 2026",
        url: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/07/PD26_257_412.html",
        kind: "primary",
      },
      {
        label: "Statista: Spargel in Deutschland (Destatis figures)",
        url: "https://de.statista.com/themen/3331/spargel/",
        kind: "secondary",
      },
    ],
    note: "Sources differ on the asparagus area (19,200 ha in production per Destatis vs 22,500 ha elsewhere), so this row asks for the harvest quantity only.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0012",
    category: "food",
    tone: "fun",
    text: {
      de: "Wie viel Prozent Wasser dürfen in Speisehonig nach deutschem Recht höchstens stecken?",
      en: "What is the maximum water content, in percent, that ordinary table honey may have under German law?",
    },
    unit: {
      de: "Prozent",
      en: "percent",
      symbol: "%",
    },
    scale: "interval",
    format: "quantity",
    value: "20",
    definition:
      "General maximum water content of table honey under Annex 2 of the German Honey Ordinance (Honigverordnung); heather honey and honey for industrial use have higher limits and are not meant.",
    asOf: 2026,
    sources: [
      {
        label: "LAVES Niedersachsen: Wassergehalt im Honig",
        url: "https://www.laves.niedersachsen.de/download/42476/Wassergehalt_im_Honig.pdf",
        kind: "primary",
      },
      {
        label: "gesetze.legal: Anlage 2 HonigV (mirror of the ordinance)",
        url: "https://gesetze.legal/bund/honigv/anlage_2",
        kind: "secondary",
      },
    ],
    note: "The official gesetze-im-internet.de page (honigv_2004/anlage_2.html) was returned by search but its table was not visible; the figure is confirmed by the state agency and the mirror. The German beekeepers' association quality seal uses a stricter 18 percent, which is a private rule and not meant.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0013",
    category: "food",
    tone: "fun",
    text: {
      de: "Wie viel Prozent Kakaotrockenmasse muss Milchschokolade nach deutschem Recht mindestens aufweisen?",
      en: "What minimum percentage of total cocoa dry matter must plain milk chocolate have under German chocolate rules?",
    },
    unit: {
      de: "Prozent",
      en: "percent",
      symbol: "%",
    },
    scale: "interval",
    format: "quantity",
    value: "25",
    definition:
      "Minimum total cocoa dry matter in plain milk chocolate under the German Cocoa Ordinance (KakaoV), which implements the EU chocolate directive; chocolate labelled 'Vollmilch' and plain dark chocolate have different limits.",
    asOf: 2026,
    sources: [
      {
        label: "Kakaoverordnung Anlage 1 (gesetze-im-internet.de)",
        url: "https://www.gesetze-im-internet.de/kakaov_2003/anlage_1.html",
        kind: "primary",
      },
      {
        label: "Verbraucherzentrale NRW: Kakao- und Schokoladenerzeugnisse",
        url: "https://www.verbraucherzentrale.nrw/sites/default/files/migration_files/media170711A.pdf",
        kind: "secondary",
      },
    ],
    note: "LOWER CONFIDENCE: the 25 percent for milk chocolate was seen only in the consumer-advice PDF and an Austrian source of the same EU directive, not in the German legal text itself. The reviewer should open Anlage 1 KakaoV and confirm the milk chocolate row.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-foo-0014",
    category: "food",
    tone: "fun",
    text: {
      de: "Aus wie viel Gramm Früchten muss man mindestens 100 Gramm Erdbeer-Konfitüre extra herstellen?",
      en: "How many grams of fruit must at least go into making 100 g of strawberry extra jam under German rules?",
    },
    unit: {
      de: "Gramm",
      en: "grams",
      symbol: "g",
    },
    scale: "ratio",
    format: "quantity",
    value: "45",
    definition:
      "Minimum quantity of strawberries used per 100 g of finished product for a jam labelled 'Konfitüre extra' under the German Jam Ordinance (Konfitürenverordnung, EU jam rules); the quantity before cooking, as stated on the label 'hergestellt aus ... g Früchten je 100 g'.",
    asOf: 2026,
    sources: [
      {
        label: "Burgenlandkreis: Merkblatt Konfitüren 2022",
        url: "https://www.burgenlandkreis.de/de/datei/anzeigen/id/88129,1069/merkblatt_konfitueren_2022.pdf",
        kind: "primary",
      },
      {
        label: "Landkreis Stade: Merkblatt Kennzeichnung Konfitüre",
        url: "https://www.landkreis-stade.de/medien/dokumente/merkblatt_kennzeichnung_konfituere_av.pdf",
        kind: "primary",
      },
    ],
    note: "The figure was seen as a consistent value across several local-authority leaflets (Potsdam-Mittelmark, Stade, Burgenlandkreis) via search summaries, not in the ordinance text itself. Fruit-specific: other fruits (blackcurrant, quince) have lower minimums, hence the question names strawberries. Lower confidence on which leaflet carries which quote.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
