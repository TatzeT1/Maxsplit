import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const NATURE_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-nat-0001",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie viel Prozent der Fläche Deutschlands sind laut Bundeswaldinventur von Wald bedeckt?",
      en: "What share of Germany's land area is covered by forest according to the national forest inventory?",
    },
    unit: {
      de: "Prozent",
      en: "percent",
      symbol: "%",
    },
    scale: "interval",
    format: "quantity",
    value: "32.3",
    definition:
      "Forest area (including forest roads, clearings and small waters inside forests) as a share of Germany's total land area, per the fourth National Forest Inventory (BWI 2022).",
    asOf: 2022,
    sources: [
      {
        label: "Bundeswaldinventur 2022 brochure (BMEL/Thünen)",
        url: "https://www.bundeswaldinventur.de/fileadmin/Projekte/2025/Bundeswaldinventur/BWI-2022_Broschuere_bf-neu.pdf",
        kind: "primary",
      },
      {
        label: "BMLEH Daten und Fakten brochure",
        url: "https://www.bmleh.de/SharedDocs/Downloads/DE/Broschueren/daten-fakten.pdf?__blob=publicationFile&v=9",
        kind: "primary",
      },
    ],
    note: "Destatis' separate forest-structure survey (about 10.2 million ha) uses another definition; the question refers to the National Forest Inventory definition. 11,538,455 / 35,754,330 = 32.27 %.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0002",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie viel Holz steckt im Stamm des nach Volumen größten lebenden Baums der Erde?",
      en: "How much wood is in the trunk of the world's largest living tree by volume?",
    },
    unit: {
      de: "Kubikmeter",
      en: "cubic meters",
      symbol: "m³",
    },
    scale: "ratio",
    format: "quantity",
    value: "1487",
    definition:
      "Estimated volume of wood in the trunk (bole) of the General Sherman Tree, ranked by the US National Park Service as the largest living tree by trunk volume; branches and roots are not counted.",
    asOf: 2026,
    sources: [
      {
        label: "US National Park Service, Largest Trees in the World",
        url: "https://www.nps.gov/seki/learn/nature/largest-trees-in-world.htm",
        kind: "primary",
      },
      {
        label: "Wikipedia, General Sherman Tree",
        url: "https://en.wikipedia.org/wiki/General_Sherman_Tree",
        kind: "secondary",
      },
    ],
    note: "Older NPS publications list smaller volumes (e.g. 50,010 cubic feet in 1937); the current NPS figure is used. A felled coast redwood may once have been larger, hence 'living'.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0003",
    category: "nature",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde im Bayerischen Wald der erste Nationalpark Deutschlands eröffnet?",
      en: "In which year did Germany's first national park open in the Bavarian Forest?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1970",
    definition:
      "Calendar year of the official opening ceremony of Bavarian Forest National Park, the first national park in Germany.",
    asOf: 1970,
    sources: [
      {
        label: "Nationalpark Bayerischer Wald, Festschrift zur Eröffnung",
        url: "https://www.nationalpark-bayerischer-wald.bayern.de/ueber_uns/geschichte/doc/festschrift_eroeffnung_npbw.pdf",
        kind: "primary",
      },
      {
        label: "Bund Naturschutz, Nationalpark Bayerischer Wald",
        url: "https://www.bund-naturschutz.de/ueber-uns/erfolge-und-niederlagen/nationalpark-bayerischer-wald",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0004",
    category: "nature",
    tone: "standard",
    text: {
      de: "In welchem Jahr stieg die Vulkaninsel Surtsey vor Island aus dem Meer auf?",
      en: "In which year did the volcanic island Surtsey rise out of the sea off Iceland?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1963",
    definition:
      "Calendar year in which the volcanic island Surtsey first broke the sea surface south of Iceland; the underwater volcanic activity began a few days earlier, but the island appeared in November of that year.",
    asOf: 1963,
    sources: [
      {
        label: "Environment Agency of Iceland, Surtsey",
        url: "https://ust.is/english/visiting-iceland/protected-areas/south/surtsey/",
        kind: "primary",
      },
      {
        label: "Wikipedia, Surtsey",
        url: "https://en.wikipedia.org/wiki/Surtsey",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0005",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie tief reicht die Kontinentale Tiefbohrung in der Oberpfalz, Deutschlands tiefstes Bohrloch, in die Erde?",
      en: "How deep is the German Continental Deep Drilling hole, the deepest borehole in Germany?",
    },
    unit: {
      de: "Meter",
      en: "meters",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "9101",
    definition:
      "Final depth of the main borehole of the German Continental Deep Drilling Programme (KTB) near Windischeschenbach, reached in 1994, measured along the hole from the surface.",
    asOf: 1994,
    sources: [
      {
        label: "GFZ Potsdam, Germany's deepest point",
        url: "https://www.gfz.de/en/press/news/details/der-tiefpunkt-in-deutschland-feierte-jubilaeum",
        kind: "primary",
      },
      {
        label: "Umweltbundesamt, GEO-Zentrum an der KTB",
        url: "https://www.umweltbundesamt.de/themen/boden-flaeche/un-jahr-des-bodens/geo-zentrum-an-der-ktb-kontinentalen-tiefbohrung",
        kind: "primary",
      },
    ],
    note: "Limited to Germany; the Kola Superdeep Borehole in Russia is deeper.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0006",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie viele Kilometer liegt der Erdmittelpunkt unter der Erdoberfläche?",
      en: "What is the average distance from the Earth's surface to its center?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometers",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "6371",
    definition:
      "Mean (volumetric) radius of the Earth, i.e. the average distance from the surface to the centre, rounded to whole kilometres; the equatorial radius is slightly larger and the polar radius slightly smaller.",
    asOf: 2026,
    sources: [
      {
        label: "NASA NSSDC Earth Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html?level=1",
        kind: "primary",
      },
      {
        label: "Wikipedia, Earth radius",
        url: "https://en.wikipedia.org/wiki/Earth_radius",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0007",
    category: "nature",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde die Fossilienfundstätte Grube Messel als UNESCO-Welterbe anerkannt?",
      en: "In which year was the Messel Pit fossil site inscribed on the UNESCO World Heritage List?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1995",
    definition:
      "Calendar year in which the UNESCO World Heritage Committee inscribed the Messel Pit Fossil Site (Hesse, Germany) as natural heritage.",
    asOf: 1995,
    sources: [
      {
        label: "Deutsche UNESCO-Kommission, Grube Messel",
        url: "https://www.unesco.de/staette/fossillagerstaette-grube-messel/",
        kind: "primary",
      },
      {
        label: "Senckenberg, 25 Jahre UNESCO-Welterbe Grube Messel",
        url: "https://www.senckenberg.de/en/institute/senckenberg-gesellschaft-fuer-naturforschung-frankfurt-main/abt-messelforschung-und-mammalogie/25-jahre-unesco-welterbe-grube-messel/",
        kind: "primary",
      },
      {
        label: "Wikipedia, Messel Pit",
        url: "https://en.wikipedia.org/wiki/Messel_Pit",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0008",
    category: "nature",
    tone: "standard",
    text: {
      de: "In welchem Jahr entstanden in Schweden die ersten Nationalparks Europas?",
      en: "In which year did Sweden create the first national parks in Europe?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1909",
    definition:
      "Calendar year in which Sweden established its first nine national parks (including Sarek and Abisko), the first national parks in Europe.",
    asOf: 1909,
    sources: [
      {
        label: "Sveriges nationalparker, history",
        url: "https://sverigesnationalparker.se/en/national-park-facts/history",
        kind: "primary",
      },
      {
        label: "EUROPARC Nordic-Baltic, Sweden protected areas",
        url: "https://europarc-nb.org/protected-areas/sweden/",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0009",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie viel Gramm wiegt ein Kubikmeter trockene Luft auf Meereshöhe in der Standardatmosphäre?",
      en: "How much does one cubic meter of dry air weigh at sea level in the standard atmosphere?",
    },
    unit: {
      de: "Gramm",
      en: "grams",
      symbol: "g",
    },
    scale: "ratio",
    format: "quantity",
    value: "1225",
    definition:
      "Mass of one cubic meter of dry air at mean sea level under International Standard Atmosphere conditions (standard sea-level temperature and pressure, no water vapour).",
    asOf: 1976,
    sources: [
      {
        label: "NASA NTRS, Atmospheric Models for Engineering Applications (AIAA 2003)",
        url: "https://ntrs.nasa.gov/api/citations/20030064962/downloads/20030064962.pdf",
        kind: "primary",
      },
      {
        label: "AMS Glossary of Meteorology, standard atmosphere",
        url: "https://glossary.ametsoc.org/wiki/standard-atmosphere/",
        kind: "secondary",
      },
      {
        label: "Wikipedia, International Standard Atmosphere",
        url: "https://en.wikipedia.org/wiki/International_Standard_Atmosphere",
        kind: "secondary",
      },
    ],
    note: "Real air density varies with temperature, pressure and humidity; the question refers to the ISA reference value.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0010",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie tief ist das Weltmeer im Durchschnitt?",
      en: "What is the average depth of the world ocean?",
    },
    unit: {
      de: "Meter",
      en: "meters",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "3682",
    definition:
      "Mean depth of the global ocean (total ocean volume divided by ocean surface area) from the 2010 satellite-based estimate by Charette and Smith, which NOAA uses.",
    asOf: 2010,
    sources: [
      {
        label: "NIST, How deep are Earth's oceans",
        url: "https://www.nist.gov/pml/owm/how-deep-are-earths-oceans",
        kind: "primary",
      },
      {
        label: "WHOI press release on ocean volume and depth",
        url: "https://www.whoi.edu/press-room/news-release/whoi-study-calculates-volume-and-depth-of-the-worlds-oceans/",
        kind: "primary",
      },
    ],
    note: "The older, still widely repeated figures 3,688 m, 3,700 m or 3,800 m come from earlier estimates.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0011",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie viel Niederschlag fiel an einer deutschen Messstation höchstens innerhalb eines Kalenderjahres?",
      en: "What is the largest annual precipitation total ever recorded at a German weather station?",
    },
    unit: {
      de: "Millimeter",
      en: "millimeters",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "3503.1",
    definition:
      "Highest precipitation total within one calendar year at any station of the German weather service (DWD) network, in mm (equal to litres per square metre); the record belongs to Balderschwang in the Allgäu.",
    asOf: 1970,
    sources: [
      {
        label: "DWD Thema des Tages, Niederschlag messen (2018)",
        url: "https://www.dwd.de/DE/wetter/thema_des_tages/2018/11/28.html",
        kind: "primary",
      },
      {
        label: "Wetterdienst.de Wetterrekorde Deutschland (Niederschlag)",
        url: "https://www.wetterdienst.de/Klima/Wetterrekorde/Deutschland/Niederschlag/",
        kind: "secondary",
      },
      {
        label: "Wupperverband, Niederschlag 2024 (citing DWD)",
        url: "https://alias2.wupperverband.de/internet/mediendb.nsf/gfx/med_HVAL-CZSCKZ_31821B/$file/2024_niederschlag.pdf",
        kind: "secondary",
      },
    ],
    note: "A station value; RADKLIM radar means (e.g. 2962 mm municipal mean for 2023) are a different measure.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-nat-0012",
    category: "nature",
    tone: "standard",
    text: {
      de: "Wie tief ist der Baikalsee an seiner tiefsten Stelle?",
      en: "How deep is Lake Baikal at its deepest point?",
    },
    unit: {
      de: "Meter",
      en: "meters",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "1637",
    tolerance: "0.5",
    definition:
      "Maximum depth of Lake Baikal in Russia, measured from the water surface to the lake bed at its deepest point.",
    asOf: 2026,
    sources: [
      {
        label: "USGS, Lake Baikal from space",
        url: "https://www.usgs.gov/media/images/lake-baikal-space-largest-oldest-and-deepest-lake",
        kind: "primary",
      },
      {
        label: "UNESCO World Heritage Centre, Lake Titicaca tentative list (benchmark vs Baikal)",
        url: "https://whc.unesco.org/en/tentativelists/5080/",
        kind: "primary",
      },
      {
        label: "Wikipedia, Lake Baikal",
        url: "https://en.wikipedia.org/wiki/Lake_Baikal",
        kind: "secondary",
      },
    ],
    note: "Sources genuinely differ by about 0.3 percent (1,637 m USGS/UNESCO, 1,638 m UNESCO report, 1,642 m Wikipedia/Britannica); tolerance covers all of them.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
