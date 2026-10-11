import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const SPACE_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-spc-0001",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Erdentage braucht die Venus für eine einzige Drehung um die eigene Achse?",
      en: "How many Earth days does Venus need to spin once around its own axis?",
    },
    unit: {
      de: "Erdentage",
      en: "Earth days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "243.02",
    definition:
      "Sidereal rotation period of Venus: time for one full turn relative to the distant stars, not the shorter sunrise-to-sunrise solar day.",
    asOf: 2021,
    sources: [
      {
        label: "NASA NSSDCA Venus Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html",
        kind: "primary",
      },
      {
        label: "NASA NTRS: Spin state and moment of inertia of Venus (Margot et al.)",
        url: "https://ntrs.nasa.gov/citations/20220003058",
        kind: "primary",
      },
      {
        label: "leancrew.com",
        url: "https://leancrew.com/all-this/2025/07/when-venus-is-in-the-house-of-games/",
        kind: "secondary",
      },
    ],
    note: "Venus spins backwards (retrograde) and its day is longer than its year. NASA fact sheet lists the period as 5832.6 hours (retrograde), i.e. about 243.03 days; the 2006-2020 radar study gives 243.0226 days. The solar day on Venus (about 117 Earth days) is a different quantity.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0002",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Stunden braucht der Jupiter für eine volle Drehung um die eigene Achse?",
      en: "How many hours does Jupiter take to rotate once around its own axis?",
    },
    unit: {
      de: "Stunden",
      en: "hours",
      symbol: "h",
    },
    scale: "ratio",
    format: "quantity",
    value: "9.925",
    definition:
      "Sidereal rotation period of Jupiter (one full turn relative to the stars, System III coordinates), i.e. the length of a Jupiter day in the rotation sense.",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDCA Jupiter Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/jupiterfact.html",
        kind: "primary",
      },
      {
        label: "ESA Solar System: Jupiter",
        url: "https://sci.esa.int/web/solar-system/-/jupiter",
        kind: "primary",
      },
    ],
    note: "NASA lists a sidereal period of 9.9250 h and a sunrise-to-sunrise 'length of day' of 9.9259 h; the difference is under a minute. Commonly quoted as 9 h 55 min. Jupiter is a gas giant, so the period refers to the System III radio rotation.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0003",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Kilometer liegen im Mittel zwischen Erde und Sonne?",
      en: "What is the mean distance between Earth and the Sun, in kilometres?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "149597870.7",
    definition:
      "The astronomical unit: the conventional length fixed by the IAU in 2012 that approximates the mean Earth-Sun distance, expressed in kilometres.",
    asOf: 2012,
    sources: [
      {
        label: "IAU 2012 Resolution B2 on the astronomical unit (PDF)",
        url: "https://iauarchive.eso.org/static/resolutions/IAU2012_ResolB2_French.pdf",
        kind: "primary",
      },
      {
        label: "Observatoire de Paris: the new definition of the astronomical unit",
        url: "https://observatoiredeparis.psl.eu/the-new-definition-of-the-astronomical-unit.html",
        kind: "secondary",
      },
    ],
    note: "Exactly 149,597,870,700 m by definition.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0004",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie weit ist der Mond im Mittel von der Erde entfernt?",
      en: "How far is the Moon from Earth, as a mean distance?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "384400",
    definition:
      "Mean distance between the centres of Earth and the Moon (semi-major axis of the Moon's orbit), in kilometres.",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDC Moon Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html",
        kind: "primary",
      },
      {
        label: "Michigan State University astronomy facts: Earth's Moon",
        url: "https://web.pa.msu.edu/people/horvatin/Astronomy_Facts/planet_pages/Earths_moon.htm",
        kind: "secondary",
      },
    ],
    note: "The distance varies between roughly 357,000 and 407,000 km over each orbit.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0005",
    category: "space",
    tone: "standard",
    text: {
      de: "In welcher Höhe über dem Äquator kreisen geostationäre Satelliten?",
      en: "At what height above the equator do geostationary satellites orbit?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "35786",
    definition:
      "Height of a circular geostationary orbit above Earth's equatorial surface, not measured from Earth's centre.",
    asOf: 2024,
    sources: [
      {
        label: "ESA: Orbits",
        url: "https://www.esa.int/Applications/Connectivity_and_Secure_Communications/Orbits",
        kind: "primary",
      },
      {
        label: "ATIS Telecom Glossary: geostationary orbit",
        url: "https://glossary.atis.org/?p=13765",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0006",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie lang ist die Internationale Raumstation von einem Ende zum anderen?",
      en: "How long is the International Space Station from end to end?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "109",
    definition:
      "Overall end-to-end length of the fully assembled International Space Station, in metres.",
    asOf: 2024,
    sources: [
      {
        label: "NASA: International Space Station Facts and Figures",
        url: "https://www.nasa.gov/international-space-station/space-station-facts-and-figures/",
        kind: "primary",
      },
      {
        label: "Canadian Space Agency: About the International Space Station",
        url: "https://www.asc-csa.gc.ca/eng/iss/about.asp",
        kind: "primary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0007",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viel wog der erste künstliche Erdsatellit der Welt, Sputnik, beim Start?",
      en: "How much did the very first artificial satellite, Sputnik, weigh at launch?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "83.6",
    definition:
      "Mass of the Sputnik 1 satellite sphere itself, including its batteries and transmitter but excluding the launch rocket body.",
    asOf: 1957,
    sources: [
      {
        label: "NASA History: Korolev and Sputnik",
        url: "https://www.nasa.gov/history/sputnik/harford.html",
        kind: "primary",
      },
      {
        label: "Wikipedia: Sputnik 1",
        url: "https://en.wikipedia.org/wiki/Sputnik_1",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0008",
    category: "space",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde das Weltraumteleskop Hubble ins All gebracht?",
      en: "In which year was the Hubble Space Telescope launched into orbit?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1990",
    definition:
      "Calendar year in which the Hubble Space Telescope was launched aboard a Space Shuttle.",
    asOf: 1990,
    sources: [
      {
        label: "NASA Science: Hubble facts for the 25th anniversary",
        url: "https://science.nasa.gov/missions/hubble/a-nasa-refresher-on-hubble-facts-for-the-25th-anniversary/",
        kind: "primary",
      },
      {
        label: "ESA/Hubble: Fact sheet",
        url: "https://esahubble.org/about/general/fact_sheet/",
        kind: "primary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0009",
    category: "space",
    tone: "standard",
    text: {
      de: "In welchem Jahr startete das erste Bauteil der Internationalen Raumstation?",
      en: "In which year was the first module of the International Space Station launched?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1998",
    definition:
      "Calendar year in which Zarya, the first element of the International Space Station, was launched from Baikonur.",
    asOf: 1998,
    sources: [
      {
        label: "NASA: Zarya Module",
        url: "https://www.nasa.gov/international-space-station/zarya-module/",
        kind: "primary",
      },
      {
        label: "ESA Science Portal: launch of the first ISS element",
        url: "https://sci.esa.int/web/home/-/11765-launch-of-the-first-element-of-international-space-station-on-20-november",
        kind: "primary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0010",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Erdentage braucht Merkur für eine Runde um die Sonne?",
      en: "How many Earth days does Mercury need to orbit the Sun once?",
    },
    unit: {
      de: "Tage",
      en: "days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "87.97",
    definition:
      "Sidereal orbital period of Mercury around the Sun, in Earth days (one Mercury year).",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDC Mercury Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/mercuryfact.html",
        kind: "primary",
      },
      {
        label: "ESA: Meet Mercury (BepiColombo)",
        url: "https://www.esa.int/Science_Exploration/Space_Science/BepiColombo/Meet_Mercury",
        kind: "primary",
      },
    ],
    note: "ESA page was not opened directly; its rounded 88-day figure came from a search summary.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0011",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Erdentage dauert ein Jahr auf der Venus?",
      en: "How many Earth days does one year on Venus last?",
    },
    unit: {
      de: "Tage",
      en: "days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "224.7",
    definition: "Sidereal orbital period of Venus around the Sun, in Earth days (one Venus year).",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDC Venus Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/venusfact.html",
        kind: "primary",
      },
      {
        label: "Britannica: Venus",
        url: "https://www.britannica.com/place/Venus-planet",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0012",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Erdentage dauert ein Jahr auf dem Mars?",
      en: "How many Earth days does one year on Mars last?",
    },
    unit: {
      de: "Tage",
      en: "days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "687",
    definition:
      "Sidereal orbital period of Mars around the Sun, in Earth days, rounded to whole days (one Mars year).",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDC Mars Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html",
        kind: "primary",
      },
      {
        label: "Britannica: Mars, basic astronomical data",
        url: "https://www.britannica.com/place/Mars-planet/Basic-astronomical-data",
        kind: "secondary",
      },
    ],
    note: "NASA gives 686.98 days; rounded to 687.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0013",
    category: "space",
    tone: "standard",
    text: {
      de: "Wie viele Erden würden nebeneinander quer über die Sonne passen?",
      en: "How many Earths lined up side by side would span the width of the Sun?",
    },
    unit: {
      de: "Erden",
      en: "Earths",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "109",
    definition:
      "Ratio of the Sun's diameter to Earth's diameter, rounded to a whole number of Earths.",
    asOf: 2024,
    sources: [
      {
        label: "NASA Space Place: How does our Sun compare with other stars?",
        url: "https://spaceplace.nasa.gov/sun-compare/en/",
        kind: "primary",
      },
      {
        label: "Britannica: How Big Is the Sun?",
        url: "https://www.britannica.com/topic/How-Big-Is-the-Sun",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-spc-0014",
    category: "space",
    tone: "standard",
    text: {
      de: "Mit welchem Tempo rast die Erde im Mittel um die Sonne, in km/s?",
      en: "At what mean speed does Earth travel around the Sun, in km/s?",
    },
    unit: {
      de: "Kilometer pro Sekunde",
      en: "kilometres per second",
      symbol: "km/s",
    },
    scale: "ratio",
    format: "quantity",
    value: "29.78",
    definition:
      "Mean orbital speed of Earth around the Sun over a full orbit, in kilometres per second.",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDC Earth Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html?level=1",
        kind: "primary",
      },
      {
        label: "arXiv: Orbital velocity (tabulated planetary orbital speeds)",
        url: "https://arxiv.org/pdf/1602.00438",
        kind: "secondary",
      },
    ],
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
