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
    roleOwner: "Ersteller",
    roleAdmin: "Admin",
    roleMember: "Mitglied",
    makeAdmin: "Zum Admin machen",
    removeAdmin: "Admin-Rechte entziehen",
    removeMember: "Entfernen",
    removeMemberConfirm: "{{name}} aus der Gruppe entfernen?",
    removeMemberConfirmBody: "{{name}} verliert den Zugriff auf diese Gruppe.",
    removeMemberError: "Entfernen fehlgeschlagen.",
    roleChangeError: "Rolle konnte nicht geändert werden.",
    leaveGroup: "Gruppe verlassen",
    leaveGroupConfirm: "Gruppe wirklich verlassen?",
    leaveGroupConfirmBody: "Du verlierst den Zugriff auf diese Gruppe.",
    leaveGroupError: "Verlassen fehlgeschlagen.",
    ownerCannotLeave: "Als Ersteller kannst du die Gruppe nicht verlassen. Lösch sie stattdessen.",
    archiveGroup: "Gruppe archivieren",
    deleteGroup: "Gruppe löschen",
    deleteGroupConfirm: "Gruppe wirklich löschen?",
    deleteGroupConfirmBody: "Alle Ausgaben und Zahlungen werden unwiderruflich gelöscht.",
    deleteGroupError: "Löschen fehlgeschlagen.",
    createError: "Gruppe konnte nicht erstellt werden.",
    joinError: "Beitreten fehlgeschlagen. Prüf den Code.",
    joinSuccess: "Du bist jetzt Mitglied von {{name}}.",
    addPlaceholder: "Person hinzufügen",
    addPlaceholderTitle: "Person hinzufügen",
    addPlaceholderHint:
      "Für Leute, die noch nicht in Split sind. Du kannst sie sofort in Ausgaben einbeziehen — sobald sie beitreten, wählen sie einfach ihren Namen aus und alles wird ihnen zugeordnet.",
    placeholderNameLabel: "Name",
    placeholderNamePlaceholder: "z. B. Max",
    addPlaceholderError: "Konnte nicht hinzugefügt werden.",
    notJoinedBadge: "Noch nicht beigetreten",
    joinStep2Title: "Bist du schon in der Liste?",
    joinStep2Hint:
      "Wähl deinen Namen aus, damit dir bisherige Ausgaben zugeordnet werden — oder tritt als neue Person bei.",
    joinAsNew: "Ich bin neu",
    joinContinue: "Weiter",
  },
  expenses: {
    title: "Ausgaben",
    empty: "Noch keine Ausgaben. Leg die erste an.",
    add: "Ausgabe hinzufügen",
    addTitle: "Neue Ausgabe",
    editTitle: "Ausgabe bearbeiten",
    duplicate: "Duplizieren",
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
    simplifyPreview: "Überweisungen vorher / nachher",
    transferSuggestion: "{{from}} zahlt {{to}} {{amount}}",
  },
  settlements: {
    record: "Zahlung eintragen",
    recordTitle: "Zahlung eintragen",
    editTitle: "Zahlung bearbeiten",
    fromLabel: "Von",
    toLabel: "An",
    amountLabel: "Betrag",
    dateLabel: "Datum",
    noteLabel: "Notiz (optional)",
    notePlaceholder: "z. B. per PayPal",
    saveError: "Zahlung konnte nicht gespeichert werden.",
    deleteConfirm: "Zahlung wirklich löschen?",
    deleteConfirmBody: "Das kann nicht rückgängig gemacht werden.",
  },
  recurring: {
    title: "Wiederkehrende Ausgaben",
    add: "Wiederkehrende Ausgabe",
    addTitle: "Neue wiederkehrende Ausgabe",
    frequencyLabel: "Wiederholung",
    frequencyWeekly: "Wöchentlich",
    frequencyMonthly: "Monatlich",
    startDateLabel: "Erstes Datum",
    participantsLabel: "Teilnehmer",
    nextRun: "Nächste Ausführung: {{date}}",
    paused: "Pausiert",
    pause: "Pausieren",
    resume: "Fortsetzen",
    deleteConfirm: "Regel wirklich löschen?",
    deleteConfirmBody: "Zukünftige Ausgaben werden nicht mehr automatisch erstellt.",
    empty: "Keine wiederkehrenden Ausgaben.",
    saveError: "Konnte nicht gespeichert werden.",
  },
  activity: {
    title: "Aktivität",
    empty: "Hier ist noch nichts passiert.",
    expenseAdded: "{{name}} hat „{{description}}“ hinzugefügt",
    expenseEdited: "{{name}} hat „{{description}}“ bearbeitet",
    expenseDeleted: "{{name}} hat „{{description}}“ gelöscht",
    settlementRecorded: "{{from}} hat {{to}} {{amount}} bezahlt",
    settlementEdited: "{{name}} hat eine Zahlung bearbeitet: {{description}}",
    settlementDeleted: "{{name}} hat eine Zahlung gelöscht: {{description}}",
  },
  errors: {
    notFound: "Nicht gefunden.",
    forbidden: "Dafür fehlt dir die Berechtigung.",
    network: "Keine Verbindung. Prüf dein Internet.",
    unknown: "Unbekannter Fehler.",
    dataLoadFailed: "Daten konnten nicht geladen werden. Lade die Seite neu.",
    errorCode: "Fehlercode: {{code}}",
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
