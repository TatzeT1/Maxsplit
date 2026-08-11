import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { translate, type Locale } from "@/lib/i18n/translate";
import type { MemberTotals, SimplifiedTransfer } from "@/lib/money/balances";
import type { Expense, GroupMember, Settlement } from "@/lib/types";

export interface SettlementPdfData {
  groupName: string;
  currency: string;
  locale: Locale;
  generatedAt: Date;
  shareUrl: string;
  members: Record<string, GroupMember>;
  transfers: SimplifiedTransfer[];
  balances: Record<string, number>;
  totals: Record<string, MemberTotals>;
  settlements: Settlement[];
  expenses: Expense[];
}

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 32,
    paddingVertical: 36,
    paddingBottom: 48,
    fontSize: 9,
    color: "#1a1a1a",
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitle: { fontSize: 9, color: "#666666", marginBottom: 20 },
  section: { marginBottom: 18 },
  heading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  empty: { fontSize: 9, color: "#666666" },
  transferRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  transferText: { fontSize: 10 },
  transferAmount: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  table: { flexDirection: "column" },
  headerRow: {
    flexDirection: "row",
    paddingBottom: 4,
    borderBottom: "1pt solid #1a1a1a",
    marginBottom: 4,
  },
  row: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.5pt solid #dddddd" },
  headerCell: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  cell: { fontSize: 8, paddingRight: 4 },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: "#999999",
    textAlign: "center",
  },
  pageNumber: {
    position: "absolute",
    bottom: 20,
    right: 32,
    fontSize: 7,
    color: "#999999",
  },
});

function memberName(members: Record<string, GroupMember>, uid: string): string {
  return members[uid]?.displayName || "?";
}

function formatContributions(
  members: Record<string, GroupMember>,
  amounts: Record<string, number>,
  currency: string,
): string {
  return Object.entries(amounts)
    .filter(([, amountMinor]) => amountMinor !== 0)
    .sort(([a], [b]) => memberName(members, a).localeCompare(memberName(members, b)))
    .map(
      ([uid, amountMinor]) => `${memberName(members, uid)}: ${formatMoney(amountMinor, currency)}`,
    )
    .join(", ");
}

function SettlementDocument(data: SettlementPdfData) {
  const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
    translate(data.locale, key, vars);

  const memberUids = Object.keys(data.members).sort((a, b) =>
    memberName(data.members, a).localeCompare(memberName(data.members, b)),
  );
  const sortedExpenses = [...data.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const sortedSettlements = [...data.settlements].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <Document
      title={t("settlementPdf.documentTitle", { group: data.groupName })}
      author="Split"
      creator="Split"
    >
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>
          {t("settlementPdf.documentTitle", { group: data.groupName })}
        </Text>
        <Text style={styles.subtitle}>
          {t("settlementPdf.generatedAt", { date: formatDate(data.generatedAt) })}
        </Text>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("settlementPdf.transfersHeading")}</Text>
          {data.transfers.length === 0 ? (
            <Text style={styles.empty}>{t("settlementPdf.transfersEmpty")}</Text>
          ) : (
            data.transfers.map((transfer, index) => (
              <View key={index} style={styles.transferRow}>
                <Text style={styles.transferText}>
                  {memberName(data.members, transfer.fromUid)} →{" "}
                  {memberName(data.members, transfer.toUid)}
                </Text>
                <Text style={styles.transferAmount}>
                  {formatMoney(transfer.amountMinor, data.currency)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("settlementPdf.breakdownHeading")}</Text>
          <View style={styles.table}>
            <View style={styles.headerRow}>
              <Text style={[styles.headerCell, { width: "22%" }]}>
                {t("settlementPdf.colPerson")}
              </Text>
              <Text style={[styles.headerCell, { width: "16%" }]}>
                {t("settlementPdf.colPaid")}
              </Text>
              <Text style={[styles.headerCell, { width: "16%" }]}>
                {t("settlementPdf.colShare")}
              </Text>
              <Text style={[styles.headerCell, { width: "16%" }]}>
                {t("settlementPdf.colSettlementsSent")}
              </Text>
              <Text style={[styles.headerCell, { width: "16%" }]}>
                {t("settlementPdf.colSettlementsReceived")}
              </Text>
              <Text style={[styles.headerCell, { width: "14%" }]}>
                {t("settlementPdf.colBalance")}
              </Text>
            </View>
            {memberUids.map((uid) => {
              const totals = data.totals[uid] ?? {
                paidMinor: 0,
                shareMinor: 0,
                settlementsSentMinor: 0,
                settlementsReceivedMinor: 0,
              };
              return (
                <View key={uid} style={styles.row}>
                  <Text style={[styles.cell, { width: "22%" }]}>
                    {memberName(data.members, uid)}
                  </Text>
                  <Text style={[styles.cell, { width: "16%" }]}>
                    {formatMoney(totals.paidMinor, data.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "16%" }]}>
                    {formatMoney(totals.shareMinor, data.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "16%" }]}>
                    {formatMoney(totals.settlementsSentMinor, data.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "16%" }]}>
                    {formatMoney(totals.settlementsReceivedMinor, data.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "14%", fontFamily: "Helvetica-Bold" }]}>
                    {formatMoney(data.balances[uid] ?? 0, data.currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("settlementPdf.settlementsHeading")}</Text>
          {sortedSettlements.length === 0 ? (
            <Text style={styles.empty}>{t("settlementPdf.settlementsEmpty")}</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.headerRow}>
                <Text style={[styles.headerCell, { width: "14%" }]}>
                  {t("settlementPdf.colDate")}
                </Text>
                <Text style={[styles.headerCell, { width: "18%" }]}>
                  {t("settlementPdf.colFrom")}
                </Text>
                <Text style={[styles.headerCell, { width: "18%" }]}>
                  {t("settlementPdf.colTo")}
                </Text>
                <Text style={[styles.headerCell, { width: "16%" }]}>
                  {t("settlementPdf.colAmount")}
                </Text>
                <Text style={[styles.headerCell, { width: "34%" }]}>
                  {t("settlementPdf.colNote")}
                </Text>
              </View>
              {sortedSettlements.map((settlement) => (
                <View key={settlement.id} style={styles.row}>
                  <Text style={[styles.cell, { width: "14%" }]}>
                    {formatDate(new Date(settlement.date))}
                  </Text>
                  <Text style={[styles.cell, { width: "18%" }]}>
                    {memberName(data.members, settlement.fromUid)}
                  </Text>
                  <Text style={[styles.cell, { width: "18%" }]}>
                    {memberName(data.members, settlement.toUid)}
                  </Text>
                  <Text style={[styles.cell, { width: "16%" }]}>
                    {formatMoney(settlement.amountMinor, settlement.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "34%" }]}>{settlement.note}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>{t("settlementPdf.expensesHeading")}</Text>
          {sortedExpenses.length === 0 ? (
            <Text style={styles.empty}>{t("settlementPdf.expensesEmpty")}</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.headerRow}>
                <Text style={[styles.headerCell, { width: "10%" }]}>
                  {t("settlementPdf.colDate")}
                </Text>
                <Text style={[styles.headerCell, { width: "23%" }]}>
                  {t("settlementPdf.colDescription")}
                </Text>
                <Text style={[styles.headerCell, { width: "12%" }]}>
                  {t("settlementPdf.colAmount")}
                </Text>
                <Text style={[styles.headerCell, { width: "27%" }]}>
                  {t("settlementPdf.colPaidBy")}
                </Text>
                <Text style={[styles.headerCell, { width: "28%" }]}>
                  {t("settlementPdf.colSplitAmong")}
                </Text>
              </View>
              {sortedExpenses.map((expense) => (
                <View key={expense.id} style={styles.row}>
                  <Text style={[styles.cell, { width: "10%" }]}>
                    {formatDate(new Date(expense.date))}
                  </Text>
                  <Text style={[styles.cell, { width: "23%" }]}>{expense.description}</Text>
                  <Text style={[styles.cell, { width: "12%" }]}>
                    {formatMoney(expense.amountMinor, expense.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "27%" }]}>
                    {formatContributions(data.members, expense.paidBy, expense.currency)}
                  </Text>
                  <Text style={[styles.cell, { width: "28%" }]}>
                    {formatContributions(
                      data.members,
                      Object.fromEntries(
                        Object.entries(expense.splits).map(([uid, split]) => [
                          uid,
                          split.amountMinor,
                        ]),
                      ),
                      expense.currency,
                    )}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.footer} fixed>
          {t("settlementPdf.footer", { url: data.shareUrl })}
        </Text>
        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  );
}

export async function renderSettlementPdf(data: SettlementPdfData): Promise<Buffer> {
  return renderToBuffer(<SettlementDocument {...data} />);
}
