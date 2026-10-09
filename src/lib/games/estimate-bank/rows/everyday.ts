import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const EVERYDAY_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-evd-0001",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viel wiegt eine Zwei-Euro-Münze?",
      en: "How much does a two-euro coin weigh?",
    },
    unit: {
      de: "Gramm",
      en: "grams",
      symbol: "g",
    },
    scale: "ratio",
    format: "quantity",
    value: "8.5",
    definition:
      "Mass of a standard circulating two-euro coin according to the Eurosystem technical specification (ECB and Bundesbank), in grams.",
    asOf: 2026,
    sources: [
      {
        label: "ECB: Common sides of euro coins",
        url: "https://ecb.europa.eu/euro/coins/common/html/index.en.html",
        kind: "primary",
      },
      {
        label: "Bundesbank: Die Euro-Münzen (technische Daten)",
        url: "https://www.bundesbank.de/resource/blob/614114/72f35585745e0eb42c7573a05fcd1fd0/mL/die-euro-muenzen-data.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia: 2 euro coin",
        url: "https://en.wikipedia.org/wiki/2_euro_coin",
        kind: "secondary",
      },
    ],
    note: "Thickness is only a guideline value in the Eurosystem specification; the mass of 8.50 g is the nominal figure. Commemorative 2-euro coins have the same parameters.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0002",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie lang ist die lange Seite eines Fünfzig-Euro-Scheins?",
      en: "How long is the long edge of a fifty-euro banknote?",
    },
    unit: {
      de: "Millimeter",
      en: "millimetres",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "140",
    definition:
      "Length of the longer edge of the euro fifty banknote; the first series and the Europa series share the same format.",
    asOf: 2026,
    sources: [
      {
        label: "Bundesbank: 50-Euro-Banknote",
        url: "https://www.bundesbank.de/de/aufgaben/bargeld/euro-banknoten/50-euro/50-euro-banknote-599238",
        kind: "primary",
      },
      {
        label: "Bank of Finland: Euro banknotes and coins in pictures",
        url: "https://www.suomenpankki.fi/en/money-and-payments/euro-banknotes-and-coins/euro-banknotes-and-coins-in-pictures/",
        kind: "primary",
      },
      {
        label: "OeNB: Euro-Banknoten und -Münzen",
        url: "https://www.oenb.at/themen/bargeld/euro-banknoten-und-muenzen.html",
        kind: "primary",
      },
    ],
    note: "Only the 100 and 200 euro notes changed height in the Europa series; the 50 euro note kept its size.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0003",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie groß ist die Spurweite normaler Bahngleise in Deutschland, gemessen zwischen den Schienenköpfen?",
      en: "What is the gauge of standard railway track in Germany, measured between the inner faces of the rail heads?",
    },
    unit: {
      de: "Millimeter",
      en: "millimetres",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "1435",
    definition:
      "Nominal gauge of standard-gauge (Regelspur) railway track in Germany: smallest distance between the inner faces of the rail heads, measured just below the top of the rail, as set in EBO section 5.",
    asOf: 2026,
    sources: [
      {
        label: "EBO § 5 Spurweite (gesetze-im-internet.de)",
        url: "https://www.gesetze-im-internet.de/ebo/__5.html",
        kind: "primary",
      },
      {
        label: "Wikipedia (de): Spurweite (Schienenverkehr)",
        url: "https://de.wikipedia.org/wiki/Spurweite_(Schienenverkehr)",
        kind: "secondary",
      },
    ],
    note: "Nominal value; actual track may deviate within the permitted tolerance band. Narrow-gauge and tram lines are excluded.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0004",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Auf welcher Frequenz sendet der Langwellen-Zeitzeichensender bei Frankfurt, nach dem sich Funkuhren richten?",
      en: "On what frequency does the longwave time-signal transmitter near Frankfurt broadcast to set radio-controlled clocks?",
    },
    unit: {
      de: "Kilohertz",
      en: "kilohertz",
      symbol: "kHz",
    },
    scale: "ratio",
    format: "quantity",
    value: "77.5",
    definition:
      "Carrier frequency of the German longwave time-signal and standard-frequency transmitter the Mainflingen time-signal station, whose signal is controlled by the PTB and used by radio-controlled clocks.",
    asOf: 2026,
    sources: [
      {
        label: "PTB: DCF77 Verfügbarkeit und Empfangsberechtigung",
        url: "https://www.ptb.de/cms/ptb/fachabteilungen/abt4/fb-44/ag-442/verbreitung-der-gesetzlichen-zeit/dcf77/verfuegbarkeit-und-empfangsberechtigung.html",
        kind: "primary",
      },
      {
        label: "Wikipedia (de): Sendeanlagen in Mainflingen",
        url: "https://de.wikipedia.org/wiki/Sendeanlagen_in_Mainflingen",
        kind: "secondary",
      },
    ],
    note: "Contract between PTB and the operator runs to the end of 2031. The question deliberately does not name the call sign, which encodes the answer.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0005",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Mit wie viel Volt Wechselspannung wird die Oberleitung der Bahn auf Hauptstrecken in Deutschland gespeist?",
      en: "How many volts of alternating voltage does the overhead line on Germany's main railway lines carry?",
    },
    unit: {
      de: "Volt",
      en: "volts",
      symbol: "V",
    },
    scale: "ratio",
    format: "quantity",
    value: "15000",
    definition:
      "Nominal single-phase AC voltage of the overhead contact wire on the electrified main-line network of Deutsche Bahn (16.7 Hz traction system); S-Bahn third-rail, tram and metro systems are excluded.",
    asOf: 2026,
    sources: [
      {
        label: "Deutsche Bahn: Vorsicht Strom!",
        url: "https://www.deutschebahn.com/de/nachhaltigkeit/verantwortung_gesellschaft/unfallpraevention/Vorsicht-Strom--8763908",
        kind: "primary",
      },
      {
        label: "Fraunhofer ISE: PV4Rail Kurzbericht",
        url: "https://www.ise.fraunhofer.de/content/dam/ise/de/downloads/pdf/PV4Rail-Kurzbericht.pdf",
        kind: "primary",
      },
    ],
    note: "Nominal voltage; the actual line voltage varies with load. The overhead-line frequency (16.7 Hz, formerly 16 2/3 Hz) is a separate fact and not asked.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0006",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie lang darf ein gewöhnlicher Lastzug (Lkw mit Anhänger) nach EU-Regeln höchstens sein?",
      en: "What is the maximum length of an ordinary road train (truck with trailer) under EU rules?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "18.75",
    definition:
      "Maximum overall length of a road train (motor vehicle with trailer) under Annex I of EU Directive 96/53/EC, excluding special permits, long-truck trials and national length exemptions.",
    asOf: 2026,
    sources: [
      {
        label: "EU document reproducing Directive 96/53/EC Annex I (IPEX)",
        url: "https://secure.ipex.eu/IPEXL-WEB/download/file/082d29087d798b9a017d96e25c833607",
        kind: "primary",
      },
      {
        label: "gesetze.legal: Anhang I RL 96/53/EG",
        url: "https://gesetze.legal/eu/rl_96_53_eg/anhang_i",
        kind: "secondary",
      },
    ],
    note: "Germany's separate Lang-Lkw regime allows longer combinations and a pending EU revision (file 2023/0265(COD), still in trilogue in Sept 2026) would add length allowances for zero-emission trucks; neither changes the base limit. Article text keeps 'ordinary' in the question.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0007",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viel Dauerleistung darf der Motor eines Pedelecs höchstens haben, damit es rechtlich als Fahrrad gilt?",
      en: "How much continuous rated motor power may a pedelec have at most to still count legally as a bicycle in the EU?",
    },
    unit: {
      de: "Watt",
      en: "watts",
      symbol: "W",
    },
    scale: "ratio",
    format: "quantity",
    value: "250",
    definition:
      "Maximum continuous rated power of the auxiliary electric motor of a pedal-assisted bicycle that is exempt from EU L-category type approval and treated as an ordinary bicycle (assistance must also cut off at the legal speed limit and when pedalling stops).",
    asOf: 2026,
    sources: [
      {
        label: "European Commission working document on Regulation 168/2013 (CIRCABC)",
        url: "https://circabc.europa.eu/sd/a/c831d292-2b0b-4535-8367-59f7a8430d67/4_Categorisation%20cycles%20designed%20to%20pedal_Regulation%20168_2013.pdf",
        kind: "primary",
      },
      {
        label: "Deutscher Bundestag: Petition 78371 Abschlussbegründung",
        url: "https://epetitionen.bundestag.de/petitionen/_2018/_04/_28/Petition_78371.abschlussbegruendungpdf.pdf",
        kind: "primary",
      },
    ],
    note: "The EU legal text was seen only as a quote in a Commission working paper, not on EUR-Lex. Political calls to raise the limits exist but nothing is adopted. Same limit in the predecessor Directive 2002/24/EC and EN 15194.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0008",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viele Zentimeter ergeben bei einer bequemen Treppe zwei Stufenhöhen plus eine Stufentiefe zusammen?",
      en: "On a comfortable staircase, how many centimetres should two riser heights plus one tread depth add up to?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "63",
    definition:
      "Design value of the stair stride rule (Schrittmassregel): twice the riser height plus the tread depth, equal to the average human stride, for stairs inclined at about thirty degrees.",
    asOf: 2026,
    sources: [
      {
        label: "BAuA: Design of safe stairways",
        url: "https://www.baua.de/EN/Topics/Work-design/Workplaces/Safe-stairways-floors/The-design-of-safe-stairs",
        kind: "primary",
      },
      {
        label: "Wikipedia (de): Treppensteigung",
        url: "https://de.wikipedia.org/wiki/Treppensteigung",
        kind: "secondary",
      },
    ],
    note: "Medium confidence on definition: 63 cm is the agreed central design value, but standards allow bands (DIN 18065 59-65 cm, ISO 14122-3 60-66 cm) and the 17th-century original used 65 cm. Not a measurement; omit if the host dislikes normative values.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0009",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viele Schaltsekunden wurden bisher in die Weltzeit UTC eingefügt, um sie der Erddrehung anzupassen?",
      en: "How many leap seconds have been added to UTC so far to keep it in step with Earth's rotation?",
    },
    unit: {
      de: "Schaltsekunden",
      en: "leap seconds",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "27",
    definition:
      "Number of positive leap seconds inserted into UTC since the leap-second system began at the start of 1972; the latest was at the end of 2016 and the IERS has announced none for the end of 2026.",
    asOf: 2026,
    sources: [
      {
        label: "PTB press release via idw: 27. Schaltsekunde seit 1.1.1972",
        url: "https://idw-online.de/de/news664836",
        kind: "primary",
      },
      {
        label: "IERS Bulletin C 72 (forwarded to IANA tz list)",
        url: "https://lists.iana.org/hyperkitty/list/tz@iana.org/thread/QXCI2R2IOCR6XHSWBBTYXXE4WT2LEY3R/",
        kind: "primary",
      },
      {
        label: "Volksstimme: Das neue Jahr wird eine Sekunde länger",
        url: "https://www.volksstimme.de/leben/das-neue-jahr-wird-eine-sekunde-langer-796022",
        kind: "secondary",
      },
    ],
    note: "Stays valid until a leap second is announced; the next possible insertion dates are end of June 2027 and later, and the CGPM decided in 2022 to abandon leap seconds by 2035. Count 27 = TAI-UTC offset 37 s minus the initial 10 s.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0010",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viele Quadratmeter Wohnfläche hat eine Wohnung in Deutschland im Durchschnitt?",
      en: "How many square metres of floor space does the average dwelling in Germany have?",
    },
    unit: {
      de: "Quadratmeter",
      en: "square metres",
      symbol: "m²",
    },
    scale: "ratio",
    format: "quantity",
    value: "94",
    definition:
      "Average living space per dwelling across the entire German housing stock at the end of 2025, as reported by the Federal Statistical Office (Destatis); vacant dwellings are included, per-person figures are not meant.",
    asOf: 2025,
    sources: [
      {
        label: "Destatis: 44,0 Millionen Wohnungen zum Jahresende 2025",
        url: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/07/PD26_250_31231.html?nn=2110",
        kind: "primary",
      },
      {
        label: "diy online: Wohnungen werden größer",
        url: "https://www.diyonline.de/d/news/2026/07/16/free/wohnungen-werden-groesser.html",
        kind: "secondary",
      },
    ],
    note: "The same Destatis figure was already 94.0 m2 at the end of 2024 (press release PD25_336), so the row is stable year to year. Deliberately not the per-person figure, which moves with each census revision (47.5 to 49.5 m2 depending on edition).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0011",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Mit wie vielen Schwingungen pro Sekunde schwingt der Quarz in einer gewöhnlichen Quarz-Armbanduhr?",
      en: "How many times per second does the crystal in an ordinary quartz wristwatch oscillate?",
    },
    unit: {
      de: "Hertz",
      en: "hertz",
      symbol: "Hz",
    },
    scale: "ratio",
    format: "quantity",
    value: "32768",
    definition:
      "Resonant frequency of the tuning-fork quartz crystal that serves as the time base of ordinary quartz wristwatches (two to the power fifteen hertz, divided down to one pulse per second).",
    asOf: 2026,
    sources: [
      {
        label: "Micro Crystal datasheet CC7V-T1A (tuning fork crystal)",
        url: "https://www.microcrystal.com/fileadmin/Media/Products/32kHz/Datasheet/CC7V-T1A.pdf",
        kind: "primary",
      },
      {
        label: "Wikipedia (de): Uhrenquarz",
        url: "https://de.wikipedia.org/wiki/Uhrenquarz",
        kind: "secondary",
      },
    ],
    note: "Primary source is a manufacturer datasheet (original specification), not a standards body. NIST material (tf.nist.gov) also describes 2^15 Hz paired with a 15-stage divider but the exact PDF was not pinned. Some special watches use other frequencies; 'ordinary' covers the standard watch crystal.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0012",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Wie viele A4-Blätter ergeben zusammen die Fläche eines A0-Bogens?",
      en: "How many A4 sheets add up to the area of one A0 sheet?",
    },
    unit: {
      de: "Blätter",
      en: "sheets",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "16",
    definition:
      "Number of A4 sheets whose combined area equals one A0 sheet, because every step down the DIN 476 / ISO 216 A series halves the area (sizes are rounded down to whole millimetres).",
    asOf: 2026,
    sources: [
      {
        label: "DIN: Happy birthday, A4!",
        url: "https://www.din.de/en/din-and-our-partners/press/press-releases/happy-birthday-a4--880198",
        kind: "primary",
      },
      {
        label: "Markus Kuhn (Univ. of Cambridge): International standard paper sizes",
        url: "https://www.cl.cam.ac.uk/~mgk25/iso-paper.html",
        kind: "secondary",
      },
      {
        label: "Docuslice: Poster sizes explained",
        url: "https://docuslice.com/blog/2026-08-03-Poster-Sizes-Explained-A0-A1-A2-A3-A4/",
        kind: "secondary",
      },
    ],
    note: "Count follows from the definition (2^4); because sizes are rounded down to whole millimetres, sixteen A4 sheets are a hair smaller than one A0 sheet. The second and third sources are secondary; the quoted sheet count was seen in search summaries of these pages.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0013",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Seit welchem Jahr gibt es in ganz Deutschland fünfstellige Postleitzahlen?",
      en: "In what year did five-digit postcodes take effect across all of Germany?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1993",
    definition:
      "Calendar year in which the unified five-digit German postcode system replaced the separate West and East German four-digit systems (in force from 1 July of that year).",
    asOf: 2026,
    sources: [
      {
        label: "Bundesarchiv: Die Einführung der fünfstelligen Postleitzahlen",
        url: "https://www.bundesarchiv.de/themen-entdecken/online-entdecken/dokumente-zur-zeitgeschichte/die-einfuehrung-der-fuenfstelligen-postleitzahlen/",
        kind: "primary",
      },
      {
        label: "Deutsche Post DHL Group: Factsheet 25 Jahre PLZ (2018)",
        url: "https://group.dhl.com/content/dam/deutschepostdhl/de/media-center/media-relations/documents/2018/factsheet-25-jahre-plz-20180629.pdf",
        kind: "primary",
      },
    ],
    note: "West Germany had four-digit codes since 1962 and East Germany its own four-digit system; the question asks for the unified five-digit system. The DHL evidence is title and summary level.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0014",
    category: "everyday",
    tone: "standard",
    text: {
      de: "In welchem Jahr ging am Potsdamer Platz in Berlin Deutschlands erste Verkehrsampel in Betrieb?",
      en: "In what year did Germany's first traffic light go into operation at Potsdamer Platz in Berlin?",
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
      "Calendar year in which the first traffic-light signal for road traffic in Germany, a manually switched signal tower on Berlin's Potsdamer Platz, was put into operation.",
    asOf: 2026,
    sources: [
      {
        label: "Berlin Senate (SenUVK): Als Berlin ein Licht aufging",
        url: "https://www.berlin.de/sen/uvk/presse/pressemitteilungen/2024/pressemitteilung.1512202.php",
        kind: "primary",
      },
      {
        label: "LeMO / Deutsches Historisches Museum: Motorisierung",
        url: "https://www.dhm.de/lemo/kapitel/weimarer-republik/alltagsleben/motorisierung",
        kind: "primary",
      },
    ],
    note: "Sources give the tower's start between 20 October and 15 December of that year, all in the same year. Hamburg claims an earlier light signal (Stephansplatz, 1922) that served trams only; the question pins the Berlin tower to avoid that dispute.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0015",
    category: "everyday",
    tone: "standard",
    text: {
      de: "In welchem Jahr fuhr zwischen Nürnberg und Fürth die erste Dampfeisenbahn Deutschlands?",
      en: "In what year did Germany's first steam railway start running between Nuremberg and Fürth?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1835",
    definition:
      "Calendar year in which the first steam-hauled public railway in Germany (the Ludwig Railway between Nuremberg and Fürth) opened for service; an earlier horse-drawn line is not counted.",
    asOf: 2026,
    sources: [
      {
        label: "Stadtarchive Metropolregion Nürnberg: 10 Fakten über die erste Eisenbahnfahrt...",
        url: "https://stadtarchive-metropolregion-nuernberg.de/10-fakten-ueber-die-erste-eisenbahnfahrt-in-deutschland/",
        kind: "primary",
      },
      {
        label: "Wikipedia: Bavarian Ludwig Railway",
        url: "https://en.wikipedia.org/wiki/Bavarian_Ludwig_Railway",
        kind: "secondary",
      },
    ],
    note: "Lower confidence on source depth: the archive page was seen only as a search hit. One Heidelberg journal article gives 8 December 1835, same year. The horse-drawn Prinz-Wilhelm-Eisenbahn (1831) is why the question says steam.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0016",
    category: "everyday",
    tone: "standard",
    text: {
      de: "Seit welchem Jahr stellt man in Deutschland jedes Frühjahr ohne Unterbrechung die Uhr auf Sommerzeit um?",
      en: "Since what year has Germany switched to summer time every spring without a break?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1980",
    definition:
      "First calendar year of the unbroken series of annual summer-time periods in Germany that continues to this day; earlier periods between 1916 and 1949 are not counted.",
    asOf: 2026,
    sources: [
      {
        label: "PTB: Sommerzeiten in der Bundesrepublik Deutschland ab 1980",
        url: "https://www.ptb.de/cms/ptb/fachabteilungen/abt4/fb-44/ag-441/darstellung-der-gesetzlichen-zeit/sommerzeiten-in-der-bundesrepublik-deutschland-ab-1980.html",
        kind: "primary",
      },
      {
        label: "Deutscher Bundestag: Drucksache 9/1583 (Bericht der Bundesregierung zur Somme...",
        url: "https://dserver.bundestag.de/btd/09/015/0901583.pdf",
        kind: "primary",
      },
    ],
    note: "East Germany also began in 1980. A bill to abolish summer time (Drucksache 21/2213, Oct 2025) and EU debates exist but nothing is enacted as of October 2026, so 'ohne Unterbrechung' still holds.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0017",
    category: "everyday",
    tone: "fun",
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
    ],
    note: "Venus spins backwards (retrograde) and its day is longer than its year. NASA fact sheet lists the period as 5832.6 hours (retrograde), i.e. about 243.03 days; the 2006-2020 radar study gives 243.0226 days. The solar day on Venus (about 117 Earth days) is a different quantity.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0018",
    category: "everyday",
    tone: "fun",
    text: {
      de: "In welchem Jahr wurde die allererste SMS verschickt?",
      en: "In which year was the very first SMS text message sent?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1992",
    definition:
      "Calendar year in which the first SMS text message was sent over a mobile network (a 'Merry Christmas' greeting sent from a computer to a handset on the Vodafone UK network); later mobile-to-mobile texts are not meant.",
    asOf: 2026,
    sources: [
      {
        label: "Vodafone: 25 years since the world's first text message",
        url: "https://www.vodafone.com/news/technology/25-anniversary-text-message",
        kind: "primary",
      },
      {
        label: "NPR: The first text message celebrates 25 years",
        url: "https://www.npr.org/2017/12/04/568393428/the-first-text-messages-celebrates-25-years",
        kind: "secondary",
      },
    ],
    note: "Vodafone says 3 December 1992. A 2012 Vodafone UK blog post said Christmas Eve 1992, but the year is the same in every source. The first handset-to-handset SMS (1993) is a different milestone.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0019",
    category: "everyday",
    tone: "fun",
    text: {
      de: "Wie viel wiegen die Wassertröpfchen einer durchschnittlichen Quellwolke, die einen Kubikkilometer groß ist?",
      en: "How much do the water droplets in an average cumulus cloud one cubic kilometre in size weigh?",
    },
    unit: {
      de: "Tonnen",
      en: "tonnes",
      symbol: "t",
    },
    scale: "ratio",
    format: "quantity",
    value: "500",
    definition:
      "Mass of the liquid water droplets in a typical fair-weather cumulus cloud occupying one cubic kilometre, using the USGS estimate of the average cloud water density; the surrounding air is not counted.",
    asOf: 2024,
    sources: [
      {
        label: "USGS: How much does a cloud weigh?",
        url: "https://www.usgs.gov/media/images/how-much-does-a-cloud-weigh",
        kind: "primary",
      },
      {
        label: "EarthDate (McDonald Observatory): Puffy clouds weigh in",
        url: "https://www.earthdate.org/episodes/puffy-clouds-weigh-in",
        kind: "secondary",
      },
    ],
    note: "LOWER CONFIDENCE: this is a USGS back-of-envelope estimate (density about 0.5 g per cubic metre times 1 km^3 = about 500,000 kg, which USGS states as 1.1 million pounds), not a measurement. Denser cloud types weigh more. The question text must keep the 'one cubic kilometre' size. The USGS number is repeated by ScienceAlert, EarthDate and WeatherWorks, so the sources are not fully independent.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0020",
    category: "everyday",
    tone: "fun",
    text: {
      de: "Wie schnell rast die Erde im Durchschnitt auf ihrer Bahn um die Sonne?",
      en: "How fast does Earth travel on average along its orbit around the Sun?",
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
      "Mean orbital velocity of Earth around the Sun, averaged over the year (it varies between the aphelion and perihelion extremes).",
    asOf: 2024,
    sources: [
      {
        label: "NASA NSSDCA Earth Fact Sheet",
        url: "https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html",
        kind: "primary",
      },
      {
        label: "Wikipedia: Earth's orbit",
        url: "https://en.wikipedia.org/wiki/Earth%27s_orbit",
        kind: "secondary",
      },
    ],
    note: "About 107,200 km/h. Speed ranges from 29.29 km/s (aphelion) to 30.29 km/s (perihelion).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0021",
    category: "everyday",
    tone: "fun",
    text: {
      de: "In welchem Jahr fand das allererste Oktoberfest in München statt?",
      en: "In which year was the very first Oktoberfest held in Munich?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1810",
    definition:
      "Calendar year of the first festival on the Munich Theresienwiese that is counted as the first Oktoberfest (the royal wedding celebrations ending with the horse race).",
    asOf: 2026,
    sources: [
      {
        label: "Deutschlandmuseum: The first Oktoberfest",
        url: "https://www.deutschlandmuseum.de/en/?p=22526",
        kind: "primary",
      },
      {
        label: "History.com: The origin of Oktoberfest",
        url: "https://www.history.com/.amp/this-day-in-history/the-origin-of-oktoberfest",
        kind: "secondary",
      },
    ],
    note: "The wedding was on 12 October and the closing horse race on 17 October of that same year, so sources quote different days but the same year. Note: the question text deliberately avoids names of persons.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0022",
    category: "everyday",
    tone: "fun",
    text: {
      de: "Wie viel Prozent des gesamten Wassers der Erde ist Süßwasser?",
      en: "What percentage of all the water on Earth is freshwater?",
    },
    unit: {
      de: "Prozent",
      en: "percent",
      symbol: "%",
    },
    scale: "interval",
    format: "quantity",
    value: "2.5",
    definition:
      "Share of freshwater (ice caps, glaciers, groundwater and surface water) in the total volume of water on Earth, oceans and other saline water included in the total, rounded as published by USGS.",
    asOf: 2024,
    sources: [
      {
        label: "USGS: The distribution of water on, in, and above the Earth",
        url: "https://usgs.gov/media/images/distribution-water-and-above-earth",
        kind: "primary",
      },
      {
        label: "LibreTexts (Univ. of Pittsburgh): Fresh Water Supply",
        url: "https://bio.libretexts.org/Courses/University_of_Pittsburgh/Environmental_Science_(Whittinghill)/12%3A_Water_Supply_and_Water_Pollution/12.01%3A_Fresh_Water_Supply",
        kind: "secondary",
      },
    ],
    note: "Rounded value from the USGS estimate (based on Shiklomanov 1993; oceans about 96.5%). Older tallies give slightly different splits, so the question should accept the rounded 2.5 as truth. Most of this freshwater is frozen (about 68.7%).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-evd-0023",
    category: "everyday",
    tone: "fun",
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
    id: "est-evd-0024",
    category: "everyday",
    tone: "fun",
    text: {
      de: "In welchem Jahr wurde die erste Briefmarke der Welt ausgegeben?",
      en: "In which year was the world's first adhesive postage stamp issued?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1840",
    definition:
      "Calendar year in which the first adhesive postage stamp for prepaying mail was issued in a public postal system (Great Britain's one-penny stamp).",
    asOf: 2026,
    sources: [
      {
        label: "Smithsonian National Postal Museum: Great Britain",
        url: "https://postalmuseum.si.edu/exhibition/international-philately-europe-northern-europe/great-britain",
        kind: "primary",
      },
      {
        label: "The Postal Museum (London): Uniform penny postage",
        url: "https://www.postalmuseum.org/collections/highlights/philatelic-collection/british-postal-markings/uniform-penny-postage/",
        kind: "primary",
      },
    ],
    note: "Smithsonian gives the issue date as 1 May 1840, The Postal Museum (London) says valid for use from 6 May 1840; the year is identical. Earlier stamp-like proposals or local systems are not counted.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
