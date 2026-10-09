import "server-only";
import type { EstimateQuestion } from "../types";

/** Researched and blind-checked by agents, not yet approved by a human (docs/estimate-bank-review.md, ADR-006). */
export const ANIMALS_ROWS: readonly EstimateQuestion[] = [
  {
    id: "est-ani-0001",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Kilometer legt eine Küstenseeschwalbe pro Jahr zwischen Arktis und Antarktis im Mittel zurück?",
      en: "How many kilometres does an Arctic tern fly per year on its migration between the Arctic and Antarctic?",
    },
    unit: {
      de: "Kilometer",
      en: "kilometres",
      symbol: "km",
    },
    scale: "ratio",
    format: "quantity",
    value: "70900",
    definition:
      "Mean total distance flown per bird per year (southbound leg, northbound leg and movement within the wintering area), measured by geolocator tracking of 11 Arctic terns breeding in Greenland and Iceland.",
    asOf: 2010,
    sources: [
      {
        label: "PNAS: Egevang et al., Tracking of Arctic terns reveals longest animal migration",
        url: "https://www.pnas.org/doi/10.1073/pnas.0909493107",
        kind: "primary",
      },
      {
        label: "NBC News: Bird's yearly trek averages record 44,000 miles",
        url: "https://www.nbcnews.com/id/wbna34812618",
        kind: "secondary",
      },
      {
        label: "Greenland Institute of Natural Resources: PhD thesis on Arctic terns in Green...",
        url: "https://natur.gl/year-en-2/2010-en/ph-d-afhandling-om-havternen-i-groenland/?lang=en",
        kind: "secondary",
      },
    ],
    note: "Study mean from 11 tracked birds (range 59,500-81,600 km); some individuals exceeded 80,000 km. Press rounds to 71,000 km, no genuine disagreement. Baltic-breeding terns migrate less (a later study found a shorter annual circuit), so the definition pins this study.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0002",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Stunden schläft ein wildes Dreifinger-Faultier pro Tag im Durchschnitt, gemessen per EEG?",
      en: "How many hours a day does a wild three-toed sloth sleep on average, measured with brain-wave recorders?",
    },
    unit: {
      de: "Stunden",
      en: "hours",
      symbol: "h",
    },
    scale: "ratio",
    format: "quantity",
    value: "9.6",
    definition:
      "Mean daily sleep of free-living brown-throated three-toed sloths (Bradypus variegatus) measured by EEG head recorders over several days in Panamanian rainforest; the first 24 h after release were excluded.",
    asOf: 2008,
    sources: [
      {
        label: "Biology Letters 2008: Sleeping outside the box (Rattenborg et al.)",
        url: "https://royalsocietypublishing.org/rsbl/article-abstract/4/4/402/66334/Sleeping-outside-the-box-electroencephalographic?redirectedFrom=fulltext",
        kind: "primary",
      },
      {
        label: "PubMed Central copy of the same paper",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC2610152/",
        kind: "primary",
      },
      {
        label: "Mongabay: New research shows wild sloths sleep less than captive sloths",
        url: "https://news.mongabay.com/2008/05/new-research-shows-wild-sloths-sleep-less-than-captive-sloths",
        kind: "secondary",
      },
    ],
    note: "Small sample: three adult females tracked for 3-5 days each; the paper gives 9.63 h. Captive sloths were earlier reported at about 15.85 h. Surprising because most people guess 15-20 h.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0003",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie tief taucht ein Kaiserpinguin maximal – der tiefste sicher gemessene Tauchgang eines Vogels?",
      en: "What is the deepest accurately measured dive of any bird, made by Aptenodytes forsteri, the largest penguin species?",
    },
    unit: {
      de: "Meter",
      en: "metres",
      symbol: "m",
    },
    scale: "ratio",
    format: "quantity",
    value: "564",
    definition:
      "Greatest accurately measured dive depth of any bird, logged by a time-depth recorder on a free-ranging Aptenodytes forsteri off East Antarctica.",
    asOf: 2006,
    sources: [
      {
        label: "Polar Biology: Extreme dives by free-ranging emperor penguins",
        url: "https://link.springer.com/content/pdf/10.1007/s00300-006-0168-8.pdf",
        kind: "primary",
      },
      {
        label: "Guinness World Records: Deepest dive by a bird",
        url: "https://www.guinnessworldrecords.com/world-records/deepest-dive-by-a-bird",
        kind: "secondary",
      },
    ],
    note: "The Australian Antarctic Division page rounds the same dive to 565 m; a separate Ross Sea study logged a maximum of 552 m. Typical dives are only 100-200 m. Record could in principle be broken by newer tag data; none found.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0004",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Beine hat das beinreichste bekannte Exemplar des Tausendfüßers Eumillipes persephone?",
      en: "How many legs does the leggiest known specimen of the millipede Eumillipes persephone have?",
    },
    unit: {
      de: "Beine",
      en: "legs",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "1306",
    definition:
      "Total leg count of the female paratype with the highest number of body segments of Eumillipes persephone, a Western Australian millipede described in 2021 with the highest leg count reported for any animal at the time.",
    asOf: 2021,
    sources: [
      {
        label: "Scientific Reports: The first true millipede - 1306 legs long (Marek et al.)",
        url: "https://www.nature.com/articles/s41598-021-02447-0",
        kind: "primary",
      },
      {
        label: "Science News: A 1,306-legged millipede is the first to live up to its name",
        url: "https://sciencenews.org/?p=3107135",
        kind: "secondary",
      },
    ],
    note: "Previous record holder Illacme plenipes has 750 legs. I did not check whether a newer species has since been described; the question is pinned to this species, so the answer stays valid either way. Other specimens of the species have fewer legs.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0005",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Nervenzellen hat ein ausgewachsener Zwitter des Fadenwurms Caenorhabditis elegans?",
      en: "How many neurons does an adult hermaphrodite of the roundworm Caenorhabditis elegans have?",
    },
    unit: {
      de: "Nervenzellen",
      en: "neurons",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "302",
    definition:
      "Total number of neurons in the nervous system of an adult C. elegans hermaphrodite (somatic plus pharyngeal network); glial and other support cells are not counted.",
    asOf: 1986,
    sources: [
      {
        label: "WormAtlas: Hermaphrodite nervous system",
        url: "https://wormatlas.org/hermaphrodite/nervous/mainframe.htm",
        kind: "primary",
      },
      {
        label: "Harvard BioNumbers: neurons in C. elegans",
        url: "https://bionumbers.hms.harvard.edu/bionumber.aspx?id=101368",
        kind: "secondary",
      },
    ],
    note: "Count applies to adult hermaphrodites only; L1 larvae have fewer. Wiring diagram dates from 1986 and the count is stable.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0006",
    category: "animals",
    tone: "standard",
    text: {
      de: "In welchem Jahr stufte die IUCN den Großen Panda von „stark gefährdet“ auf „gefährdet“ herab?",
      en: "In which year did the IUCN Red List move the giant panda from Endangered to Vulnerable?",
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
      "Year in which the IUCN Red List reclassified the giant panda (Ailuropoda melanoleuca) from Endangered to Vulnerable, announced during the IUCN World Conservation Congress.",
    asOf: 2016,
    sources: [
      {
        label: "IUCN press release: Four out of six great apes one step away from extinction...",
        url: "https://iucn.org/news/species/201609/four-out-six-great-apes-one-step-away-extinction-%E2%80%93-iucn-red-list",
        kind: "primary",
      },
      {
        label: "Earth.org: Giant pandas downgraded from endangered species to vulnerable",
        url: "https://earth.org/giant-pandas-downgraded-from-endangered-species-to-vulnerable/",
        kind: "secondary",
      },
    ],
    note: "Vulnerable is still a threatened category. One Earth.org article wrongly calls the earlier status critically endangered; the IUCN says Endangered.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0007",
    category: "animals",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde vor Südafrika ein lebender Quastenflosser entdeckt, den man nur aus Fossilien kannte?",
      en: "In which year was a living coelacanth, previously known only from fossils, found off the coast of South Africa?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1938",
    definition:
      "Year in which a living coelacanth (Latimeria chalumnae) was caught by a trawler near East London, South Africa, and recognised by science as a living member of a group known only from fossils.",
    asOf: 1938,
    sources: [
      {
        label: "Natural History Museum, London: Coelacanths, the fish that outdid the Loch Ne...",
        url: "https://www.nhm.ac.uk/discover/coelacanths-the-fish-that-outdid-the-loch-ness-monster.html",
        kind: "primary",
      },
      {
        label: "History Today: Discovery of a Living Fossil",
        url: "https://www.historytoday.com/archive/months-past/discovery-living-fossil",
        kind: "secondary",
      },
    ],
    note: "One Rhodes University caption misdates the find to 1936, and another account gives 23 December. Formal naming came in 1939. The NHM quote comes from a combined search digest, so re-check the exact wording on the page.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0008",
    category: "animals",
    tone: "standard",
    text: {
      de: "In welchem Jahr wurde der Tiergarten Schönbrunn in Wien gegründet?",
      en: "In which year was Tiergarten Schönbrunn in Vienna founded as a Habsburg menagerie?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1752",
    definition:
      "Year in which the Habsburg court menagerie that became Tiergarten Schönbrunn in Vienna was founded; public admission began later.",
    asOf: 2025,
    sources: [
      {
        label: "Zoo Vienna (Tiergarten Schönbrunn): tourist brochure",
        url: "https://www.zoovienna.at/media/uploads/dokumente/touristikfolder_deutsch_2025_web.pdf",
        kind: "primary",
      },
      {
        label: "VOL.AT: Wiener Tiergarten Schönbrunn feiert seinen 270. Geburtstag",
        url: "https://www.vol.at/wiener-tiergarten-schoenbrunn-feiert-seinen-270-geburtstag/7556335",
        kind: "secondary",
      },
    ],
    note: "Public admission began in 1778 (do not use). Named institution rather than a product; flag if the brand rule is read strictly. asOf is 2025 because the validator range starts at 1900.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0009",
    category: "animals",
    tone: "standard",
    text: {
      de: "In welchem Jahr öffnete der Zoologische Garten Berlin erstmals seine Tore?",
      en: "In which year did the Berlin Zoological Garden first open to the public?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "1844",
    definition:
      "Year of the official public opening of the Zoologische Garten Berlin in the Tiergarten park, not the earlier royal donation of animals.",
    asOf: 2025,
    sources: [
      {
        label: "Zoo Berlin: History",
        url: "https://www.zoo-berlin.de/en/about-the-zoo/history",
        kind: "primary",
      },
      {
        label: "Britannica: Berlin Zoological Garden and Aquarium",
        url: "https://www.britannica.com/place/Berlin-Zoological-Garden-and-Aquarium",
        kind: "secondary",
      },
    ],
    note: "Opening on 1 August 1844. The claim first zoo in Germany is disputed (a ZSL archive page says second after the short-lived Hamburg-Horn Thiergarten), so the question avoids it. Named institution rather than a product.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0010",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Minuten schläft ein Fregattvogel pro Tag im Flug über dem offenen Meer?",
      en: "How many minutes a day does a great frigatebird sleep while flying over the open ocean?",
    },
    unit: {
      de: "Minuten",
      en: "minutes",
      symbol: "min",
    },
    scale: "ratio",
    format: "quantity",
    value: "41.4",
    tolerance: "2",
    definition:
      "Mean total daily sleep of great frigatebirds during multi-day oceanic foraging flights, measured by EEG recordings; the paper reports it as a fraction of an hour per day.",
    asOf: 2016,
    sources: [
      {
        label: "Nature Communications 2016: Evidence that birds sleep in mid-flight (Rattenbo...",
        url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4976198/",
        kind: "primary",
      },
      {
        label: "Sleep Review: interview on frigatebirds sleeping in flight",
        url: "https://sleepreviewmag.com/?p=220073",
        kind: "secondary",
      },
    ],
    note: "Tolerance 2% because the paper's 0.69 h converts to 41.4 min while press rounds to 42 min. On land the birds sleep roughly 12-13 h a day (sources differ). Weakest source mapping of this batch; re-check the secondary URL.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0011",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Eier legte eine Legehenne in Deutschland 2025 im Durchschnitt?",
      en: "How many eggs did a laying hen in Germany lay on average in 2025?",
    },
    unit: {
      de: "Eier",
      en: "eggs",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "304",
    definition:
      "Eggs produced in 2025 divided by the annual average number of laying hens, in German farms with at least 3,000 hen places (Destatis laying-hen survey); small flocks are excluded.",
    asOf: 2025,
    sources: [
      {
        label: "Destatis press release: Eierproduktion 2025 leicht gestiegen",
        url: "https://www.destatis.de/DE/Presse/Pressemitteilungen/2026/03/PD26_086_413.html",
        kind: "primary",
      },
      {
        label: "topagrar: Eierproduktion ist 2025 leicht gestiegen",
        url: "https://www.topagrar.com/gefluegel/eierproduktion-ist-2025-leicht-gestiegen-20024022.html",
        kind: "secondary",
      },
    ],
    note: "The second source repeats the Destatis release, so it is not fully independent. The Federal Information Centre for Agriculture (BZL) quotes 299 eggs per hen, but with estimated small flocks added (different scope). Destatis gave 302 for both 2024 and 2021. Pin the year in the question.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0012",
    category: "animals",
    tone: "standard",
    text: {
      de: "Wie viele Kranicharten gibt es weltweit?",
      en: "How many species of crane exist worldwide?",
    },
    unit: {
      de: "Arten",
      en: "species",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "15",
    definition:
      "Number of extant crane species (family Gruidae) as counted by the International Crane Foundation.",
    asOf: 2025,
    sources: [
      {
        label: "International Crane Foundation (savingcranes.org)",
        url: "https://savingcranes.org/?p=801",
        kind: "primary",
      },
      {
        label: "WiscNews: International Crane Foundation event coverage",
        url: "https://wiscnews.com/life-entertainment/local/events/article_d3f4a3d8-5174-11ee-a00b-db58c9141a08.html",
        kind: "secondary",
      },
    ],
    note: "Low surprise and the second source repeats the ICF count, so treat as medium confidence. Taxonomic splits could change the number. Mapping of quotes to the two URLs comes from search digests.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0013",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie weit kann ein Großer Ameisenbär seine Zunge aus dem Maul herausstrecken?",
      en: "How far can a giant anteater stick its tongue out of its mouth?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "60",
    definition:
      "Maximum length to which the tongue of an adult giant anteater (Myrmecophaga tridactyla) can be extended out of the mouth, as stated by zoos.",
    asOf: 2026,
    sources: [
      {
        label: "Smithsonian's National Zoo, Giant anteater",
        url: "https://nationalzoo.si.edu/animals/giant-anteater",
        kind: "primary",
      },
      {
        label: "Tierpark Hellabrunn, Giant anteater",
        url: "https://www.hellabrunn.de/en/animals/america/giant-anteater",
        kind: "secondary",
      },
    ],
    note: "Maximum protrusion, not the resting length of the tongue. Zoo pages round 2 ft to 60 cm; one page lists 610 mm. Only search-result text was visible, WebFetch was blocked.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0014",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie viele Zähne hat ein ausgewachsenes Kaninchen?",
      en: "How many teeth does an adult rabbit have?",
    },
    unit: {
      de: "Zähne",
      en: "teeth",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "28",
    definition:
      "Total number of permanent teeth of an adult domestic rabbit: incisors including the two small peg teeth behind the upper front incisors, premolars and molars; rabbits have no canines.",
    asOf: 2026,
    sources: [
      {
        label: "Auburn University College of Veterinary Medicine, Dental Disease in Rabbits a...",
        url: "https://www.vetmed.auburn.edu/wp-content/uploads/2019/10/1_Dental-Disease-in-Rabbits-and-Rodents_GRAHAM.pdf",
        kind: "primary",
      },
      {
        label: "Michigan State University CANR, Domestic Rabbit Dentition (handout)",
        url: "https://www.canr.msu.edu/uploads/219/38708/Domestic_Rabbit_Dentition_x_Dr_Jay_Hreiz_0001.pdf",
        kind: "secondary",
      },
    ],
    note: "A third site (medirabbit.com) and a University of Wisconsin slide deck give the same formula. Individual rabbits can lack teeth; the value is the normal adult complement.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0015",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie viele Zähne hat eine ausgewachsene Kuh, obwohl ihr oben vorne alle Schneidezähne fehlen?",
      en: "How many teeth does an adult cow have, even though it has no upper front teeth?",
    },
    unit: {
      de: "Zähne",
      en: "teeth",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "32",
    definition:
      "Number of permanent teeth of an adult domestic cow: lower incisors, premolars and molars; the front of the upper jaw carries a toothless dental pad instead of incisors.",
    asOf: 2026,
    sources: [
      {
        label: "USDA Food Safety and Inspection Service, Using Dentition to Age Cattle",
        url: "https://www.fsis.usda.gov/sites/default/files/media_file/2021-05/Using_Dentition-to-Age-Cattle.pdf",
        kind: "primary",
      },
      {
        label: "PetMD, Dental care for cows, goats and llamas",
        url: "https://petmd.com/blogs/thedailyvet/aobriendvm/2015/february/dental-care-cows-goats-and-surprisingly-vicious-llama-324",
        kind: "secondary",
      },
    ],
    note: "Counts permanent teeth only. Some sources classify the outer lower incisor as a canine; the total stays the same.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0016",
    category: "animals",
    tone: "fun",
    text: {
      de: "Das Wievielfache seines Körpergewichts kann ein starkes Mistkäfer-Männchen höchstens ziehen?",
      en: "How many times its own body weight can the strongest male dung beetle pull?",
    },
    unit: {
      de: "Mal das eigene Körpergewicht",
      en: "times its own body weight",
      symbol: "",
    },
    scale: "ratio",
    format: "quantity",
    value: "1141",
    definition:
      "Maximum pulling force, as a multiple of its own body mass, measured for the strongest male of the horned dung beetle Onthophagus taurus in a tethered tunnel test in a 2010 study.",
    asOf: 2010,
    sources: [
      {
        label: "Queen Mary University of London, Super bug: world's strongest insect revealed",
        url: "https://www.my.qmul.ac.uk/sbbs/news/items/super-bug-worlds-strongest-insect-revealed-by-dr-rob-knell.html",
        kind: "primary",
      },
      {
        label: "Live Science, Super Bug! World's Strongest Insect Revealed",
        url: "https://www.livescience.com/animals/worlds-strongest-insect-100323.html",
        kind: "secondary",
      },
    ],
    note: "Value is the single strongest, well-fed individual in the experiment, not an average; poorly fed beetles pulled far less. The original paper was not opened, the number is as reported by the researchers' university and press.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0017",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie viele Stunden pro Tag schläft ein Fregattvogel im Schnitt, solange er tagelang über dem Meer fliegt?",
      en: "How many hours per day does a frigatebird sleep on average while it stays airborne over the ocean for days?",
    },
    unit: {
      de: "Stunden pro Tag",
      en: "hours per day",
      symbol: "h",
    },
    scale: "ratio",
    format: "quantity",
    value: "0.69",
    definition:
      "Mean daily sleep time, measured by EEG, of great frigatebirds during multi-day foraging flights over the open ocean (2016 study); on land the same birds sleep many times longer.",
    asOf: 2016,
    sources: [
      {
        label: "Rattenborg et al., Evidence that birds sleep in mid-flight, Nature Communicat...",
        url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4976198",
        kind: "primary",
      },
      {
        label: "Discover Magazine, Birds Sleep During Flights, Too",
        url: "https://discovermagazine.com/planet-earth/birds-sleep-during-flights-too",
        kind: "secondary",
      },
    ],
    note: "0.69 h is about 41 minutes; Discover rounds to 42 minutes. Value is the paper's own figure. Could be posed in minutes if the app prefers (41.4).",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0018",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie viele Stunden am Tag schlafen Faultiere im Regenwald wirklich?",
      en: "How many hours a day do sloths in the wild really sleep?",
    },
    unit: {
      de: "Stunden pro Tag",
      en: "hours per day",
      symbol: "h",
    },
    scale: "ratio",
    format: "quantity",
    value: "9.6",
    definition:
      "Mean daily sleep of wild brown-throated three-toed sloths measured by EEG head recorders in a Panamanian rain forest (2008 study), versus the roughly 16 hours reported earlier for captive sloths.",
    asOf: 2008,
    sources: [
      {
        label: "Max Planck Society press release, Not living up to their name (sloth sleep)",
        url: "https://www.mpg.de/567312/pressRelease20080521",
        kind: "primary",
      },
      {
        label: "ScienceDaily, wild sloths sleep less than captive ones (2008)",
        url: "https://www.sciencedaily.com/releases/2008/05/080513191934.htm",
        kind: "secondary",
      },
    ],
    note: "Small sample (three adult females, Bradypus variegatus, Barro Colorado Island); 9.63 h rounded to 9.6. A later study found 9-10 h for mainland and island sloths.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0019",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie weit schleudert eine Dickkopffalter-Raupe der Art Epargyreus clarus ihre Kotkügelchen?",
      en: "How far can a silver-spotted skipper caterpillar fire its droppings?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "150",
    tolerance: "2",
    definition:
      "Maximum distance over which a silver-spotted skipper caterpillar (Epargyreus clarus) ejects a frass pellet using its anal comb and raised hind-end blood pressure.",
    asOf: 2003,
    sources: [
      {
        label: "UW-Milwaukee Field Station, Skippers",
        url: "https://uwm.edu/field-station/skippers/",
        kind: "primary",
      },
      {
        label: "Science News, caterpillars fire their frass (Susan Milius)",
        url: "https://sciencenews.org/?p=35402",
        kind: "secondary",
      },
      {
        label: "UF/IFAS EDIS publication IN774 (silver-spotted skipper)",
        url: "https://edis.ifas.ufl.edu/publication/IN774/pdf",
        kind: "primary",
      },
    ],
    note: "Sources give 150 cm (UWM) and 153 cm (Science News, citing the 2003 experiments); hence tolerance 2 percent. Weiss's original paper was not opened. US species, but the fact is a classic.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0020",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie lang sind die längsten Schwanzfedern eines Witwenvogel-Männchens der Art Euplectes progne?",
      en: "How long are the longest tail feathers of a male long-tailed widowbird?",
    },
    unit: {
      de: "Zentimeter",
      en: "centimetres",
      symbol: "cm",
    },
    scale: "ratio",
    format: "quantity",
    value: "50",
    definition:
      "Length of the longest tail feathers of an adult male long-tailed widowbird (Euplectes progne) in breeding plumage, which is several times longer than the bird's body.",
    asOf: 2026,
    sources: [
      {
        label: "The Auk 111(1), 1994 (comparative widowbird study, tail described as half a m...",
        url: "https://sora.unm.edu/sites/default/files/journals/auk/v111n01/p0080-p0086.pdf",
        kind: "primary",
      },
      {
        label: "Animal Demography Unit (University of Cape Town), Weaver news",
        url: "https://weavers.adu.org.za/newstable.php?id=23",
        kind: "primary",
      },
      {
        label: "Wikipedia, Long-tailed widowbird",
        url: "https://en.wikipedia.org/wiki/Long-tailed_widowbird",
        kind: "secondary",
      },
    ],
    note: "Round figure (about half a metre). Whole-bird length of a breeding male is about 60 cm (BirdForum); one bird database lists an outlier of about 20 cm, treated as an error. Only search-result text was visible.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0021",
    category: "animals",
    tone: "fun",
    text: {
      de: "Wie langsam schlägt das Herz eines Blauwals bei einem Tauchgang im Extremfall, in Schlägen pro Minute?",
      en: "How slowly can a blue whale's heart beat during a dive, in beats per minute?",
    },
    unit: {
      de: "Schläge pro Minute",
      en: "beats per minute",
      symbol: "1/min",
    },
    scale: "ratio",
    format: "quantity",
    value: "2",
    definition:
      "Lowest heart rate recorded by an ECG tag on a free-swimming blue whale during foraging dives, as reported in the 2019 study on extreme bradycardia and tachycardia.",
    asOf: 2019,
    sources: [
      {
        label: "Goldbogen et al., Extreme bradycardia and tachycardia in the world's largest...",
        url: "https://repository.library.noaa.gov/view/noaa/29090",
        kind: "primary",
      },
      {
        label: "Gigazine, Blue whales have a minimum heart rate of only 2 per minute",
        url: "https://gigazine.net/gsc_news/en/20191128-blue-whale-heartbeat",
        kind: "secondary",
      },
    ],
    note: "Single-animal record (one adult male about 22 m long, Monterey Bay, about 9 h of data); 2 per minute is the lowest reading, typical dive rates were 4-8. Only search-result text was visible.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
  {
    id: "est-ani-0022",
    category: "animals",
    tone: "fun",
    text: {
      de: "In welchem Jahr ging der Ig-Nobelpreis für Biologie an Forschung zur Verständigung von Heringen durch Pupse?",
      en: "In which year did the Ig Nobel Prize in Biology go to research on herring communicating by farting?",
    },
    unit: {
      de: "Jahr",
      en: "year",
      symbol: "",
    },
    scale: "interval",
    format: "year",
    value: "2004",
    definition:
      "Calendar year of the Ig Nobel Prize in Biology awarded for research showing that herring produce fast repetitive tick sounds by releasing gas from the anus, probably to communicate at night.",
    asOf: 2004,
    sources: [
      {
        label: "Improbable Research (organiser of the Ig Nobel Prizes), herring farts post",
        url: "https://improbable.com/2021/02/19/a-vivid-telling-of-the-herring-farts-soviet-sub-history/",
        kind: "primary",
      },
      {
        label: "Nature news, Ig Nobel awards (published online 1 October 2004)",
        url: "https://www.nature.com/news/2004/040927/full/news040927-19.html",
        kind: "secondary",
      },
      {
        label: "Edward Willett, The 2004 Ig Nobel Prizes",
        url: "https://edwardwillett.com/?p=518",
        kind: "secondary",
      },
    ],
    note: "The question is about the prize year; the underlying herring papers are cited as 2003 or 2004 depending on the outlet, so do not ask for the paper year. Meta-science row, drop first if the bank should stay purely anatomical.",
    verified: {
      by: "Claude (Agenten, blind geprüft)",
      on: "2026-10-09",
    },
  },
];
