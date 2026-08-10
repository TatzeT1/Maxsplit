"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { splitEqual, validatePaidBy, validateSplits } from "@/lib/money/split";
import type { Expense, ExpenseSplit, Group } from "@/lib/types";
import type { ActionResult } from "./groups";

export interface ExpenseInput {
  groupId: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  paidByUid: string;
  participantUids: string[];
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

function buildSplits(amountMinor: number, participantUids: string[]): Record<string, ExpenseSplit> {
  const amounts = splitEqual(amountMinor, participantUids);
  const splits: Record<string, ExpenseSplit> = {};
  for (const uid of participantUids) {
    splits[uid] = { rawValue: 1, amountMinor: amounts[uid] };
  }
  return splits;
}

function validateExpenseInput(input: ExpenseInput): string | null {
  if (!input.description.trim()) return "invalid-description";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return "invalid-amount";
  if (input.participantUids.length === 0) return "invalid-participants";
  return null;
}

export async function addExpense(input: ExpenseInput): Promise<ActionResult<{ expenseId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };
  if (
    !group.memberUids.includes(input.paidByUid) ||
    !input.participantUids.every((uid) => group.memberUids.includes(uid))
  ) {
    return { ok: false, error: "forbidden" };
  }

  const paidBy = { [input.paidByUid]: input.amountMinor };
  const splits = buildSplits(input.amountMinor, input.participantUids);
  const splitAmountsOnly = Object.fromEntries(
    Object.entries(splits).map(([uid, split]) => [uid, split.amountMinor]),
  );

  validatePaidBy(input.amountMinor, paidBy);
  validateSplits(input.amountMinor, splitAmountsOnly);

  const now = new Date().toISOString();
  const expense: Omit<Expense, "id"> = {
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: null,
    paidBy,
    splitMode: "equal",
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

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };
  if (
    !group.memberUids.includes(input.paidByUid) ||
    !input.participantUids.every((uid) => group.memberUids.includes(uid))
  ) {
    return { ok: false, error: "forbidden" };
  }

  const paidBy = { [input.paidByUid]: input.amountMinor };
  const splits = buildSplits(input.amountMinor, input.participantUids);
  const splitAmountsOnly = Object.fromEntries(
    Object.entries(splits).map(([uid, split]) => [uid, split.amountMinor]),
  );

  validatePaidBy(input.amountMinor, paidBy);
  validateSplits(input.amountMinor, splitAmountsOnly);

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };

  await expenseRef.update({
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    paidBy,
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
  const { groupRef } = membership;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };

  await expenseRef.update({ deletedAt: new Date().toISOString() });
  return { ok: true, data: null };
}
