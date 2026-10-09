import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const GEOGRAPHY_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-geo-0001",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie lang ist die Elbe auf deutschem Gebiet, von der tschechischen Grenze bis zur Nordsee?",
      en: "How long is the part of the Elbe that flows through Germany?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "727",
    definition:
      "Length of the Elbe river course within Germany only, from the German-Czech border near Schöna to the North Sea at Cuxhaven; the shared border stretch is not counted twice.",
    asOf: 2016,
    sources: [
      {
        label: "Umweltbundesamt - Steckbrief Flussgebietseinheit Elbe (data: BfG)",
        url: "https://www.umweltbundesamt.de/system/files/medien/1968/dokumente/steckbrief_flussgebietseinheit_elbe.pdf",
        kind: "primary",
      },
      {
        label: "Landeshauptstadt Dresden - Umweltausstellung Elbe",
        url: "https://www.dresden.de/media/pdf/umwelt/umweltausstellung/Elbe.pdf",
        kind: "secondary",
      },
    ],
    note: "BfG shipping chainage ends at km 727.70 (Cuxhaven-Kugelbake); that is a navigation kilometrage, not the river-length figure. Total Elbe length is about 1,094 km (Planet Wissen agrees on 727 km German share).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0002",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie viele Quadratkilometer umfasst die Stadt Berlin?",
      en: "How large is the area of the city of Berlin?",
    },
    unit: {
      de: "Quadratkilometer",
      en: "square kilometres",
      symbol: "km²",
    },
    scale: "ratio",
    format: "quantity",
    value: "891.12",
    definition:
      "Total area of the city-state of Berlin within its administrative boundaries (land and water), as reported for the end of 2023.",
    asOf: 2023,
    sources: [
      {
        label: "Amt für Statistik Berlin-Brandenburg - press release (total area in hectares)",
        url: "https://www.statistik-berlin-brandenburg.de/195-2023",
        kind: "primary",
      },
      {
        label: "Statista - Fläche der Stadt Berlin",
        url: "https://de.statista.com/statistik/daten/studie/657678/umfrage/flaeche-der-stadt-berlin",
        kind: "secondary",
      },
    ],
    note: "Older statistical booklets (2010-2015) round to 892 km² and one 2016 edition lists 891.68 km²; the 2020-2023 releases all give 89,112 ha.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0003",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie lang ist der Lærdal-Tunnel in Norwegen, der längste Straßentunnel der Welt?",
      en: "How long is the Lærdal Tunnel in Norway, the world's longest road tunnel?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "24.509",
    definition:
      "Length of the Lærdal Tunnel on the E16 between Aurland and Lærdal, portal to portal, as stated by the Norwegian Public Roads Administration.",
    asOf: 2025,
    sources: [
      {
        label: "Statens vegvesen (Norwegian Public Roads Administration) - E16 Lærdal Tunnel",
        url: "https://www.vegvesen.no/en/road-projects/project/e16lardalstunnelen/",
        kind: "primary",
      },
      {
        label: "Wikipedia - Lærdal Tunnel",
        url: "https://en.wikipedia.org/wiki/L%C3%A6rdal_Tunnel",
        kind: "secondary",
      },
      {
        label: "Britannica - Lærdal-Aurland tunnel",
        url: "https://www.britannica.com/topic/Laerdal-Aurland-tunnel",
        kind: "secondary",
      },
    ],
    note: "Still the longest road tunnel in 2026; Rogfast (Norway) will overtake it only after it opens. An upgrade of the tunnel is planned for 2026-2031 and does not change its length.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0004",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie viele Kilometer misst Deutschland in der Luftlinie von seinem nördlichsten bis zu seinem südlichsten Punkt?",
      en: "How far is it in a straight line from Germany's northernmost to its southernmost boundary point?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "876",
    definition:
      "Greatest north-south extent of Germany as the straight line between its outermost boundary points (northern municipality List on Sylt, southern municipality Oberstdorf).",
    asOf: 2016,
    sources: [
      {
        label: "Nationalatlas Bundesrepublik Deutschland (Leibniz-Institut für Länderkunde),...",
        url: "https://archiv.nationalatlas.de/wp-content/art_pdf/Band6_10-11_archiv.pdf",
        kind: "primary",
      },
      {
        label: "deutschland.de - Land der Vielfalt",
        url: "https://www.deutschland.de/de/topic/leben/lifestyle-kulinarik/land-der-vielfalt",
        kind: "secondary",
      },
    ],
    note: "The same 876 km figure appears in several archived Nationalatlas volumes, in deutsch-to-go and travelbook quizzes. Only the west-east value is disputed (640 vs 632 km), which is not asked here. A rough coordinate check gives about 875 km.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0005",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie groß ist Luxemburg in Quadratkilometern?",
      en: "What is the total area of Luxembourg?",
    },
    unit: {
      de: "Quadratkilometer",
      en: "square kilometres",
      symbol: "km²",
    },
    scale: "ratio",
    format: "quantity",
    value: "2586",
    definition:
      "Total area of the Grand Duchy of Luxembourg within its national borders (land only, no coastline), as published by the national statistics office STATEC.",
    asOf: 2025,
    sources: [
      {
        label: "STATEC - Luxembourg in Figures 2025",
        url: "https://luxembourg.public.lu/dam-assets/publications/le-luxembourg-en-chiffres/2025/luxembourg-in-figures-2025.pdf",
        kind: "primary",
      },
      {
        label: "CIA World Factbook (2021 archive) - Luxembourg summary",
        url: "https://www.cia.gov/the-world-factbook/about/archives/2021/static/c539cc50f323b2c881e4f6b6eaf6f41c/LU-summary.pdf",
        kind: "primary",
      },
    ],
    note: "STATEC 2022 edition gives the same total. No conflicting figure found.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0006",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie viele Quadratkilometer misst die Wasserfläche des Bodensees?",
      en: "How large is the surface area of Lake Constance?",
    },
    unit: {
      de: "Quadratkilometer",
      en: "square kilometres",
      symbol: "km²",
    },
    scale: "ratio",
    format: "quantity",
    value: "536",
    definition:
      "Combined surface area of Lake Constance (Obersee and Untersee), excluding the Seerhein channel that connects them; shared by Germany, Switzerland and Austria.",
    asOf: 2022,
    sources: [
      {
        label: "IGKB (International Commission for the Protection of Lake Constance) - Arbeit...",
        url: "https://www.igkb.org/fileadmin/user_upload/Downloads/Schularbeitsblaetter/Kapitel_8_Wasserstand/IGKB_Arbeitsblatt_8_Wasserstand.pdf",
        kind: "primary",
      },
      {
        label: "bodensee.de - Facts & Figures",
        url: "https://www.bodensee.de/region/facts-figures",
        kind: "secondary",
      },
    ],
    note: "The state statistics office of Baden-Württemberg also gives 536 km² (excluding Seerhein). Older books give 539 or about 570 km²; maximum depth is NOT used here because sources give 251, 252 and 254 m.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0007",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie viele Quadratkilometer umfasst Grönland?",
      en: "How many square kilometres does Greenland cover?",
    },
    unit: {
      de: "Quadratkilometer",
      en: "square kilometres",
      symbol: "km²",
    },
    scale: "ratio",
    format: "quantity",
    value: "2166086",
    definition:
      "Total area of Greenland including the ice sheet and the offshore islands, as given by Statistics Greenland.",
    asOf: 2022,
    sources: [
      {
        label: "Statistics Greenland - Statistical Yearbook, Geography",
        url: "https://stat.gl/publ/en/SA/201002/content/Geography.htm",
        kind: "primary",
      },
      {
        label: "CIA World Factbook (2022 archive) - Greenland",
        url: "https://www.cia.gov/the-world-factbook/about/archives/2022/countries/greenland",
        kind: "primary",
      },
    ],
    note: "About 81 percent is ice-covered (410,449 km² ice-free). One undated reference file lists 2,175,600 km², treated as superseded.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0008",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie hoch ist das höchste Gebäude Europas?",
      en: "How tall is the tallest building in Europe?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "462",
    definition:
      "Architectural height (spire included, antennas excluded, CTBUH convention) of the Lakhta Center in Saint Petersburg, the tallest completed building in Europe.",
    asOf: 2019,
    sources: [
      {
        label: "CTBUH Skyscraper Center - Lakhta Center",
        url: "https://www.skyscrapercenter.com/building/lakhta/12575",
        kind: "primary",
      },
      {
        label: "Gazprom - CTBUH Awards 2021 report on Lakhta Center",
        url: "https://www.gazprom.com/about/subsidiaries/news/2021/may/article529204",
        kind: "secondary",
      },
    ],
    note: "CTBUH also lists height to the highest occupied floor (about 357 m); the asked metric is the architectural height used in its rankings. The owner is the source of the 'tallest in Europe' wording, CTBUH of the figure.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0009",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie tief ist die Ostsee an ihrer tiefsten Stelle?",
      en: "How deep is the Baltic Sea at its deepest point?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "459",
    tolerance: "0.6",
    definition:
      "Maximum water depth of the Baltic Sea, found in the Landsort Deep of the Western Gotland Basin, as given by the Leibniz Institute for Baltic Sea Research and the Finnish marine authorities.",
    asOf: 2024,
    sources: [
      {
        label: "Leibniz Institute for Baltic Sea Research Warnemünde (IOW) - Profile of the B...",
        url: "https://io-warnemuende.de/profile-of-the-baltic-sea.html",
        kind: "primary",
      },
      {
        label: "Marine Finland (Finnish Environment Institute) - The Baltic Sea in numbers",
        url: "https://www.marinefinland.fi/en-US/Nature_and_how_it_changes/The_unique_Baltic_Sea/The_Baltic_Sea_in_numbers",
        kind: "primary",
      },
    ],
    note: "HELCOM and a bathymetry dataset also give 459 m; Wikipedia gives 456.51 m, a yacht guide 456.5 m and a Swedish teaching guide 457 m, hence the small tolerance. Average depth is only about 52-55 m.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0010",
    category: "geography",
    tone: "standard",
    text: {
      de: "Wie viele Kilometer lang ist die Grenze zwischen Kanada und den USA?",
      en: "How long is the border between Canada and the United States?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "8891",
    definition:
      "Total length of the Canada-United States international boundary, land and water sections together, including the border with Alaska.",
    asOf: 2024,
    sources: [
      {
        label: "International Boundary Commission - Did you know?",
        url: "https://internationalboundarycommission.org/en/the-boundary-and-you/interesting-facts.php",
        kind: "primary",
      },
      {
        label: "Wikipedia - Canada-United States border",
        url: "https://en.wikipedia.org/wiki/Canada%E2%80%93United_States_border",
        kind: "secondary",
      },
    ],
    note: "Includes about 3,830 km of water boundary (lakes, rivers, straits) and the Alaska segment of roughly 2,475 km. Do not mix up with the 'land only' wording used loosely in some articles.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0011",
    category: "geography",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde die Öresundbrücke zwischen Dänemark und Schweden eröffnet?",
      en: "In which year did the Øresund Bridge between Denmark and Sweden open?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2000",
    definition:
      "Calendar year in which the Øresund fixed link (tunnel, artificial island Peberholm and bridge) between Copenhagen and Malmö was officially opened.",
    asOf: 2000,
    sources: [
      {
        label: "Øresundsbron - Historical milestones",
        url: "https://www.oresundsbron.com/about-oresundsbron/about-us/history/historical-milestones",
        kind: "primary",
      },
      {
        label: "Wikipedia - Øresund Bridge",
        url: "https://en.wikipedia.org/wiki/%C3%98resund_Bridge",
        kind: "secondary",
      },
    ],
    note: "Construction of the landworks began in 1993 and the crossing itself in 1995; the question asks for the opening year only.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-geo-0012",
    category: "geography",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Tunnel unter dem Ärmelkanal feierlich eröffnet?",
      en: "In which year was the Channel Tunnel between England and France officially opened?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1994",
    definition:
      "Calendar year of the official opening ceremony of the Channel Tunnel between Folkestone (England) and Coquelles near Calais (France).",
    asOf: 1994,
    sources: [
      {
        label: "Wikipedia - Channel Tunnel",
        url: "https://en.wikipedia.org/wiki/Channel_Tunnel",
        kind: "secondary",
      },
      {
        label: "UIC (International Union of Railways) - Timeline: 1994 Channel Tunnel",
        url: "https://uic.org/timelines/announcement/1994-channel-tunnel/",
        kind: "primary",
      },
      {
        label: "History.com - English Channel tunnel opens",
        url: "https://www.history.com/this-day-in-history/english-channel-tunnel-opens",
        kind: "secondary",
      },
    ],
    note: "Official opening ceremony was 6 May 1994; some services (e.g. the first Eurostar trip on 14 November 1994) and freight shuttles started later in 1994 or after, so 1994 is safe for 'opened'. No primary operator page was reachable; UIC is a railway standards body.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
