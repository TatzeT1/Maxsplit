"use server";

import { getSession } from "@/lib/auth/session";
import { settlementCardMessage } from "@/lib/chat/cards";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/format/money";
import { getServerT } from "@/lib/i18n/server";
import { isGroupManager } from "@/lib/groups/permissions";
import { isIsoDate, MAX_NOTE_LENGTH } from "@/lib/ledger-input";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { settlementPushes } from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import type { ActivityLogEntry, Group, Settlement } from "@/lib/types";
import type { ActionResult } from "./groups";

export interface SettlementInput {
  groupId: string;
  fromUid: string;
  toUid: string;
  amountMinor: number;
  currency: string;
  date: string;
  note: string;
}

type MembershipResult =
  | { error: "not-found" | "forbidden" }
  | { group: Omit<Group, "id">; groupRef: FirebaseFirestore.DocumentReference };

async function requireGroupMembership(groupId: string, uid: string): Promise<MembershipResult> {
  const groupSnap = await adminDb.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { group, groupRef: groupSnap.ref };
}

function describeSettlement(
  settlement: Pick<Settlement, "fromUid" | "toUid" | "amountMinor" | "currency">,
  members: Record<string, { displayName: string }>,
): string {
  const fromName = members[settlement.fromUid]?.displayName ?? "?";
  const toName = members[settlement.toUid]?.displayName ?? "?";
  return `${fromName} → ${toName} (${formatMoney(settlement.amountMinor, settlement.currency)})`;
}

function validateSettlementInput(input: SettlementInput, group: Omit<Group, "id">): string | null {
  if (input.fromUid === input.toUid) return "invalid-parties";
  // Checked against group.members (real + placeholder), not memberUids —
  // settling up with a placeholder member is valid (e.g. recording cash
  // paid to someone who hasn't joined the app yet).
  if (!(input.fromUid in group.members) || !(input.toUid in group.members)) return "forbidden";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return "invalid-amount";
  // Balances net settlements against expenses at face value, in the group's currency.
  if (input.currency !== group.currency) return "invalid-currency";
  if (!isIsoDate(input.date)) return "invalid-date";
  if (typeof input.note !== "string" || input.note.trim().length > MAX_NOTE_LENGTH) {
    return "invalid-note";
  }
  return null;
}

export async function recordSettlement(
  input: SettlementInput,
): Promise<ActionResult<{ settlementId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateSettlementInput(input, group);
  if (validationError) return { ok: false, error: validationError };

  const settlement: Omit<Settlement, "id"> = {
    fromUid: input.fromUid,
    toUid: input.toUid,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    note: input.note.trim(),
    createdBy: session.uid,
    createdAt: new Date().toISOString(),
  };

  const docRef = groupRef.collection("settlements").doc();
  const batch = adminDb.batch();
  batch.set(docRef, settlement);
  // The group chat sees the payment as a silent card, in the same write (the
  // payment push already reaches the receiver).
  batch.set(
    groupRef.collection("messages").doc(),
    settlementCardMessage({
      t: await getServerT(),
      senderUid: session.uid,
      settlementId: docRef.id,
      settlement,
      nameOf: (uid) => group.members[uid]?.displayName ?? "?",
      now: settlement.createdAt,
    }),
  );
  await batch.commit();
  await recomputeGroupBalances(groupRef);
  notifyAfterResponse(
    settlementPushes({
      groupId: input.groupId,
      group,
      settlementId: docRef.id,
      settlement,
      actorUid: session.uid,
    }),
  );
  return { ok: true, data: { settlementId: docRef.id } };
}

export async function editSettlement(
  input: SettlementInput & { settlementId: string },
): Promise<ActionResult<{ settlementId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateSettlementInput(input, group);
  if (validationError) return { ok: false, error: validationError };

  const settlementRef = groupRef.collection("settlements").doc(input.settlementId);
  const settlementSnap = await settlementRef.get();
  if (!settlementSnap.exists) return { ok: false, error: "not-found" };
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if ((settlementSnap.data() as Settlement).createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  const now = new Date().toISOString();
  await settlementRef.update({
    fromUid: input.fromUid,
    toUid: input.toUid,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    note: input.note.trim(),
  });

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "settlement_edited",
    actorUid: session.uid,
    description: describeSettlement(input, group.members),
    createdAt: now,
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: { settlementId: input.settlementId } };
}

export async function deleteSettlement(input: {
  groupId: string;
  settlementId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const settlementRef = groupRef.collection("settlements").doc(input.settlementId);
  const settlementSnap = await settlementRef.get();
  if (!settlementSnap.exists) return { ok: false, error: "not-found" };
  const settlement = settlementSnap.data() as Settlement;
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if (settlement.createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  const now = new Date().toISOString();
  await settlementRef.delete();

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "settlement_deleted",
    actorUid: session.uid,
    description: describeSettlement(settlement, group.members),
    createdAt: now,
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: null };
}

/** Firestore's auto-generated ids: 20 letters and digits — all `settlements.add()` ever produces. */
const SETTLEMENT_ID = /^[A-Za-z0-9]{20}$/;

/** gRPC `ALREADY_EXISTS`, what `DocumentReference.create` rejects with when the document is there. */
const ALREADY_EXISTS = 6;

/**
 * Undoes `deleteSettlement` — the group page's "Rückgängig" toast. Unlike
 * expenses a deleted payment is really gone, so the client hands back what it
 * had on screen and this books it again under its old id.
 *
 * That makes it `recordSettlement` without the push (the receiver already
 * heard about this payment once) and with the same checks, so it can't book
 * anything a member couldn't have booked directly: every member may record a
 * payment. The restored entry belongs to whoever restores it — `createdBy`
 * decides who may later edit or delete it, and taking it from the request
 * would let a member hand someone else's name to it.
 *
 * `create` (not `set`) refuses an id that exists, so a double tap books the
 * payment once; that second call reports success, as `restoreExpense` does.
 */
export async function restoreSettlement(
  input: SettlementInput & { settlementId: string },
): Promise<ActionResult<{ settlementId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  if (typeof input.settlementId !== "string" || !SETTLEMENT_ID.test(input.settlementId)) {
    return { ok: false, error: "not-found" };
  }
  const validationError = validateSettlementInput(input, group);
  if (validationError) return { ok: false, error: validationError };

  const now = new Date().toISOString();
  const settlement: Omit<Settlement, "id"> = {
    fromUid: input.fromUid,
    toUid: input.toUid,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    note: input.note.trim(),
    createdBy: session.uid,
    createdAt: now,
  };

  try {
    await groupRef.collection("settlements").doc(input.settlementId).create(settlement);
  } catch (error) {
    if ((error as { code?: number }).code === ALREADY_EXISTS) {
      return { ok: true, data: { settlementId: input.settlementId } };
    }
    throw error;
  }

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "settlement_restored",
    actorUid: session.uid,
    description: describeSettlement(settlement, group.members),
    createdAt: now,
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: { settlementId: input.settlementId } };
}
