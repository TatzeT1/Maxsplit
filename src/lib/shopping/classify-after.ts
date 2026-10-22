import "server-only";
import { after } from "next/server";
import { isReceiptScanConfigured } from "@/lib/receipt/scan";
import { classifyShoppingItem, shoppingClassifyOptions } from "./classify";

/**
 * Classifies a shopping item once the response is out (next/server's
 * `after`), like lib/products/classify-after.ts: adding never waits for a
 * model or fails because of one. An item the model couldn't place stays in
 * the list's "Noch nicht eingeordnet" section — visible, never lost.
 */
export function classifyShoppingItemAfterResponse(
  groupId: string,
  listId: string,
  itemId: string,
  uid: string,
): void {
  if (!isReceiptScanConfigured()) return;
  after(async () => {
    try {
      await classifyShoppingItem(groupId, listId, itemId, shoppingClassifyOptions(groupId, uid));
    } catch (error) {
      console.error("Shopping item classification failed", error);
    }
  });
}
