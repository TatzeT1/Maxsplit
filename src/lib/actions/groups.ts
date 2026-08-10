"use server";

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { generateInviteCode, normalizeInviteCode } from "@/lib/groups/invite-code";
import type { Group, GroupMember } from "@/lib/types";

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
