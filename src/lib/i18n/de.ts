/**
 * Single source of truth for all user-facing strings. No component should
 * hardcode German text — everything goes through `t()` so a future locale
 * is a new dictionary file, not a refactor.
 */
export const de = {
  app: {
    name: "Split",
    tagline: "Ausgaben teilen, ohne Kopfrechnen.",
  },
  common: {
    save: "Speichern",
    cancel: "Abbrechen",
    delete: "Löschen",
    edit: "Bearbeiten",
    close: "Schließen",
    back: "Zurück",
    next: "Weiter",
    confirm: "Bestätigen",
    loading: "Lädt …",
    retry: "Erneut versuchen",
    somethingWentWrong: "Da ist etwas schiefgelaufen.",
    unsavedChanges: "Du hast ungespeicherte Änderungen.",
  },
  nav: {
    groups: "Gruppen",
    activity: "Aktivität",
    settings: "Einstellungen",
    signOut: "Abmelden",
  },
  theme: {
    light: "Hell",
    dark: "Dunkel",
    system: "System",
    toggleLabel: "Design wechseln",
  },
  auth: {
    signInTitle: "Willkommen bei Split",
    signInSubtitle: "Melde dich an, um deine Gruppen zu sehen.",
    signInWithGoogle: "Mit Google anmelden",
    signInError: "Anmeldung fehlgeschlagen. Versuch's noch mal.",
    signingIn: "Anmeldung läuft …",
  },
  groups: {
    title: "Deine Gruppen",
    empty: "Du bist noch in keiner Gruppe. Leg eine an oder tritt einer bei.",
    create: "Gruppe erstellen",
    createTitle: "Neue Gruppe",
    join: "Gruppe beitreten",
    joinTitle: "Gruppe beitreten",
    nameLabel: "Gruppenname",
    namePlaceholder: "z. B. WG Küche",
    currencyLabel: "Währung",
    inviteCodeLabel: "Einladungscode",
    inviteCodePlaceholder: "z. B. AB3F9K7Q",
    inviteCodeHint: "Frag ein Gruppenmitglied nach dem Code.",
    inviteCodeCopied: "Einladungscode kopiert.",
    shareInvite: "Einladungscode teilen",
    members: "Mitglieder",
    membersCount: "{{count}} Mitglieder",
    memberCountSingular: "1 Mitglied",
    memberSince: "Dabei seit {{date}}",
    leaveGroup: "Gruppe verlassen",
    archiveGroup: "Gruppe archivieren",
    createError: "Gruppe konnte nicht erstellt werden.",
    joinError: "Beitreten fehlgeschlagen. Prüf den Code.",
    joinSuccess: "Du bist jetzt Mitglied von {{name}}.",
  },
  expenses: {
    title: "Ausgaben",
    empty: "Noch keine Ausgaben. Leg die erste an.",
    add: "Ausgabe hinzufügen",
    addTitle: "Neue Ausgabe",
    editTitle: "Ausgabe bearbeiten",
    deleteConfirm: "Ausgabe wirklich löschen?",
    deleteConfirmBody: "Das kann nicht rückgängig gemacht werden.",
    descriptionLabel: "Beschreibung",
    descriptionPlaceholder: "z. B. Wocheneinkauf",
    amountLabel: "Betrag",
    dateLabel: "Datum",
    paidByLabel: "Bezahlt von",
    paidByOne: "{{name}} hat bezahlt",
    paidByMultiple: "{{names}} haben bezahlt",
    multiplePayers: "Mehrere haben bezahlt",
    payerAmountsHint: "Trag ein, wie viel jede Person bezahlt hat.",
    splitModeLabel: "Aufteilung",
    splitEqual: "Gleich",
    splitShares: "Anteile",
    splitPercent: "Prozent",
    splitExact: "Genauer Betrag",
    splitEqualHint: "Wird zu gleichen Teilen auf alle Mitglieder aufgeteilt.",
    splitSharesHint: "Wird nach Anteilen aufgeteilt, z. B. 2 Anteile für Anna, 1 für Ben.",
    splitPercentHint: "Die Prozentsätze müssen zusammen 100 % ergeben.",
    splitExactHint: "Trag für jede Person den genauen Betrag ein.",
    sharesUnit: "Anteile",
    remaining: "Noch {{amount}} übrig",
    overBy: "{{amount}} zu viel",
    percentRemaining: "Noch {{percent}} % übrig",
    percentOverBy: "{{percent}} % zu viel",
    categoryLabel: "Kategorie",
    categoryPlaceholder: "Kategorie wählen",
    filterAllCategories: "Alle Kategorien",
    searchPlaceholder: "Ausgaben durchsuchen …",
    noResults: "Keine Ausgaben gefunden.",
    saveError: "Ausgabe konnte nicht gespeichert werden.",
    amountMismatch: "Die Summe der Aufteilung stimmt nicht mit dem Betrag überein.",
  },
  categories: {
    groceries: "Lebensmittel",
    restaurant: "Restaurant",
    transport: "Transport",
    housing: "Miete & Wohnen",
    utilities: "Nebenkosten",
    entertainment: "Unterhaltung",
    travel: "Reisen",
    shopping: "Shopping",
    health: "Gesundheit",
    other: "Sonstiges",
  },
  balances: {
    title: "Salden",
    settledUp: "Ihr seid quitt.",
    youOwe: "Du schuldest {{name}} {{amount}}",
    owesYou: "{{name}} schuldet dir {{amount}}",
    totalOwed: "Du schuldest insgesamt {{amount}}",
    totalOwedToYou: "Dir werden insgesamt {{amount}} geschuldet",
    simplifyDebts: "Schulden vereinfachen",
    simplifyDebtsHint: "Fasst Zahlungen zusammen, damit weniger Überweisungen nötig sind.",
    simplifyPreview: "Vorschau: vorher / nachher",
  },
  settlements: {
    record: "Zahlung eintragen",
    recordTitle: "Zahlung eintragen",
    fromLabel: "Von",
    toLabel: "An",
    amountLabel: "Betrag",
    noteLabel: "Notiz (optional)",
    notePlaceholder: "z. B. per PayPal",
    saveError: "Zahlung konnte nicht gespeichert werden.",
  },
  activity: {
    title: "Aktivität",
    empty: "Hier ist noch nichts passiert.",
    expenseAdded: "{{name}} hat „{{description}}“ hinzugefügt",
    expenseEdited: "{{name}} hat „{{description}}“ bearbeitet",
    expenseDeleted: "{{name}} hat „{{description}}“ gelöscht",
    settlementRecorded: "{{from}} hat {{to}} {{amount}} bezahlt",
  },
  errors: {
    notFound: "Nicht gefunden.",
    forbidden: "Dafür fehlt dir die Berechtigung.",
    network: "Keine Verbindung. Prüf dein Internet.",
    unknown: "Unbekannter Fehler.",
  },
} as const;

type Dictionary = typeof de;

type DotPaths<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${DotPaths<T[K]>}`;
    }[keyof T & string];

export type TranslationKey = DotPaths<Dictionary>;

function resolve(path: string): string {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (typeof node === "object" && node !== null && key in node) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, de);

  if (typeof value !== "string") {
    throw new Error(`Missing translation for key "${path}"`);
  }
  return value;
}

/**
 * Look up a German UI string by dot path, optionally interpolating
 * `{{placeholder}}` tokens, e.g. `t("balances.youOwe", { name: "Anna", amount: "12,50 €" })`.
 */
export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const template = resolve(key);
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token: string) =>
    token in vars ? String(vars[token]) : match,
  );
}
