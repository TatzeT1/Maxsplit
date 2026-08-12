"use server";

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { generateInviteCode, normalizeInviteCode } from "@/lib/groups/invite-code";
import { isGroupManager } from "@/lib/groups/permissions";
import type { Expense, Group, GroupMember, GroupRole, Settlement } from "@/lib/types";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_INVITE_CODE_ATTEMPTS = 5;

async function findUniqueInviteCode(): Promise<string> {
  const groupsRef = adminDb.collection("groups");
  for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
    const code = generateInviteCode();
    const existing = await groupsRef.where("inviteCode", "==", code).limit(1).get();
    if (existing.empty) return code;
  }
  throw new Error("Could not generate a unique invite code");
}

export async function createGroup(input: {
  name: string;
  currency: string;
  icon?: string | null;
  memberNames?: string[];
}): Promise<ActionResult<{ groupId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid-name" };

  const inviteCode = await findUniqueInviteCode();
  const now = new Date().toISOString();

  const members: Record<string, GroupMember> = {
    [session.uid]: {
      displayName: session.displayName ?? "",
      photoURL: session.photoURL ?? "",
      joinedAt: now,
      role: "owner",
      isPlaceholder: false,
      paypalEmail: session.paypalEmail ?? "",
      iban: session.iban ?? "",
    },
  };

  // Optional placeholder members entered at creation time, same shape
  // addPlaceholderMember produces later — folded into the initial write so
  // the group never exists with only its creator as a transient state.
  const memberNames = (input.memberNames ?? []).map((n) => n.trim()).filter((n) => n.length > 0);
  for (const displayName of memberNames) {
    const placeholderId = `ph_${randomUUID()}`;
    members[placeholderId] = {
      displayName,
      photoURL: "",
      joinedAt: now,
      role: "member",
      isPlaceholder: true,
    };
  }

  const group: Omit<Group, "id"> = {
    name,
    icon: input.icon ?? null,
    currency: input.currency,
    createdBy: session.uid,
    createdAt: now,
    archived: false,
    memberUids: [session.uid],
    members,
    inviteCode,
  };

  const docRef = await adminDb.collection("groups").add(group);
  return { ok: true, data: { groupId: docRef.id } };
}

export async function updateGroup(input: {
  groupId: string;
  name: string;
  currency: string;
  icon?: string | null;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid-name" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  await groupRef.update({
    name,
    currency: input.currency,
    icon: input.icon ?? null,
  });

  return { ok: true, data: null };
}

export async function addPlaceholderMember(input: {
  groupId: string;
  displayName: string;
}): Promise<ActionResult<{ placeholderId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.displayName.trim();
  if (!name) return { ok: false, error: "invalid-name" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  // "ph_" guarantees no collision with a real Firebase Auth uid, and keeps
  // placeholder ids visually obvious in Firestore data / logs.
  const placeholderId = `ph_${randomUUID()}`;
  const placeholder: GroupMember = {
    displayName: name,
    photoURL: "",
    joinedAt: new Date().toISOString(),
    role: "member",
    isPlaceholder: true,
  };

  await groupRef.update({ [`members.${placeholderId}`]: placeholder });
  return { ok: true, data: { placeholderId } };
}

export async function renamePlaceholderMember(input: {
  groupId: string;
  uid: string;
  displayName: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.displayName.trim();
  if (!name) return { ok: false, error: "invalid-name" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (!isGroupManager(group.members[session.uid]?.role)) return { ok: false, error: "forbidden" };

  const target = group.members[input.uid];
  if (!target || !target.isPlaceholder) return { ok: false, error: "not-found" };

  await groupRef.update({ [`members.${input.uid}.displayName`]: name });
  return { ok: true, data: null };
}

export async function previewGroupByInviteCode(input: { inviteCode: string }): Promise<
  ActionResult<{
    groupId: string;
    groupName: string;
    placeholders: { id: string; displayName: string }[];
  }>
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const code = normalizeInviteCode(input.inviteCode);
  if (!code) return { ok: false, error: "invalid-code" };

  const matches = await adminDb.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (matches.empty) return { ok: false, error: "not-found" };

  const groupDoc = matches.docs[0];
  const group = groupDoc.data() as Omit<Group, "id">;

  const placeholders = Object.entries(group.members)
    .filter(([, member]) => member.isPlaceholder)
    .map(([id, member]) => ({ id, displayName: member.displayName }));

  return { ok: true, data: { groupId: groupDoc.id, groupName: group.name, placeholders } };
}

/**
 * Rewrites every expense/settlement referencing `placeholderId` to
 * `session.uid` instead, so a new real member "becomes" an existing
 * placeholder rather than starting a second, disconnected identity — the
 * whole point of placeholders is that the ledger is already correct once
 * the real person shows up. One batch (500-write Firestore limit) is plenty
 * at this app's scale; this isn't built to handle a group with hundreds of
 * expenses referencing one placeholder.
 */
async function claimPlaceholder(
  groupRef: FirebaseFirestore.DocumentReference,
  group: Omit<Group, "id">,
  placeholderId: string,
  session: {
    uid: string;
    displayName: string | null;
    photoURL: string | null;
    paypalEmail: string | null;
    iban: string | null;
  },
): Promise<string | null> {
  const placeholder = group.members[placeholderId];
  if (!placeholder || !placeholder.isPlaceholder) return "invalid-placeholder";

  const batch = adminDb.batch();

  const expensesSnap = await groupRef.collection("expenses").get();
  for (const doc of expensesSnap.docs) {
    const expense = doc.data() as Expense;
    const updates: Record<string, unknown> = {};
    if (placeholderId in expense.paidBy) {
      const paidBy = { ...expense.paidBy };
      paidBy[session.uid] = paidBy[placeholderId];
      delete paidBy[placeholderId];
      updates.paidBy = paidBy;
    }
    if (placeholderId in expense.splits) {
      const splits = { ...expense.splits };
      splits[session.uid] = splits[placeholderId];
      delete splits[placeholderId];
      updates.splits = splits;
    }
    if (Object.keys(updates).length > 0) batch.update(doc.ref, updates);
  }

  const settlementsSnap = await groupRef.collection("settlements").get();
  for (const doc of settlementsSnap.docs) {
    const settlement = doc.data() as Settlement;
    const updates: Record<string, unknown> = {};
    if (settlement.fromUid === placeholderId) updates.fromUid = session.uid;
    if (settlement.toUid === placeholderId) updates.toUid = session.uid;
    if (Object.keys(updates).length > 0) batch.update(doc.ref, updates);
  }

  const claimedMember: GroupMember = {
    displayName: session.displayName ?? placeholder.displayName,
    photoURL: session.photoURL ?? "",
    joinedAt: new Date().toISOString(),
    role: placeholder.role,
    isPlaceholder: false,
    paypalEmail: session.paypalEmail ?? "",
    iban: session.iban ?? "",
  };
  batch.update(groupRef, {
    memberUids: FieldValue.arrayUnion(session.uid),
    [`members.${placeholderId}`]: FieldValue.delete(),
    [`members.${session.uid}`]: claimedMember,
  });

  await batch.commit();
  return null;
}

export async function joinGroupByInviteCode(input: {
  inviteCode: string;
  claimPlaceholderId?: string;
}): Promise<ActionResult<{ groupId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const code = normalizeInviteCode(input.inviteCode);
  if (!code) return { ok: false, error: "invalid-code" };

  const matches = await adminDb.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (matches.empty) return { ok: false, error: "not-found" };

  const groupDoc = matches.docs[0];
  const group = groupDoc.data() as Omit<Group, "id">;

  if (group.memberUids.includes(session.uid)) {
    return { ok: true, data: { groupId: groupDoc.id } };
  }

  if (input.claimPlaceholderId) {
    const error = await claimPlaceholder(groupDoc.ref, group, input.claimPlaceholderId, session);
    if (error) return { ok: false, error };
    return { ok: true, data: { groupId: groupDoc.id } };
  }

  const member: GroupMember = {
    displayName: session.displayName ?? "",
    photoURL: session.photoURL ?? "",
    joinedAt: new Date().toISOString(),
    role: "member",
    isPlaceholder: false,
    paypalEmail: session.paypalEmail ?? "",
    iban: session.iban ?? "",
  };

  await groupDoc.ref.update({
    memberUids: FieldValue.arrayUnion(session.uid),
    [`members.${session.uid}`]: member,
  });

  return { ok: true, data: { groupId: groupDoc.id } };
}

export async function leaveGroup(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  const member = group.members[session.uid];
  if (!member) return { ok: false, error: "forbidden" };
  if (member.role === "owner") return { ok: false, error: "owner-cannot-leave" };

  await groupRef.update({
    memberUids: FieldValue.arrayRemove(session.uid),
    [`members.${session.uid}`]: FieldValue.delete(),
  });

  return { ok: true, data: null };
}

export async function deleteGroup(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (group.members[session.uid]?.role !== "owner") return { ok: false, error: "forbidden" };

  await adminDb.recursiveDelete(groupRef);
  return { ok: true, data: null };
}

export async function removeMember(input: {
  groupId: string;
  uid: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  const actor = group.members[session.uid];
  const target = group.members[input.uid];
  if (!actor || !target) return { ok: false, error: "forbidden" };
  if (input.uid === session.uid) return { ok: false, error: "cannot-remove-self" };
  if (target.role === "owner") return { ok: false, error: "cannot-remove-owner" };
  if (!isGroupManager(actor.role)) return { ok: false, error: "forbidden" };
  if (actor.role === "admin" && target.role === "admin") return { ok: false, error: "forbidden" };

  await groupRef.update({
    memberUids: FieldValue.arrayRemove(input.uid),
    [`members.${input.uid}`]: FieldValue.delete(),
  });

  return { ok: true, data: null };
}

export async function setMemberRole(input: {
  groupId: string;
  uid: string;
  role: Extract<GroupRole, "admin" | "member">;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;

  if (group.members[session.uid]?.role !== "owner") return { ok: false, error: "forbidden" };
  if (input.uid === session.uid) return { ok: false, error: "forbidden" };

  const target = group.members[input.uid];
  if (!target) return { ok: false, error: "not-found" };
  if (target.role === "owner") return { ok: false, error: "forbidden" };

  await groupRef.update({ [`members.${input.uid}.role`]: input.role });
  return { ok: true, data: null };
}
