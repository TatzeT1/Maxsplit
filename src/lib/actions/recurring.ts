"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isGroupManager } from "@/lib/groups/permissions";
import { splitEqual, validatePaidBy } from "@/lib/money/split";
import type {
  CategoryId,
  ExpenseSplit,
  Group,
  RecurringFrequency,
  RecurringRule,
} from "@/lib/types";
import type { ActionResult } from "./groups";

export interface RecurringRuleInput {
  groupId: string;
  description: string;
  amountMinor: number;
  currency: string;
  category: CategoryId | null;
  payerUid: string;
  /** Equal split only — recurring rules don't support the other split modes. */
  participantUids: string[];
  frequency: RecurringFrequency;
  startDate: string;
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

function toSplits(amounts: Record<string, number>): Record<string, ExpenseSplit> {
  const splits: Record<string, ExpenseSplit> = {};
  for (const [uid, amountMinor] of Object.entries(amounts)) {
    splits[uid] = { rawValue: 1, amountMinor };
  }
  return splits;
}

function validateRuleInput(input: RecurringRuleInput): string | null {
  if (!input.description.trim()) return "invalid-description";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return "invalid-amount";
  if (input.participantUids.length === 0) return "invalid-participants";
  return null;
}

export async function createRecurringRule(
  input: RecurringRuleInput,
): Promise<ActionResult<{ ruleId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateRuleInput(input);
  if (validationError) return { ok: false, error: validationError };

  const allUids = [input.payerUid, ...input.participantUids];
  if (!allUids.every((uid) => group.memberUids.includes(uid))) {
    return { ok: false, error: "forbidden" };
  }

  const paidBy = { [input.payerUid]: input.amountMinor };
  let splits: Record<string, ExpenseSplit>;
  try {
    validatePaidBy(input.amountMinor, paidBy);
    splits = toSplits(splitEqual(input.amountMinor, input.participantUids));
  } catch {
    return { ok: false, error: "invalid-split" };
  }

  const rule: Omit<RecurringRule, "id"> = {
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    category: input.category,
    paidBy,
    splitMode: "equal",
    splits,
    frequency: input.frequency,
    startDate: input.startDate,
    nextRunDate: input.startDate,
    active: true,
    createdBy: session.uid,
    createdAt: new Date().toISOString(),
  };

  const docRef = await groupRef.collection("recurring").add(rule);
  return { ok: true, data: { ruleId: docRef.id } };
}

async function requireRuleOwnerOrManager(
  groupRef: FirebaseFirestore.DocumentReference,
  group: Omit<Group, "id">,
  ruleId: string,
  uid: string,
): Promise<
  { error: "not-found" | "not-owner" } | { ruleRef: FirebaseFirestore.DocumentReference }
> {
  const ruleRef = groupRef.collection("recurring").doc(ruleId);
  const ruleSnap = await ruleRef.get();
  if (!ruleSnap.exists) return { error: "not-found" };
  const rule = ruleSnap.data() as RecurringRule;
  const canManage = isGroupManager(group.members[uid]?.role);
  if (rule.createdBy !== uid && !canManage) return { error: "not-owner" };
  return { ruleRef };
}

export async function setRecurringRuleActive(input: {
  groupId: string;
  ruleId: string;
  active: boolean;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const owner = await requireRuleOwnerOrManager(groupRef, group, input.ruleId, session.uid);
  if ("error" in owner) return { ok: false, error: owner.error };

  await owner.ruleRef.update({ active: input.active });
  return { ok: true, data: null };
}

export async function deleteRecurringRule(input: {
  groupId: string;
  ruleId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const owner = await requireRuleOwnerOrManager(groupRef, group, input.ruleId, session.uid);
  if ("error" in owner) return { ok: false, error: owner.error };

  await owner.ruleRef.delete();
  return { ok: true, data: null };
}
