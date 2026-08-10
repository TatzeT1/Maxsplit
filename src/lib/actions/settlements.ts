"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import type { Group, Settlement } from "@/lib/types";
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

export async function recordSettlement(
  input: SettlementInput,
): Promise<ActionResult<{ settlementId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupSnap = await adminDb.collection("groups").doc(input.groupId).get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(session.uid)) return { ok: false, error: "forbidden" };

  if (input.fromUid === input.toUid) return { ok: false, error: "invalid-parties" };
  if (!group.memberUids.includes(input.fromUid) || !group.memberUids.includes(input.toUid)) {
    return { ok: false, error: "forbidden" };
  }
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    return { ok: false, error: "invalid-amount" };
  }

  const settlement: Omit<Settlement, "id"> = {
    fromUid: input.fromUid,
    toUid: input.toUid,
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
  };

  const docRef = await groupSnap.ref.collection("settlements").add(settlement);
  return { ok: true, data: { settlementId: docRef.id } };
}
