import "server-only";
import { after } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { isReceiptScanConfigured } from "@/lib/receipt/scan";
import { classifyExpenseSnapshots } from "./classify-expenses";

/**
 * Classifies an expense once the response is out (next/server's `after`),
 * like pushes: saving never waits for a model, and never fails because of
 * one. The expense is read again inside, so it is classified as it is then
 * — an edit in the meantime is what gets classified. Failures are logged;
 * whatever stays unclassified shows up under "Jetzt einordnen".
 */
export function classifyAfterResponse(groupId: string, expenseId: string): void {
  if (!isReceiptScanConfigured()) return;
  after(async () => {
    try {
      const ref = adminDb.collection("groups").doc(groupId).collection("expenses").doc(expenseId);
      await classifyExpenseSnapshots([await ref.get()]);
    } catch (error) {
      console.error("Product classification failed", error);
    }
  });
}
