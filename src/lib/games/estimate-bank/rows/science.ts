import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const SCIENCE_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-sci-0001",
    category: "science",
    tone: "standard",
    text: {
      de: "Wie viele chemische Elemente kennt das Periodensystem heute?",
      en: "How many chemical elements does the periodic table contain today?",
    },
    unit: {
      de: "Elemente",
      en: "elements",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "118",
    definition:
      "Number of chemical elements recognised by IUPAC, counted by atomic number from hydrogen up to the heaviest named element.",
    asOf: 2016,
    sources: [
      {
        label: "IUPAC: names of elements 113, 115, 117, 118",
        url: "https://iupac.org/iupac-announces-the-names-of-the-elements-113-115-117-and-118/",
        kind: "primary",
      },
      {
        label: "Wikipedia: Chemical element",
        url: "https://en.wikipedia.org/wiki/Chemical_element",
        kind: "secondary",
      },
    ],
    note: "Count unchanged since 2016; no unconfirmed discoveries listed.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0002",
    category: "science",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde das Periodensystem der Elemente erstmals vorgestellt?",
      en: "In which year was the periodic table of the elements first presented?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1869",
    definition:
      "Calendar year in which the first periodic table of the chemical elements was presented to the Russian Chemical Society.",
    asOf: 2025,
    sources: [
      {
        label: "IUPAC: UN proclaims Year of the Periodic Table",
        url: "https://iupac.org/united-nations-proclaims-international-year-periodic-table-chemical-elements/",
        kind: "primary",
      },
      {
        label: "Guinness World Records: first periodic table",
        url: "https://www.guinnessworldrecords.com/world-records/106240-first-periodic-table-of-elements",
        kind: "secondary",
      },
    ],
    note: "Some sources give mid-February (printed) or 1 March (old-style calendar) 1869; the year is the same.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0003",
    category: "science",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde das Kilogramm an die Planck-Konstante gekoppelt (neues SI)?",
      en: "In which year did the revised SI come into force, tying the kilogram to the Planck constant?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2019",
    definition:
      "Calendar year in which the revision of the International System of Units took effect, redefining kilogram, ampere, kelvin and mole.",
    asOf: 2019,
    sources: [
      {
        label: "NIST: SI Redefinition",
        url: "https://www.nist.gov/si-redefinition",
        kind: "primary",
      },
      {
        label: "Wikipedia: 2019 revision of the SI",
        url: "https://en.wikipedia.org/wiki/2019_revision_of_the_SI",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0004",
    category: "science",
    tone: "standard",
    text: {
      de: "Wie viel Pascal beträgt der Luftdruck der Normatmosphäre auf Meereshöhe?",
      en: "How many pascals is the air pressure of the standard atmosphere at sea level?",
    },
    unit: {
      de: "Pascal",
      en: "pascals",
      symbol: "Pa",
    },
    scale: "ratio",
    format: "quantity",
    value: "101325",
    definition:
      "Pressure of the standard atmosphere (1 atm), the conventional reference for mean air pressure at sea level, in pascals.",
    asOf: 1954,
    sources: [
      {
        label: "IEC Electropedia: standard atmosphere unit",
        url: "https://www.electropedia.org/cdd/iec62720/iec62720.nsf/Units/0112-2---62720%23UAA322",
        kind: "primary",
      },
      {
        label: "Wikipedia: Standard atmosphere (unit)",
        url: "https://www.Wikipedia.org/wiki/Atm_(unit)",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0005",
    category: "science",
    tone: "standard",
    text: {
      de: "Wie schnell müsste man an der Erdoberfläche mindestens sein, um ohne Antrieb dem Schwerefeld der Erde zu entkommen?",
      en: "How fast must an object leave Earth's surface to escape its gravity without further propulsion?",
    },
    unit: {
      de: "Kilometer pro Sekunde",
      en: "kilometres per second",
      symbol: "km/s",
    },
    scale: "ratio",
    format: "quantity",
    value: "11.186",
    definition:
      "Escape velocity from Earth's surface, ignoring atmospheric drag and Earth's rotation, in kilometres per second.",
    asOf: 2024,
    sources: [
      {
        label: "NASA Earth Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html?level=1",
        kind: "primary",
      },
      {
        label: "Wikipedia: Escape velocity",
        url: "https://en.wikipedia.org/wiki/Escape_velocity",
        kind: "secondary",
      },
    ],
    note: "Many textbooks round to 11.2 km/s.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0006",
    category: "science",
    tone: "standard",
    text: {
      de: "Wie viel Prozent der trockenen Luft bestehen (nach Volumen) aus Sauerstoff?",
      en: "What percentage of dry air is oxygen by volume?",
    },
    unit: {
      de: "Prozent",
      en: "percent",
      symbol: "%",
    },
    scale: "interval",
    format: "quantity",
    value: "20.95",
    definition:
      "Volume fraction of molecular oxygen in dry air of Earth's lower atmosphere, water vapour excluded, in percent.",
    asOf: 2024,
    sources: [
      {
        label: "NASA Science: The Atmosphere",
        url: "https://science.nasa.gov/earth/climate-change/greenhouse-gases/the-atmosphere-getting-a-handle-on-carbon-dioxide/",
        kind: "primary",
      },
      {
        label: "Wikipedia: Atmosphere of Earth",
        url: "https://en.wikipedia.org/wiki/Atmosphere_of_Earth",
        kind: "secondary",
      },
    ],
    note: "Sources round 20.946 to 20.95; a guess of 21 is essentially exact.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-sci-0007",
    category: "science",
    tone: "standard",
    text: {
      de: "Welche Ordnungszahl hat Gold, wie viele Protonen stecken also in jedem Goldatom?",
      en: "What is gold's atomic number, i.e. how many protons does each gold atom have?",
    },
    unit: {
      de: "Protonen",
      en: "protons",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "79",
    definition:
      "Atomic number of the element gold (Au): the number of protons in the nucleus of every gold atom.",
    asOf: 2024,
    sources: [
      {
        label: "NIST Elemental Data Index: Gold",
        url: "https://physics.nist.gov/cgi-bin/Elements/elInfo.pl?element=79",
        kind: "primary",
      },
      {
        label: "RSC Periodic Table: Gold",
        url: "https://periodic-table.rsc.org/element/79/gold",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
