import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const BODY_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-bod-0001",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viel Prozent der gesamten Körperenergie verbraucht das Gehirn eines ruhenden Erwachsenen?",
      en: "What share of the entire body's energy does a resting adult's brain use?",
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
      "Share of a resting adult's total oxygen and calorie consumption that is used by the brain (round textbook figure for adults at rest).",
    asOf: 2026,
    sources: [
      {
        label: "Raichle & Gusnard 2002, PNAS (PMC copy)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC124895",
        kind: "primary",
      },
      {
        label: "BrainFacts.org (Society for Neuroscience): How much energy does the brain use?",
        url: "https://www.brainfacts.org/Brain-Anatomy-and-Function/Anatomy/2019/How-Much-Energy-Does-the-Brain-Use-020119",
        kind: "secondary",
      },
    ],
    note: "Round figure for a resting adult; the brain's share is considerably higher in young children.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0002",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viele Tage lebt ein rotes Blutkörperchen im Schnitt, bevor es abgebaut wird?",
      en: "On average, how many days does a red blood cell circulate before the body breaks it down?",
    },
    unit: {
      de: "Tage",
      en: "days",
      symbol: "d",
    },
    scale: "ratio",
    format: "quantity",
    value: "120",
    definition:
      "Average lifespan in days of a mature red blood cell (erythrocyte) circulating in a healthy adult's blood, as given in physiology textbooks.",
    asOf: 2026,
    sources: [
      {
        label: "NLM MeSH record: Erythrocytes",
        url: "https://meshb.nlm.nih.gov/record/ui?ui=D004905",
        kind: "primary",
      },
      {
        label: "BioNumbers (Harvard): Average life span of an erythrocyte (cites Vander's Hum...",
        url: "https://bionumbers.hms.harvard.edu/bionumber.aspx?id=101706",
        kind: "secondary",
      },
    ],
    note: "Textbook average of about 120 days; individual cells vary (roughly 70-140 days reported).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0003",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viel Luft strömt bei ruhiger Atmung eines Erwachsenen mit jedem Atemzug in die Lunge?",
      en: "How much air flows into an adult's lungs with each quiet breath at rest?",
    },
    unit: {
      de: "Milliliter",
      en: "milliliters",
      symbol: "ml",
    },
    scale: "ratio",
    format: "quantity",
    value: "500",
    definition:
      "Tidal volume: volume of air moved in or out with one quiet resting breath of a healthy adult (standard reference of about 7 ml per kg body mass for a young adult).",
    asOf: 2026,
    sources: [
      {
        label: "Wikipedia: Tidal volume",
        url: "https://en.wikipedia.org/wiki/Tidal_volume",
        kind: "secondary",
      },
      {
        label: "NIH NCBI Bookshelf (StatPearls): Physiology, Tidal Volume",
        url: "https://www.ncbi.nlm.nih.gov/sites/books/NBK482502/",
        kind: "primary",
      },
    ],
    note: "Standard reference figure; StatPearls gives about 400 ml for an average woman, so individual values differ.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0004",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viele Millimeter misst ein erwachsener Augapfel von vorn nach hinten?",
      en: "How many millimeters long is an adult human eyeball from front to back?",
    },
    unit: {
      de: "Millimeter",
      en: "millimeters",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "24",
    tolerance: "5",
    definition:
      "Typical front-to-back (anteroposterior or axial) length of the healthy adult eyeball, from the front of the cornea to the back of the eye, as given in anatomy references.",
    asOf: 2026,
    sources: [
      {
        label: "Wikipedia: Human eye",
        url: "https://en.wikipedia.org/wiki/Human_eye",
        kind: "secondary",
      },
      {
        label: "Variations in Eyeball Diameters of the Healthy Adults (CT study, PMC)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4238270/",
        kind: "primary",
      },
    ],
    note: "Eyes differ from person to person (axial length roughly 22-25 mm); tolerance covers the 23.4-24.2 mm values reported.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0005",
    category: "body",
    tone: "standard",
    text: {
      de: "Bei welcher Wellenlänge sieht das menschliche Auge im Tageslicht am hellsten?",
      en: "At which wavelength does the human eye see brightest in daylight?",
    },
    unit: {
      de: "Nanometer",
      en: "nanometers",
      symbol: "nm",
    },
    scale: "ratio",
    format: "quantity",
    value: "555",
    definition:
      "Wavelength at which the CIE standard photopic luminous efficiency function V(lambda), the daylight-adapted human eye's sensitivity curve, reaches its maximum.",
    asOf: 2026,
    sources: [
      {
        label: "NIST: Realization of the candela",
        url: "https://www.nist.gov/optical-radiation-group/realization-candela",
        kind: "primary",
      },
      {
        label: "arXiv: Light production metrics of radiation sources",
        url: "https://arxiv.org/pdf/1311.3504",
        kind: "secondary",
      },
    ],
    note: "Standard-observer convention. Night (scotopic) vision peaks near 510 nm; the candela's 540 THz reference corresponds to 555.016 nm.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0006",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viele Chromosomen stecken im Zellkern einer normalen menschlichen Körperzelle?",
      en: "How many chromosomes does a typical human body cell contain?",
    },
    unit: {
      de: "Chromosomen",
      en: "chromosomes",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "46",
    definition:
      "Number of chromosomes in the nucleus of a typical diploid human body (somatic) cell, 23 pairs, excluding mitochondrial DNA; egg and sperm cells carry half as many.",
    asOf: 2026,
    sources: [
      {
        label: "NHGRI (genome.gov): Diploid, genetics glossary",
        url: "https://www.genome.gov/genetics-glossary/Diploid",
        kind: "primary",
      },
      {
        label: "Wikipedia: Chromosome",
        url: "https://en.wikipedia.org/wiki/Chromosome",
        kind: "secondary",
      },
    ],
    note: "Egg and sperm cells have 23; mitochondrial DNA is not counted.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0007",
    category: "body",
    tone: "standard",
    text: {
      de: "Wie viele Zähne gehören zu einem vollständigen Milchgebiss?",
      en: "How many teeth make up a complete set of baby teeth?",
    },
    unit: {
      de: "Zähne",
      en: "teeth",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "20",
    definition:
      "Number of primary (deciduous) teeth in a complete first dentition, split evenly between upper and lower jaw.",
    asOf: 2026,
    sources: [
      {
        label: "Wikipedia: Human tooth",
        url: "https://en.wikipedia.org/wiki/Human_tooth",
        kind: "secondary",
      },
      {
        label: "NIH NCBI Bookshelf (StatPearls): Anatomy, Head and Neck, Primary Dentition",
        url: "https://www.ncbi.nlm.nih.gov/sites/books/NBK573074/",
        kind: "primary",
      },
    ],
    note: "Milk teeth emerge over roughly the first two to three years of life.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0008",
    category: "body",
    tone: "fun",
    text: {
      de: "Wie lang wäre die gesamte DNA einer einzigen Körperzelle, wenn man sie ausgestreckt aneinanderlegt?",
      en: "How long would all the DNA from one human cell be if you stretched it out in a single line?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "2",
    definition:
      "Total length of the DNA (both genome copies, all chromosomes) in the nucleus of one diploid human body cell if stretched end to end.",
    asOf: 2025,
    sources: [
      {
        label: "EMBL news",
        url: "https://www.embl.org/news/wp-json/wp/v2/posts/17994",
        kind: "primary",
      },
      {
        label: "Science News: The human genome takes shape and shifts over time",
        url: "https://new.sciencenews.org/article/human-genome-takes-shape-and-shifts-over-time",
        kind: "secondary",
      },
    ],
    note: "Cross-check arithmetic: about 6 billion nucleotides x 0.34 nm = about 2.04 m. A single (haploid) copy would be about half. Evidence from search-result text.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0009",
    category: "body",
    tone: "fun",
    text: {
      de: "In welchem Jahr wurde das Humangenomprojekt offiziell für abgeschlossen erklärt?",
      en: "In which year was the Human Genome Project officially declared complete?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2003",
    definition:
      "Calendar year of the official announcement that the Human Genome Project had reached its sequencing goals; later gap-filling work such as the gapless 2022 assembly is not counted.",
    asOf: 2003,
    sources: [
      {
        label: "NHGRI: The Human Genome Project",
        url: "https://www.genome.gov/human-genome-project",
        kind: "primary",
      },
      {
        label: "Wikipedia: Human Genome Project",
        url: "https://en.wikipedia.org/wiki/Human_Genome_Project",
        kind: "secondary",
      },
    ],
    note: "Draft was announced in 2000 and the first truly gapless assembly in 2022; the question must say 'officially declared complete'. Evidence from search-result text.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0010",
    category: "body",
    tone: "fun",
    text: {
      de: "Wie viele Zähne hat ein Kind, wenn das komplette Milchgebiss durchgebrochen ist?",
      en: "How many teeth are in a child's complete set of baby teeth?",
    },
    unit: {
      de: "Zähne",
      en: "teeth",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "20",
    definition:
      "Total number of primary (deciduous) teeth in a complete human milk-tooth set, both jaws combined, permanent teeth excluded.",
    asOf: 2025,
    sources: [
      {
        label: "MouthHealthy (American Dental Association): Baby Teeth",
        url: "https://www.mouthhealthy.org/all-topics-a-z/baby-teeth",
        kind: "primary",
      },
      {
        label: "UofM Health West / Healthwise: Primary baby teeth",
        url: "https://uofmhealthwest.org/healthwise/primary-baby-teeth/",
        kind: "secondary",
      },
    ],
    note: "ADA treated as the authoritative professional body. Evidence from search-result text.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0011",
    category: "body",
    tone: "fun",
    text: {
      de: "Wie viele Millimeter misst ein erwachsener menschlicher Augapfel im Durchmesser?",
      en: "How many millimetres wide is an adult human eyeball?",
    },
    unit: {
      de: "Millimeter",
      en: "millimetres",
      symbol: "mm",
    },
    scale: "ratio",
    format: "quantity",
    value: "24",
    definition:
      "Typical diameter of a healthy adult human eyeball (transverse diameter and axial length are both close to this), in millimetres.",
    asOf: 2023,
    sources: [
      {
        label: "PubMed: Variations in eyeball diameters of the healthy adults (CT study)",
        url: "https://pubmed.ncbi.nlm.nih.gov/25431659/",
        kind: "primary",
      },
      {
        label: "PMC: healthy-eye axial length study (table)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10366186/table/Tab1",
        kind: "primary",
      },
    ],
    note: "Individual eyes range about 21-27 mm; use the adult average. Second source attribution is slightly weaker than the first.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0012",
    category: "body",
    tone: "fun",
    text: {
      de: "In welchem Jahr wurden die Röntgenstrahlen entdeckt, die den Blick durch den Körper ermöglichen?",
      en: "In which year were X-rays discovered, the rays that let us see bones inside the body?",
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
      "Calendar year in which X-rays were first observed and identified by the German physicist who later received the first Nobel Prize in Physics for it.",
    asOf: 2025,
    sources: [
      {
        label: "Oak Ridge Associated Universities Health Physics Museum: Rontgen biography",
        url: "https://orau.org/health-physics-museum/files/library/bios/rontgen-art-logo.pdf",
        kind: "primary",
      },
      {
        label: "World History Encyclopedia: Discovery of X-Rays",
        url: "https://worldhistory.org/article/2497/discovery-of-x-rays",
        kind: "secondary",
      },
      {
        label: "New World Encyclopedia: Wilhelm Conrad Roentgen",
        url: "https://www.newworldencyclopedia.org/entry/Wilhelm_Conrad_Roentgen",
        kind: "secondary",
      },
    ],
    note: "asOf set to 2025 because the schema requires 1900..2100. Evidence attribution per URL is weaker than for other rows (a Nobel Prize page was not seen). Lower fun factor; keep only if a year row is needed.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0013",
    category: "body",
    tone: "fun",
    text: {
      de: "Aus wie vielen Buchstaben (Basenpaaren) besteht ein einfacher Satz des menschlichen Erbguts?",
      en: "How many letters (base pairs) are in a single copy of the human genome?",
    },
    unit: {
      de: "Basenpaare",
      en: "base pairs",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "3100000000",
    tolerance: "4",
    definition:
      "Number of DNA base pairs in one haploid set of human chromosomes (a single copy of the genome, not the doubled set in a body cell).",
    asOf: 2022,
    sources: [
      {
        label: "NHGRI Human Genome Project FAQ (PDF)",
        url: "https://www.genome.gov/Pages/Education/Smithsonian_Exhibition/Human_Genome_Project_FAQ.pdf",
        kind: "primary",
      },
      {
        label: "CSHL repository: The complete sequence of a human genome (T2T)",
        url: "https://repository.cshl.edu/id/eprint/40570/",
        kind: "primary",
      },
    ],
    note: "Sources genuinely differ between 3.0, 3.055 and 3.1 billion, hence the 4 percent tolerance (this is the only tolerance row). A person's doubled genome would be about 6 billion. Evidence from search-result text.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0014",
    category: "body",
    tone: "fun",
    text: {
      de: "Aus wie vielen einzelnen Knochen besteht der Schädel eines Erwachsenen samt Gesichtsknochen?",
      en: "How many separate bones make up an adult human skull, face included?",
    },
    unit: {
      de: "Knochen",
      en: "bones",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "22",
    definition:
      "Number of distinct bones in the adult skull (braincase plus facial bones); the tiny ear ossicles and the hyoid bone are not counted.",
    asOf: 2025,
    sources: [
      {
        label: "Cleveland Clinic: Axial Skeleton",
        url: "https://my.clevelandclinic.org/health/body/22344-axial-skeleton",
        kind: "secondary",
      },
      {
        label: "Kenhub: The skull",
        url: "https://www.kenhub.com/en/library/anatomy/the-skull",
        kind: "secondary",
      },
      {
        label: "StatPearls (NCBI Bookshelf): Anatomy, Head and Neck, Skull",
        url: "https://www.ncbi.nlm.nih.gov/sites/books/n/statpearls/article-29118/",
        kind: "primary",
      },
    ],
    note: "Convention-dependent (ossicles/hyoid excluded; babies have more separate pieces). The question must say 'adult' and 'face included'. StatPearls wording was not seen.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0015",
    category: "body",
    tone: "fun",
    text: {
      de: "Wie viele Knochen hat eine menschliche Hand einschließlich der Handwurzel?",
      en: "How many bones are in one human hand, wrist bones included?",
    },
    unit: {
      de: "Knochen",
      en: "bones",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "27",
    definition:
      "Number of bones in one human hand counting wrist (carpal), palm (metacarpal) and finger (phalangeal) bones; sesamoid bones are not counted.",
    asOf: 2025,
    sources: [
      {
        label: "NLM MeSH: Hand Bones",
        url: "https://meshb.nlm.nih.gov/record/ui?ui=D050276",
        kind: "primary",
      },
      {
        label: "Winchester Hospital health library: Anatomy of the Hand",
        url: "https://healthlibrary.wkhs.com/home/anatomy-of-the-hand",
        kind: "secondary",
      },
    ],
    note: "One Cleveland Clinic page says 19 bones per hand (leaves out the carpals), so the question must state wrist bones are included. Players may see 19 online.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-bod-0016",
    category: "body",
    tone: "fun",
    text: {
      de: "Wie viel wiegen alle Bakterien im Körper eines Erwachsenen zusammen?",
      en: "How much do all the bacteria in an adult's body weigh together?",
    },
    unit: {
      de: "Kilogramm",
      en: "kilograms",
      symbol: "kg",
    },
    scale: "ratio",
    format: "quantity",
    value: "0.2",
    definition:
      "Estimated total wet mass of all bacterial cells (mostly in the colon) in a 70 kg reference adult man.",
    asOf: 2016,
    sources: [
      {
        label: "Sender, Fuchs & Milo 2016, PLOS Biology (PMC)",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/4991899",
        kind: "primary",
      },
      {
        label: "BioNumbers: Overall mass of bacteria in the body",
        url: "https://bionumbers.hms.harvard.edu/bionumber.aspx?id=113003",
        kind: "secondary",
      },
    ],
    note: "LOW CONFIDENCE, needs review: both sources are the same single modelling study (about 25 percent uncertainty), not independent; older textbooks claimed 1-3 kg. Drop if a strict two-independent-sources rule applies.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
