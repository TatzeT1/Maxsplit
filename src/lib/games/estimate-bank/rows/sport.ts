import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-007). */
export const SPORT_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-spo-0001",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie breit ist ein Fußballtor zwischen den Innenkanten der Pfosten?",
      en: "How wide is a full-size soccer goal between the inner edges of the posts?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "7.32",
    definition:
      "Distance between the inner edges of the two goalposts of a full-size soccer goal, as set in Law 1 of the Laws of the Game.",
    asOf: 2025,
    sources: [
      {
        label: "FIFA publication: Laws of the Game 2015/16",
        url: "https://digitalhub.fifa.com/m/3f3e15cc1ab8977b/original/datdz0pms85gbnqy4j3k-pdf.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia: Football pitch",
        url: "https://en.wikipedia.org/wiki/Football_pitch",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0002",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie lang ist ein Tennisplatz von Grundlinie zu Grundlinie?",
      en: "How long is a tennis court from baseline to baseline?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "23.77",
    definition:
      "Full length of a regulation tennis court under the ITF Rules of Tennis, measured to the outside of the lines; the length is the same for singles and doubles.",
    asOf: 2026,
    sources: [
      {
        label: "ITF Rules of Tennis 2026",
        url: "https://www.itftennis.com/media/7221/2026-rules-of-tennis-english.pdf",
        kind: "primary",
      },
      {
        label: "Czech Wikipedia: Tenisový dvorec",
        url: "https://cs.wikipedia.org/wiki/Tenisov%C3%BD_dvorec",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0003",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie lang ist ein Basketballfeld nach FIBA-Regeln (Innenkante der Linien)?",
      en: "How long is a basketball court under FIBA rules, measured from the inner edge of the boundary lines?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "28",
    definition:
      "Length of the playing court in FIBA Official Basketball Rules (international and Olympic standard), measured from the inner edge of the boundary line.",
    asOf: 2026,
    sources: [
      {
        label: "FIBA Official Basketball Rules 2026",
        url: "https://assets.fiba.basketball/image/upload/documents-corporate-fiba-official-rules-2026-v1-1.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia: Basketball court",
        url: "https://en.wikipedia.org/wiki/Basketball_court",
        kind: "secondary",
      },
    ],
    note: "NBA courts are slightly larger; this question refers to the FIBA standard.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0004",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie groß ist der Durchmesser des Lochs auf einem Golfgrün?",
      en: "What is the diameter of the hole on a golf putting green?",
    },
    unit: {
      de: "Millimeter",
      en: "millimetres",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "108",
    definition:
      "Diameter of the hole cut into a putting green as specified in the Rules of Golf (R&A and USGA).",
    asOf: 2025,
    sources: [
      {
        label: "USGA: Rules of Golf Definitions",
        url: "https://www.usga.org/content/usga/home-page/custom-search-pages/rules/2019-golf-rules-and-interpretations/fr-definitions.html",
        kind: "primary",
      },
      {
        label: "Wikipedia: Golf course",
        url: "https://en.wikipedia.org/wiki/Golf_course",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0005",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie schwer ist ein Tischtennisball nach den Regeln des Weltverbands?",
      en: "How much does an official table tennis ball weigh according to the international federation?",
    },
    unit: {
      de: "Gramm",
      en: "grams",
      symbol: "g",
    },
    scale: "ratio",
    format: "quantity",
    value: "2.7",
    definition:
      "Nominal mass of a table tennis ball as specified in the ITTF regulations (individual balls are allowed a small tolerance).",
    asOf: 2026,
    sources: [
      {
        label: "ITTF Statutes 2026",
        url: "https://db.ittf.com/sites/default/files/public/2026-02/2026_Statutes_v1_consolidated_tc.pdf",
        kind: "primary",
      },
      {
        label: "Active SG: Table tennis rules",
        url: "https://www.activesgcircle.gov.sg/learn/table-tennis/table-tennis-rules",
        kind: "secondary",
      },
    ],
    note: "ITTF Technical Leaflet T3 allows 2.67 to 2.77 g for an individual ball; the nominal value is the answer.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0006",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie hoch sind die Hürden beim 110-Meter-Hürdenlauf der Männer?",
      en: "How high are the hurdles in the men's 110 m hurdles race?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "106.7",
    definition:
      "Height of each hurdle in the senior men's high hurdles event of athletics (the standard senior men's hurdle height).",
    asOf: 2025,
    sources: [
      {
        label: "World Athletics: 110 metres hurdles",
        url: "https://worldathletics.org/disciplines/hurdles/110-metres-hurdles",
        kind: "primary",
      },
      {
        label: "Britannica: 110-meter hurdles",
        url: "https://www.britannica.com/sports/110-meter-hurdles",
        kind: "secondary",
      },
    ],
    note: "Olympics.com rounds the height to 107 cm; the exact figure is 106.7 cm.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0007",
    category: "sport",
    tone: "standard",
    text: {
      de: "In welchem Jahr fanden in Chamonix die ersten Olympischen Winterspiele statt?",
      en: "In which year were the first Olympic Winter Games held in Chamonix?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1924",
    definition:
      "Calendar year of the Chamonix winter sports week that the IOC later recognised as the first Olympic Winter Games.",
    asOf: 1924,
    sources: [
      {
        label: "Olympics.com: Chamonix 1924",
        url: "https://www.olympics.com/en/olympic-games/chamonix-1924",
        kind: "primary",
      },
      {
        label: "Britannica: Chamonix 1924 Olympic Winter Games",
        url: "https://www.britannica.com/event/Chamonix-1924-Olympic-Winter-Games",
        kind: "secondary",
      },
    ],
    note: "The 1924 event was named the first Olympic Winter Games retroactively by the IOC.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0008",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie viele Sportarten standen bei den Olympischen Sommerspielen in Paris auf dem Programm?",
      en: "How many sports were on the programme of the Paris Summer Olympic Games?",
    },
    unit: {
      de: "Stück",
      en: "pieces",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "32",
    definition:
      "Number of sports (not disciplines or medal events) in the official programme of the Paris Olympic Games.",
    asOf: 2024,
    sources: [
      {
        label: "Olympics.com: Paris 2024 competition schedule",
        url: "https://www.olympics.com/en/news/the-competition-schedule-for-olympic-games-paris-2024-has-been-released",
        kind: "primary",
      },
      {
        label: "Wikipedia: 2024 Summer Olympics",
        url: "https://en.wikipedia.org/wiki/2024_Summer_Olympics",
        kind: "secondary",
      },
    ],
    note: "Sports are counted, not disciplines.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0009",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie lang ist die Spielbahn (Pitch) beim Cricket zwischen den beiden Bowling-Creases?",
      en: "How long is a cricket pitch between the bowling creases at each end?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "20.12",
    definition:
      "Length of the cricket pitch as defined in Law 6 of the Laws of Cricket, the metric equivalent of the traditional imperial length.",
    asOf: 2025,
    sources: [
      {
        label: "MCC Laws of Cricket: Law 6 The Pitch",
        url: "https://lawsofcricket.lords.org/laws-of-cricket/setting-up-the-game/the-pitch",
        kind: "primary",
      },
      {
        label: "ICC: Men's Test Match Clause 6 The Pitch",
        url: "https://www.icc-cricket.com/news/mens-test-match-clause-6-the-pitch",
        kind: "primary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0010",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie schwer ist die Kugel beim Kugelstoßen der Männer bei Olympia?",
      en: "How heavy is the shot used in the men's shot put at the Olympic Games?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "7.26",
    definition:
      "Mass of the shot used in senior men's shot put competition under World Athletics rules, also used at the Olympic Games.",
    asOf: 2025,
    sources: [
      {
        label: "World Athletics: Shot put",
        url: "https://worldathletics.org/disciplines/throws/shot-put",
        kind: "primary",
      },
      {
        label: "Wikipedia: Shot put",
        url: "https://en.wikipedia.org/wiki/Shot_put",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0011",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie hoch hängt die Netzoberkante beim Volleyball der Männer?",
      en: "How high is the top of the net in men's indoor volleyball?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "2.43",
    definition:
      "Height of the top of the net above the centre of the court in international (FIVB) men's indoor volleyball.",
    asOf: 2025,
    sources: [
      {
        label: "FIVB Official Volleyball Rules 2025-2028",
        url: "https://www.fivb.com/wp-content/uploads/2025/01/FIVB-Volleyball_Rules2025_2028-EN-v05.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia: Volleyball",
        url: "https://en.wikipedia.org/wiki/Volleyball",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0012",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie viele Personen einer Mannschaft stehen beim Rugby Union gleichzeitig auf dem Feld?",
      en: "How many people of one team are on the pitch at the same time in rugby union?",
    },
    unit: {
      de: "Stück",
      en: "pieces",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "15",
    definition:
      "Number of people per side on the pitch at once in full-format rugby union (not rugby sevens or rugby league).",
    asOf: 2025,
    sources: [
      {
        label: "World Rugby Laws: Law 3 Team",
        url: "https://passport.world.rugby/laws-of-the-game/laws-by-number/3-team/",
        kind: "primary",
      },
      {
        label: "Wikipedia: Rugby union positions",
        url: "https://en.wikipedia.org/wiki/Rugby_union_positions",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spo-0013",
    category: "sport",
    tone: "standard",
    text: {
      de: "Wie breit ist ein Badmintonfeld im Doppel?",
      en: "How wide is a badminton court for doubles?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "6.1",
    definition:
      "Full width of a badminton court as used for doubles play, measured to the outside of the lines, per the BWF Laws of Badminton.",
    asOf: 2025,
    sources: [
      {
        label: "BWF Statutes 4.1: Laws of Badminton",
        url: "https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/SECTION%204.1-%20Laws%20of%20Badminton.pdf",
        kind: "primary",
      },
      {
        label: "Britannica: Badminton",
        url: "https://www.britannica.com/sports/badminton",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
