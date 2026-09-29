import { describe, expect, it } from "vitest";
import { translate, type TranslationKey } from "@/lib/i18n/translate";
import { computeBalances } from "@/lib/money/balances";
import type { Expense, GroupMember, Settlement } from "@/lib/types";
import { buildGroupCsv, groupCsvFileName } from "./group-csv";

const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translate("de", key, vars);

const member = (displayName: string): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder: false,
});

const members = { anna: member("Anna"), ben: member("Ben"), cleo: member("Cleo") };

function expense(
  id: string,
  date: string,
  description: string,
  paidBy: Record<string, number>,
  shares: Record<string, number>,
  extra: Partial<Expense> = {},
): Expense {
  const amountMinor = Object.values(paidBy).reduce((sum, value) => sum + value, 0);
  return {
    id,
    description,
    amountMinor,
    currency: "EUR",
    date,
    category: "groceries",
    paidBy,
    splitMode: "exact",
    splits: Object.fromEntries(
      Object.entries(shares).map(([uid, value]) => [uid, { rawValue: value, amountMinor: value }]),
    ),
    createdBy: Object.keys(paidBy)[0],
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    deletedAt: null,
    ...extra,
  };
}

const settlement = (
  fromUid: string,
  toUid: string,
  amountMinor: number,
  date: string,
): Settlement => ({
  id: `${fromUid}-${toUid}-${date}`,
  fromUid,
  toUid,
  amountMinor,
  currency: "EUR",
  date,
  note: "",
  createdBy: fromUid,
  createdAt: `${date}T13:00:00.000Z`,
});

const expenses = [
  expense("e2", "2026-09-10", "Pizza", { ben: 3001 }, { anna: 1000, ben: 1000, cleo: 1001 }),
  expense(
    "e1",
    "2026-09-01",
    "Einkauf",
    { anna: 6000, ben: 1500 },
    { anna: 2500, ben: 2500, cleo: 2500 },
  ),
  expense("e0", "2026-09-05", "Gelöscht", { anna: 999 }, { ben: 999 }, { deletedAt: "2026-09-06" }),
  // Tom has left the group, but his expense is still in the ledger.
  expense("e3", "2026-09-12", "Kino", { tom: 2400 }, { tom: 1200, cleo: 1200 }),
];
const settlements = [settlement("cleo", "anna", 2000, "2026-09-15")];

function parse(csv: string): string[][] {
  return csv
    .replace(/^﻿/, "")
    .trimEnd()
    .split("\r\n")
    .map((line) => line.split(";"));
}

const toMinor = (cell: string) => Math.round(Number(cell.replace(",", ".")) * 100);

describe("buildGroupCsv", () => {
  const csv = buildGroupCsv({ expenses, settlements, members, currency: "EUR", t });
  const rows = parse(csv);

  it("starts with a UTF-8 BOM and ends every line with CRLF, for Excel", () => {
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("has one column per person, including a departed member still in the ledger", () => {
    expect(rows[0]).toEqual([
      "Datum",
      "Art",
      "Beschreibung",
      "Kategorie",
      "Betrag",
      "Währung",
      "Bezahlt von",
      "Anna",
      "Ben",
      "Cleo",
      "Ehemaliges Mitglied 1",
    ]);
  });

  it("lists live expenses and payments oldest first, without deleted expenses", () => {
    expect(rows.slice(1, -1).map((row) => row[2])).toEqual([
      "Einkauf",
      "Pizza",
      "Kino",
      "Cleo an Anna",
    ]);
  });

  it("writes German numbers Excel reads as numbers: decimal comma, no thousands dot", () => {
    const einkauf = rows[1];
    expect(einkauf[0]).toBe("01.09.2026");
    expect(einkauf[4]).toBe("75,00");
    expect(einkauf[6]).toBe("Anna (60,00), Ben (15,00)");
    // Anna paid 60 and owes 25: +35. Negative effects keep their plain minus.
    expect(einkauf.slice(7)).toEqual(["35,00", "-10,00", "-25,00", ""]);
  });

  it("makes every person's column add up to their balance, as the last row says", () => {
    const balances = computeBalances(
      expenses
        .filter((e) => !e.deletedAt)
        .map((e) => ({
          paidBy: e.paidBy,
          splits: Object.fromEntries(
            Object.entries(e.splits).map(([uid, s]) => [uid, s.amountMinor]),
          ),
        })),
      settlements,
    );
    const personUids = ["anna", "ben", "cleo", "tom"];
    const body = rows.slice(1, -1);
    personUids.forEach((uid, index) => {
      const column = 7 + index;
      const sum = body.reduce((total, row) => total + (row[column] ? toMinor(row[column]) : 0), 0);
      expect(sum).toBe(balances[uid]);
      expect(toMinor(rows.at(-1)![column])).toBe(balances[uid]);
    });
    expect(rows.at(-1)![0]).toBe("Saldo");
  });

  it("defuses text that Excel would run as a formula, and quotes separators", () => {
    const hostile = buildGroupCsv({
      expenses: [
        expense(
          "x",
          "2026-09-01",
          '=HYPERLINK("http://evil";"klick")',
          { anna: 100 },
          { anna: 100 },
        ),
        expense("y", "2026-09-02", "-2+3", { anna: 100 }, { anna: 100 }),
        expense("z", "2026-09-03", "Bier; Chips", { anna: 100 }, { anna: 100 }),
      ],
      settlements: [],
      members,
      currency: "EUR",
      t,
    });
    const lines = hostile.split("\r\n");
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"";""klick"")"`);
    expect(lines[2]).toContain(";'-2+3;");
    expect(lines[3]).toContain(';"Bier; Chips";');
  });
});

describe("groupCsvFileName", () => {
  it("turns the group name into a safe, readable slug", () => {
    expect(groupCsvFileName("WG Küche", "ausgaben", "2026-09-29")).toBe(
      "wg-kueche-ausgaben-2026-09-29.csv",
    );
    expect(groupCsvFileName("🏖️ Urlaub '26!", "ausgaben", "2026-09-29")).toBe(
      "urlaub-26-ausgaben-2026-09-29.csv",
    );
    expect(groupCsvFileName("🍕", "ausgaben", "2026-09-29")).toBe("ausgaben-2026-09-29.csv");
  });
});
