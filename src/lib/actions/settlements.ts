"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
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

  const docRef = await groupRef.collection("settlements").add(settlement);
  await recomputeGroupBalances(groupRef);
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
