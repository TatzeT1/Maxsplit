"use server";

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { generateInviteCode, normalizeInviteCode } from "@/lib/groups/invite-code";
import { isGroupManager } from "@/lib/groups/permissions";
import type { Group, GroupMember, GroupRole } from "@/lib/types";

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
}): Promise<ActionResult<{ groupId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "invalid-name" };

  const inviteCode = await findUniqueInviteCode();
  const now = new Date().toISOString();

  const member: GroupMember = {
    displayName: session.displayName ?? "",
    photoURL: session.photoURL ?? "",
    joinedAt: now,
    role: "owner",
  };

  const group: Omit<Group, "id"> = {
    name,
    currency: input.currency,
    createdBy: session.uid,
    createdAt: now,
    archived: false,
    memberUids: [session.uid],
    members: { [session.uid]: member },
    inviteCode,
  };

  const docRef = await adminDb.collection("groups").add(group);
  return { ok: true, data: { groupId: docRef.id } };
}

export async function joinGroupByInviteCode(input: {
  inviteCode: string;
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

  const member: GroupMember = {
    displayName: session.displayName ?? "",
    photoURL: session.photoURL ?? "",
    joinedAt: new Date().toISOString(),
    role: "member",
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
