import "server-only";
import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { translate, type Locale } from "@/lib/i18n/translate";
import type { MemberTotals, SimplifiedTransfer } from "@/lib/money/balances";
import type { CategoryId, Expense, GroupMember, Settlement } from "@/lib/types";

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

// Pulled from the app's own CSS theme (src/app/globals.css), converted from
// oklch to hex — react-pdf/pdfkit doesn't understand oklch. Keep this in sync
// if the theme changes so the receipt still looks like it came from the app.
const colors = {
  background: "#fdf7f0",
  page: "#f6efe4",
  card: "#fffdf8",
  cardTint: "#fbf3e7",
  ink: "#12202f",
  inkMuted: "#586876",
  primary: "#df5200",
  primaryTint: "#fce7d6",
  primaryForeground: "#fffaf4",
  secondary: "#cfebec",
  secondaryForeground: "#123f40",
  accent: "#00989a",
  border: "#e5ddd1",
  borderStrong: "#d9cdb8",
  success: "#1b9247",
  successTint: "#e4f5e9",
  destructive: "#c23b1f",
  destructiveTint: "#fbe7e2",
};

const CATEGORY_DOT: Record<CategoryId, string> = {
  groceries: "#10b981",
  restaurant: "#f97316",
  transport: "#0ea5e9",
  housing: "#8b5cf6",
  utilities: "#f59e0b",
  entertainment: "#ec4899",
  travel: "#06b6d4",
  shopping: "#d946ef",
  health: "#f43f5e",
  other: "#94a3b8",
};

function categoryDot(category: CategoryId | null): string {
  return category ? CATEGORY_DOT[category] : CATEGORY_DOT.other;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.page,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 56,
    fontSize: 9,
    color: colors.ink,
  },
  ribbon: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.primary,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 26,
    paddingVertical: 24,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  brandMark: { flexDirection: "row", alignItems: "center" },
  logoBadge: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
  },
  logoBadgeText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: colors.primaryForeground,
  },
  brandName: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: colors.ink,
    letterSpacing: 0.3,
  },
  eyebrowPill: {
    backgroundColor: colors.secondary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  eyebrowText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: colors.secondaryForeground,
    letterSpacing: 1,
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 3, color: colors.ink },
  subtitle: { fontSize: 9, color: colors.inkMuted },
  perforation: {
    borderBottomWidth: 1.2,
    borderBottomColor: colors.borderStrong,
    borderBottomStyle: "dashed",
    marginTop: 16,
    marginBottom: 16,
  },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  summaryChip: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 11,
  },
  summaryLabel: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    color: colors.inkMuted,
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  summaryValue: { fontSize: 13, fontFamily: "Helvetica-Bold", color: colors.ink },
  section: { marginBottom: 16 },
  headingRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  headingBar: {
    width: 3,
    height: 10,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginRight: 6,
  },
  heading: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: colors.ink },
  empty: { fontSize: 9, color: colors.inkMuted, fontStyle: "italic" },
  transferCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 7,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  transferNames: { flexDirection: "row", alignItems: "center" },
  transferText: { fontSize: 9.5, color: colors.ink },
  transferArrowWrap: { marginHorizontal: 7 },
  transferAmountPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  transferAmount: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: colors.primary },
  table: { flexDirection: "column", borderRadius: 7, overflow: "hidden" },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: colors.cardTint,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5.5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.6,
    borderBottomColor: colors.border,
  },
  rowAlt: { backgroundColor: colors.cardTint },
  headerCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    color: colors.inkMuted,
    letterSpacing: 0.3,
  },
  cell: { fontSize: 8.5, paddingRight: 4, color: colors.ink },
  balancePositive: { color: colors.success, fontFamily: "Helvetica-Bold" },
  balanceNegative: { color: colors.destructive, fontFamily: "Helvetica-Bold" },
  balanceZero: { color: colors.inkMuted, fontFamily: "Helvetica-Bold" },
  categoryDotCell: { flexDirection: "row", alignItems: "center" },
  categoryDot: { width: 5.5, height: 5.5, borderRadius: 3, marginRight: 5 },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 22,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    borderTopStyle: "dashed",
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerTagline: { fontSize: 8, fontFamily: "Helvetica-Bold", color: colors.ink },
  footerMeta: { fontSize: 7, color: colors.inkMuted, marginTop: 2 },
  pageNumberPill: {
    backgroundColor: colors.secondary,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 7,
    color: colors.secondaryForeground,
    fontFamily: "Helvetica-Bold",
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
  const totalExpensesMinor = data.expenses.reduce((sum, expense) => sum + expense.amountMinor, 0);

  return (
    <Document
      title={t("settlementPdf.documentTitle", { group: data.groupName })}
      author="Split"
      creator="Split"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.ribbon} fixed />
        <View style={styles.sheet}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <View style={styles.logoBadge}>
                <Text style={styles.logoBadgeText}>S</Text>
              </View>
              <Text style={styles.brandName}>Split</Text>
            </View>
            <View style={styles.eyebrowPill}>
              <Text style={styles.eyebrowText}>{t("settlementPdf.badge").toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.title}>{data.groupName}</Text>
          <Text style={styles.subtitle}>
            {t("settlementPdf.generatedAt", { date: formatDate(data.generatedAt) })}
          </Text>

          <View style={styles.perforation} />

          <View style={styles.summaryRow}>
            <View style={[styles.summaryChip, { backgroundColor: colors.primaryTint }]}>
              <Text style={styles.summaryLabel}>
                {t("settlementPdf.summaryExpenses").toUpperCase()}
              </Text>
              <Text style={[styles.summaryValue, { color: colors.primary }]}>
                {formatMoney(totalExpensesMinor, data.currency)}
              </Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: colors.secondary }]}>
              <Text style={styles.summaryLabel}>
                {t("settlementPdf.summaryMembers").toUpperCase()}
              </Text>
              <Text style={[styles.summaryValue, { color: colors.secondaryForeground }]}>
                {memberUids.length}
              </Text>
            </View>
            <View style={[styles.summaryChip, { backgroundColor: colors.cardTint }]}>
              <Text style={styles.summaryLabel}>
                {t("settlementPdf.summaryTransfers").toUpperCase()}
              </Text>
              <Text style={styles.summaryValue}>{data.transfers.length}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.headingRow}>
              <View style={styles.headingBar} />
              <Text style={styles.heading}>{t("settlementPdf.transfersHeading")}</Text>
            </View>
            {data.transfers.length === 0 ? (
              <Text style={styles.empty}>{t("settlementPdf.transfersEmpty")}</Text>
            ) : (
              data.transfers.map((transfer, index) => (
                <View
                  key={index}
                  style={[
                    styles.transferCard,
                    index % 2 === 1 ? { backgroundColor: colors.cardTint } : undefined,
                  ]}
                  wrap={false}
                >
                  <View style={styles.transferNames}>
                    <Text style={styles.transferText}>
                      {memberName(data.members, transfer.fromUid)}
                    </Text>
                    <View style={styles.transferArrowWrap}>
                      <Svg width={9} height={7} viewBox="0 0 9 7">
                        <Path d="M0 0.5 L6.5 3.5 L0 6.5 Z" fill={colors.primary} />
                      </Svg>
                    </View>
                    <Text style={styles.transferText}>
                      {memberName(data.members, transfer.toUid)}
                    </Text>
                  </View>
                  <View style={styles.transferAmountPill}>
                    <Text style={styles.transferAmount}>
                      {formatMoney(transfer.amountMinor, data.currency)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.headingRow}>
              <View style={styles.headingBar} />
              <Text style={styles.heading}>{t("settlementPdf.breakdownHeading")}</Text>
            </View>
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
              {memberUids.map((uid, index) => {
                const totals = data.totals[uid] ?? {
                  paidMinor: 0,
                  shareMinor: 0,
                  settlementsSentMinor: 0,
                  settlementsReceivedMinor: 0,
                };
                const balanceMinor = data.balances[uid] ?? 0;
                const balanceStyle =
                  balanceMinor > 0
                    ? styles.balancePositive
                    : balanceMinor < 0
                      ? styles.balanceNegative
                      : styles.balanceZero;
                return (
                  <View
                    key={uid}
                    style={[styles.row, index % 2 === 1 ? styles.rowAlt : undefined]}
                    wrap={false}
                  >
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
                    <Text style={[styles.cell, { width: "14%" }, balanceStyle]}>
                      {formatMoney(balanceMinor, data.currency)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.headingRow}>
              <View style={styles.headingBar} />
              <Text style={styles.heading}>{t("settlementPdf.settlementsHeading")}</Text>
            </View>
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
                {sortedSettlements.map((settlement, index) => (
                  <View
                    key={settlement.id}
                    style={[styles.row, index % 2 === 1 ? styles.rowAlt : undefined]}
                    wrap={false}
                  >
                    <Text style={[styles.cell, { width: "14%" }]}>
                      {formatDate(new Date(settlement.date))}
                    </Text>
                    <Text style={[styles.cell, { width: "18%" }]}>
                      {memberName(data.members, settlement.fromUid)}
                    </Text>
                    <Text style={[styles.cell, { width: "18%" }]}>
                      {memberName(data.members, settlement.toUid)}
                    </Text>
                    <Text
                      style={[
                        styles.cell,
                        { width: "16%", color: colors.success, fontFamily: "Helvetica-Bold" },
                      ]}
                    >
                      {formatMoney(settlement.amountMinor, settlement.currency)}
                    </Text>
                    <Text style={[styles.cell, { width: "34%" }]}>{settlement.note}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.headingRow}>
              <View style={styles.headingBar} />
              <Text style={styles.heading}>{t("settlementPdf.expensesHeading")}</Text>
            </View>
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
                {sortedExpenses.map((expense, index) => (
                  <View
                    key={expense.id}
                    style={[styles.row, index % 2 === 1 ? styles.rowAlt : undefined]}
                    wrap={false}
                  >
                    <Text style={[styles.cell, { width: "10%" }]}>
                      {formatDate(new Date(expense.date))}
                    </Text>
                    <View style={[styles.categoryDotCell, { width: "23%" }]}>
                      <View
                        style={[
                          styles.categoryDot,
                          { backgroundColor: categoryDot(expense.category) },
                        ]}
                      />
                      <Text style={styles.cell}>{expense.description}</Text>
                    </View>
                    <Text style={[styles.cell, { width: "12%", fontFamily: "Helvetica-Bold" }]}>
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
        </View>

        <View style={styles.footer} fixed>
          <View style={styles.footerRow}>
            <View>
              <Text style={styles.footerTagline}>{t("settlementPdf.footerTagline")}</Text>
              <Text style={styles.footerMeta}>
                {t("settlementPdf.footer", { url: data.shareUrl })}
              </Text>
            </View>
            <Text
              style={styles.pageNumberPill}
              render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
            />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderSettlementPdf(data: SettlementPdfData): Promise<Buffer> {
  return renderToBuffer(<SettlementDocument {...data} />);
}
