import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "@/lib/i18n/server";
import { adminDb } from "@/lib/firebase/admin";
import { computeBalances, computeMemberTotals, simplifyDebts } from "@/lib/money/balances";
import { renderSettlementPdf } from "@/lib/pdf/settlement-pdf";
import type { Expense, Group, Settlement } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Public, unauthenticated settlement PDF for a group — the link doubles as
 * its own access control (see settlement-share.ts): knowing the groupId
 * alone isn't enough, the token must also match `group.settlementShareToken`.
 * No file is ever written to storage; the PDF is regenerated from current
 * Firestore data on every request (see AGENTS.md on avoiding Storage).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string; token: string }> },
) {
  const { groupId, token } = await params;

  const groupRef = adminDb.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) {
    return new NextResponse("Not found", { status: 404 });
  }
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.settlementShareToken || group.settlementShareToken !== token) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [expensesSnap, settlementsSnap] = await Promise.all([
    groupRef.collection("expenses").orderBy("date", "desc").get(),
    groupRef.collection("settlements").orderBy("date", "desc").get(),
  ]);

  const expenses = expensesSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Expense)
    .filter((expense) => !expense.deletedAt);
  const settlements = settlementsSnap.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as Settlement,
  );

  const balanceExpenses = expenses.map((expense) => ({
    paidBy: expense.paidBy,
    splits: Object.fromEntries(
      Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
    ),
  }));

  const balances = computeBalances(balanceExpenses, settlements);
  const transfers = simplifyDebts(balances);
  const totals = computeMemberTotals(balanceExpenses, settlements);
  const locale = await getLocale();

  const pdfBuffer = await renderSettlementPdf({
    groupName: group.name,
    currency: group.currency,
    locale,
    generatedAt: new Date(),
    shareUrl: new URL(request.url).origin,
    members: group.members,
    transfers,
    balances,
    totals,
    settlements,
    expenses,
  });

  return new NextResponse(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="schuldenausgleich.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
