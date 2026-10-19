"use server";

import { aiAllowanceLeft, groupAiMeter } from "@/lib/ai/usage";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { classifyExpenseSnapshots } from "@/lib/products/classify-expenses";
import {
  CLASSIFY_RUNS_PER_DAY,
  missingProductClasses,
  toProductClass,
} from "@/lib/products/products";
import { isReceiptScanConfigured } from "@/lib/receipt/scan";
import type { Expense, Group } from "@/lib/types";
import type { ActionResult } from "./groups";

/**
 * Texts one run classifies: two requests of CLASSIFY_BATCH_SIZE. The client
 * runs again while some remain, so a long history goes in steps that each
 * fit in one function call.
 */
const TEXTS_PER_RUN = 120;

async function requireMember(
  groupId: unknown,
  uid: string,
): Promise<
  { groupRef: FirebaseFirestore.DocumentReference; group: Omit<Group, "id"> } | { error: string }
> {
  if (typeof groupId !== "string" || !groupId) return { error: "not-found" };
  const groupSnap = await adminDb.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { groupRef: groupSnap.ref, group };
}

/** Like `receiptScans`: per user and UTC day, server-only, counted before the model is asked. */
async function takeClassifyQuota(uid: string, today: string): Promise<boolean> {
  const ref = adminDb.collection("productClassifyRuns").doc(uid);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { day?: string; count?: number } | undefined;
    const count = data?.day === today ? (data.count ?? 0) : 0;
    if (count >= CLASSIFY_RUNS_PER_DAY) return false;
    tx.set(ref, { day: today, count: count + 1 });
    return true;
  });
}

/**
 * "Jetzt einordnen" in the Auswertung tab: classifies the group's expenses
 * and receipt lines that have no ProductClass yet — older than this
 * feature, booked by a game or a recurring rule, or left over when the
 * model failed right after saving. One step of up to TEXTS_PER_RUN texts;
 * `remaining` says how many expenses still wait, so the client knows to go
 * on (and stops when a step `classified` none: the model is down or can't).
 */
export async function classifyGroupExpenses(input: {
  groupId: string;
}): Promise<ActionResult<{ classified: number; remaining: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const membership = await requireMember(input?.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  if (!isReceiptScanConfigured()) return { ok: false, error: "scan-unavailable" };

  const snapshot = await membership.groupRef
    .collection("expenses")
    .where("deletedAt", "==", null)
    .get();
  const waiting = snapshot.docs.filter((doc) => {
    const missing = missingProductClasses(doc.data() as Omit<Expense, "id">);
    return missing.expense || missing.lines.length > 0;
  });
  if (waiting.length === 0) return { ok: true, data: { classified: 0, remaining: 0 } };

  if ((await aiAllowanceLeft(input.groupId, membership.group)) <= 0) {
    return { ok: false, error: "ai-limit" };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!(await takeClassifyQuota(session.uid, today))) return { ok: false, error: "classify-limit" };

  // The newest first: this month's table is the one being looked at.
  waiting.sort((a, b) => String(b.get("date")).localeCompare(String(a.get("date"))));
  const step: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  let texts = 0;
  for (const doc of waiting) {
    const missing = missingProductClasses(doc.data() as Omit<Expense, "id">);
    const count = (missing.expense ? 1 : 0) + missing.lines.length;
    if (step.length > 0 && texts + count > TEXTS_PER_RUN) break;
    step.push(doc);
    texts += count;
  }

  const classified = await classifyExpenseSnapshots(step, {
    meter: groupAiMeter(input.groupId, session.uid, "classify"),
  });
  return { ok: true, data: { classified, remaining: waiting.length - classified } };
}

/**
 * A member correcting what an expense without a receipt was spent on. Any
 * member may: it is a label for the Auswertung and moves no money. (A
 * receipt's lines are corrected in its editor, which books through
 * editExpense.) The kind is normalized here like a model's answer.
 */
export async function setExpenseProduct(input: {
  groupId: string;
  expenseId: string;
  family: string;
  kind: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const membership = await requireMember(input?.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const product = toProductClass(input.family, input.kind);
  if (!product) return { ok: false, error: "invalid-product" };

  if (typeof input.expenseId !== "string" || !input.expenseId) {
    return { ok: false, error: "not-found" };
  }
  const expenseRef = membership.groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const expense = expenseSnap.data() as Omit<Expense, "id">;
  if (expense.deletedAt) return { ok: false, error: "not-found" };
  if (expense.receipt?.items?.length) return { ok: false, error: "invalid-product" };

  await expenseRef.update({ product });
  return { ok: true, data: null };
}
