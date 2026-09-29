import { adminDb } from "@/lib/firebase/admin";
import type { Expense, Group, GroupMember, RecurringRule, Settlement } from "@/lib/types";

// Seed helpers for the emulator integration tests. They write through the
// Admin SDK exactly like the Server Actions do, so a test's starting state has
// the same shape as production data.

export function realMember(displayName: string, extra: Partial<GroupMember> = {}): GroupMember {
  return {
    displayName,
    photoURL: "",
    joinedAt: "2026-01-01T00:00:00.000Z",
    role: "member",
    isPlaceholder: false,
    ...extra,
  };
}

export function placeholderMember(displayName: string): GroupMember {
  return { ...realMember(displayName), isPlaceholder: true };
}

/**
 * Seeds `groups/{groupId}`. `memberUids` is derived from `members` (every
 * non-placeholder), the invariant createGroup/join maintain in production.
 */
export async function seedGroup(
  groupId: string,
  members: Record<string, GroupMember>,
  extra: Partial<Omit<Group, "id" | "members" | "memberUids">> = {},
): Promise<FirebaseFirestore.DocumentReference> {
  const ref = adminDb.collection("groups").doc(groupId);
  await ref.set({
    name: "WG Küche",
    icon: null,
    currency: "EUR",
    createdBy: Object.keys(members)[0],
    createdAt: "2026-01-01T00:00:00.000Z",
    archived: false,
    inviteCode: `CODE${groupId.toUpperCase()}`,
    members,
    memberUids: Object.entries(members)
      .filter(([, member]) => member.isPlaceholder !== true)
      .map(([uid]) => uid),
    ...extra,
  });
  return ref;
}

/** An equal-split expense of `amountMinor` paid entirely by `payerUid`. */
export async function seedExpense(
  groupRef: FirebaseFirestore.DocumentReference,
  payerUid: string,
  shares: Record<string, number>,
  extra: Partial<Omit<Expense, "id">> = {},
): Promise<string> {
  const amountMinor = Object.values(shares).reduce((sum, value) => sum + value, 0);
  const doc = await groupRef.collection("expenses").add({
    description: "Einkauf",
    amountMinor,
    currency: "EUR",
    date: "2026-09-01",
    category: null,
    paidBy: { [payerUid]: amountMinor },
    splitMode: "exact",
    splits: Object.fromEntries(
      Object.entries(shares).map(([uid, value]) => [uid, { rawValue: value, amountMinor: value }]),
    ),
    createdBy: payerUid,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    deletedAt: null,
    ...extra,
  } satisfies Omit<Expense, "id">);
  return doc.id;
}

export async function seedSettlement(
  groupRef: FirebaseFirestore.DocumentReference,
  fromUid: string,
  toUid: string,
  amountMinor: number,
): Promise<string> {
  const doc = await groupRef.collection("settlements").add({
    fromUid,
    toUid,
    amountMinor,
    currency: "EUR",
    date: "2026-09-02",
    note: "",
    createdBy: fromUid,
    createdAt: "2026-09-02T00:00:00.000Z",
  } satisfies Omit<Settlement, "id">);
  return doc.id;
}

/** A monthly rule paying `amountMinor` split equally across `participantUids`. */
export async function seedRecurringRule(
  groupRef: FirebaseFirestore.DocumentReference,
  payerUid: string,
  participantUids: string[],
  extra: Partial<Omit<RecurringRule, "id">> = {},
): Promise<FirebaseFirestore.DocumentReference> {
  const amountMinor = 3000 * participantUids.length;
  const rule: Omit<RecurringRule, "id"> = {
    description: "Miete",
    amountMinor,
    currency: "EUR",
    category: "housing",
    paidBy: { [payerUid]: amountMinor },
    splitMode: "equal",
    splits: Object.fromEntries(
      participantUids.map((uid) => [uid, { rawValue: 1, amountMinor: 3000 }]),
    ),
    frequency: "monthly",
    startDate: "2026-09-01",
    nextRunDate: "2026-09-01",
    active: true,
    createdBy: payerUid,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...extra,
  };
  const ref = groupRef.collection("recurring").doc();
  await ref.set(rule);
  return ref;
}

export async function readGroup(groupId: string): Promise<Omit<Group, "id">> {
  const snap = await adminDb.collection("groups").doc(groupId).get();
  return snap.data() as Omit<Group, "id">;
}
