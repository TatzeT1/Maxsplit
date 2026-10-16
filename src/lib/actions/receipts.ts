"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type { ScannedReceipt } from "@/lib/receipt/parse";
import {
  MAX_RECEIPT_IMAGE_CHARS,
  RECEIPT_IMAGE_TYPES,
  RECEIPT_SCANS_PER_DAY,
} from "@/lib/receipt/receipt";
import { isReceiptScanConfigured, scanReceiptImage } from "@/lib/receipt/scan";
import type { Group } from "@/lib/types";
import type { ActionResult } from "./groups";

const DATA_URL = /^data:([a-z/]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * Counts one scan against the caller's daily allowance, in
 * `receiptScans/{uid}` (server-only, like pushSubscriptions). The free model
 * quotas are per API key — shared by every user of this deployment — so one
 * person scanning in a loop must not use up everyone else's day. Counted
 * before the model is asked: a failed read still spent a request.
 */
async function takeScanQuota(uid: string, today: string): Promise<boolean> {
  const ref = adminDb.collection("receiptScans").doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { day?: string; count?: number } | undefined;
    const count = data?.day === today ? (data.count ?? 0) : 0;
    if (count >= RECEIPT_SCANS_PER_DAY) return false;
    tx.set(ref, { day: today, count: count + 1 });
    return true;
  });
}

/**
 * Reads a receipt photo into line items for the receipt editor. Nothing is
 * stored — not the photo, not the items: the expense booked from them later
 * goes through addExpense like any other. The photo is a `data:` URL the
 * client has already scaled down (see prepareReceiptImage).
 */
export async function scanReceipt(input: {
  groupId: string;
  image: string;
}): Promise<ActionResult<ScannedReceipt>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (typeof input?.groupId !== "string" || !input.groupId)
    return { ok: false, error: "not-found" };
  const groupSnap = await adminDb.collection("groups").doc(input.groupId).get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(session.uid)) return { ok: false, error: "forbidden" };

  if (typeof input.image !== "string" || input.image.length > MAX_RECEIPT_IMAGE_CHARS) {
    return { ok: false, error: "invalid-image" };
  }
  const match = DATA_URL.exec(input.image);
  if (!match || !(RECEIPT_IMAGE_TYPES as readonly string[]).includes(match[1])) {
    return { ok: false, error: "invalid-image" };
  }

  if (!isReceiptScanConfigured()) return { ok: false, error: "scan-unavailable" };
  const today = new Date().toISOString().slice(0, 10);
  if (!(await takeScanQuota(session.uid, today))) return { ok: false, error: "scan-limit" };

  const outcome = await scanReceiptImage({ mimeType: match[1], base64: match[2] });
  if (!outcome.ok) return { ok: false, error: outcome.error };
  return { ok: true, data: outcome.receipt };
}
