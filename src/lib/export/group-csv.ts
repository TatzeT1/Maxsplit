import { categoryLabel } from "@/lib/categories";
import { formatIsoDate } from "@/lib/format/date";
import { minorToMajor } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { Expense, GroupMember, Settlement } from "@/lib/types";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

// A group's ledger as a CSV file that opens correctly in a German Excel by
// double-click: ";" between fields (Excel-de's list separator), a decimal
// comma without thousands separators (so cells stay numbers), a UTF-8 BOM
// (without it Excel reads umlauts as mojibake) and CRLF line ends.
//
// Rows are every live expense and every settlement, oldest first. After the
// fixed columns comes one column per person holding that row's effect on
// their balance — paid minus share for an expense, +/- the amount for a
// payment — the same terms computeBalances adds up. So each person's column
// sums to their balance, which the last row states; a departed member who is
// still in the ledger gets a column too, or the columns wouldn't net to zero.

const DELIMITER = ";";
const LINE_END = "\r\n";
const BOM = "﻿";

/**
 * A text cell. Anything starting like a formula (=, +, -, @, tab, CR) gets a
 * leading apostrophe — descriptions come from other group members, and
 * Excel would otherwise run "=HYPERLINK(…)" as a formula (CSV injection).
 */
function textCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const numberFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** A number cell: "-12,50". Never passed through textCell — its minus sign must stay a minus. */
function amountCell(amountMinor: number, currency: string): string {
  return numberFormatter.format(minorToMajor(amountMinor, currency));
}

export function buildGroupCsv(input: {
  expenses: Expense[];
  settlements: Settlement[];
  members: Record<string, GroupMember>;
  currency: string;
  t: Translate;
}): string {
  const { members, currency, t } = input;
  const expenses = input.expenses.filter((expense) => !expense.deletedAt);

  // Current members first, in the group's own order, then anyone the ledger
  // still names who has since left.
  const personUids = Object.keys(members);
  const inLedger = [
    ...expenses.flatMap((expense) => [
      ...Object.keys(expense.paidBy),
      ...Object.keys(expense.splits),
    ]),
    ...input.settlements.flatMap((settlement) => [settlement.fromUid, settlement.toUid]),
  ];
  for (const uid of inLedger) if (!personUids.includes(uid)) personUids.push(uid);

  let formerCount = 0;
  const nameOf = new Map<string, string>();
  for (const uid of personUids) {
    nameOf.set(
      uid,
      members[uid]?.displayName || t("csvExport.formerMember", { number: ++formerCount }),
    );
  }

  const rows: { date: string; createdAt: string; cells: string[]; effects: Map<string, number> }[] =
    [];

  for (const expense of expenses) {
    const effects = new Map<string, number>();
    const add = (uid: string, amount: number) => effects.set(uid, (effects.get(uid) ?? 0) + amount);
    for (const [uid, paid] of Object.entries(expense.paidBy)) add(uid, paid);
    for (const [uid, split] of Object.entries(expense.splits)) add(uid, -split.amountMinor);

    const payers = Object.entries(expense.paidBy).filter(([, paid]) => paid > 0);
    const paidBy =
      payers.length === 1
        ? nameOf.get(payers[0][0])!
        : payers
            .map(([uid, paid]) => `${nameOf.get(uid)} (${amountCell(paid, expense.currency)})`)
            .join(", ");

    rows.push({
      date: expense.date,
      createdAt: expense.createdAt,
      cells: [
        formatIsoDate(expense.date),
        textCell(t("csvExport.kindExpense")),
        textCell(expense.description),
        textCell(categoryLabel(expense.category, t)),
        amountCell(expense.amountMinor, expense.currency),
        textCell(expense.currency),
        textCell(paidBy),
      ],
      effects,
    });
  }

  for (const settlement of input.settlements) {
    const from = nameOf.get(settlement.fromUid)!;
    const to = nameOf.get(settlement.toUid)!;
    const description = t("csvExport.settlementDescription", { from, to });
    rows.push({
      date: settlement.date,
      createdAt: settlement.createdAt,
      cells: [
        formatIsoDate(settlement.date),
        textCell(t("csvExport.kindSettlement")),
        textCell(settlement.note ? `${description} – ${settlement.note}` : description),
        "",
        amountCell(settlement.amountMinor, settlement.currency),
        textCell(settlement.currency),
        textCell(from),
      ],
      // The payer's debt shrinks, the payee's credit shrinks — as in computeBalances.
      effects: new Map([
        [settlement.fromUid, settlement.amountMinor],
        [settlement.toUid, -settlement.amountMinor],
      ]),
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

  const header = [
    t("csvExport.date"),
    t("csvExport.kind"),
    t("csvExport.description"),
    t("csvExport.category"),
    t("csvExport.amount"),
    t("csvExport.currency"),
    t("csvExport.paidBy"),
    ...personUids.map((uid) => nameOf.get(uid)!),
  ].map(textCell);

  const totals = new Map<string, number>();
  const lines = [header.join(DELIMITER)];
  for (const row of rows) {
    const personCells = personUids.map((uid) => {
      const effect = row.effects.get(uid);
      if (effect === undefined) return "";
      totals.set(uid, (totals.get(uid) ?? 0) + effect);
      return amountCell(effect, currency);
    });
    lines.push([...row.cells, ...personCells].join(DELIMITER));
  }
  lines.push(
    [
      textCell(t("csvExport.balanceRow")),
      "",
      "",
      "",
      "",
      textCell(currency),
      "",
      ...personUids.map((uid) => amountCell(totals.get(uid) ?? 0, currency)),
    ].join(DELIMITER),
  );

  return BOM + lines.join(LINE_END) + LINE_END;
}

/** "WG Küche" → "wg-kueche-ausgaben-2026-09-29.csv": safe on every file system, still recognizable. */
export function groupCsvFileName(groupName: string, suffix: string, today: string): string {
  const slug = groupName
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug ? `${slug}-` : ""}${suffix}-${today}.csv`;
}
