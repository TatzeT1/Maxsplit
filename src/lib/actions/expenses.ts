"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isGroupManager } from "@/lib/groups/permissions";
import {
  splitByPercent,
  splitByShares,
  splitEqual,
  splitExact,
  validatePaidBy,
} from "@/lib/money/split";
import type { CategoryId, Expense, ExpenseSplit, Group, SplitMode } from "@/lib/types";
import type { ActionResult } from "./groups";

export interface ExpenseInput {
  groupId: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: CategoryId | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  /** Participant uids for "equal"; ignored for the other modes. */
  participantUids: string[];
  /** Raw per-uid input for "shares" (share count), "percent" (0-100), or "exact" (minor units). */
  splitInputs: Record<string, number>;
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

function toSplits(
  amounts: Record<string, number>,
  rawValues: Record<string, number>,
): Record<string, ExpenseSplit> {
  const splits: Record<string, ExpenseSplit> = {};
  for (const [uid, amountMinor] of Object.entries(amounts)) {
    splits[uid] = { rawValue: rawValues[uid], amountMinor };
  }
  return splits;
}

/** Computes per-participant splits for the given mode. Throws on invalid split input. */
function buildSplits(input: ExpenseInput): Record<string, ExpenseSplit> {
  switch (input.splitMode) {
    case "equal": {
      const amounts = splitEqual(input.amountMinor, input.participantUids);
      const rawValues = Object.fromEntries(input.participantUids.map((uid) => [uid, 1]));
      return toSplits(amounts, rawValues);
    }
    case "shares": {
      const amounts = splitByShares(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
    case "percent": {
      const amounts = splitByPercent(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
    case "exact": {
      const amounts = splitExact(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
  }
}

function splitParticipantUids(input: ExpenseInput): string[] {
  return input.splitMode === "equal" ? input.participantUids : Object.keys(input.splitInputs);
}

function validateExpenseInput(input: ExpenseInput): string | null {
  if (!input.description.trim()) return "invalid-description";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return "invalid-amount";
  if (Object.keys(input.paidBy).length === 0) return "invalid-payer";
  if (splitParticipantUids(input).length === 0) return "invalid-participants";
  return null;
}

async function resolveExpense(
  input: ExpenseInput,
  session: { uid: string },
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      group: Omit<Group, "id">;
      groupRef: FirebaseFirestore.DocumentReference;
      splits: Record<string, ExpenseSplit>;
    }
> {
  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };

  const allParticipantUids = [...Object.keys(input.paidBy), ...splitParticipantUids(input)];
  if (!allParticipantUids.every((uid) => group.memberUids.includes(uid))) {
    return { ok: false, error: "forbidden" };
  }

  try {
    validatePaidBy(input.amountMinor, input.paidBy);
    const splits = buildSplits(input);
    return { ok: true, group, groupRef, splits };
  } catch {
    return { ok: false, error: "invalid-split" };
  }
}

export async function addExpense(
  input: ExpenseInput,
): Promise<ActionResult<{ expenseId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const resolved = await resolveExpense(input, session);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { groupRef, splits } = resolved;

  const now = new Date().toISOString();
  const expense: Omit<Expense, "id"> = {
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: input.category,
    paidBy: input.paidBy,
    splitMode: input.splitMode,
    splits,
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const docRef = await groupRef.collection("expenses").add(expense);
  return { ok: true, data: { expenseId: docRef.id } };
}

export async function editExpense(
  input: ExpenseInput & { expenseId: string },
): Promise<ActionResult<{ expenseId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const resolved = await resolveExpense(input, session);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { group, groupRef, splits } = resolved;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if ((expenseSnap.data() as Expense).createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  await expenseRef.update({
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: input.category,
    paidBy: input.paidBy,
    splitMode: input.splitMode,
    splits,
    updatedAt: new Date().toISOString(),
  });

  return { ok: true, data: { expenseId: input.expenseId } };
}

export async function deleteExpense(input: {
  groupId: string;
  expenseId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if ((expenseSnap.data() as Expense).createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  await expenseRef.update({ deletedAt: new Date().toISOString() });
  return { ok: true, data: null };
}
