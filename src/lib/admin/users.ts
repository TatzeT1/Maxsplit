import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Group, GroupRole } from "@/lib/types";

export interface AdminUserSummary {
  uid: string;
  email: string | null;
  displayName: string | null;
  createdAt: string | null;
  banned: boolean;
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const snap = await adminDb.collection("users").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      email: (data.email as string | undefined) ?? null,
      displayName: (data.displayName as string | undefined) ?? null,
      createdAt: (data.createdAt as string | undefined) ?? null,
      banned: data.banned === true,
    };
  });
}

export interface AdminUserGroup {
  groupId: string;
  name: string;
  role: GroupRole;
  currency: string;
  archived: boolean;
}

export interface AdminUserDetail extends AdminUserSummary {
  photoURL: string | null;
  defaultCurrency: string | null;
  groups: AdminUserGroup[];
}

export async function getUserDetail(uid: string): Promise<AdminUserDetail | null> {
  const userSnap = await adminDb.doc(`users/${uid}`).get();
  if (!userSnap.exists) return null;
  const data = userSnap.data()!;

  const groupsSnap = await adminDb
    .collection("groups")
    .where("memberUids", "array-contains", uid)
    .get();

  const groups: AdminUserGroup[] = groupsSnap.docs.map((doc) => {
    const group = doc.data() as Omit<Group, "id">;
    return {
      groupId: doc.id,
      name: group.name,
      role: group.members[uid]?.role ?? "member",
      currency: group.currency,
      archived: group.archived,
    };
  });

  return {
    uid,
    email: (data.email as string | undefined) ?? null,
    displayName: (data.displayName as string | undefined) ?? null,
    photoURL: (data.photoURL as string | undefined) ?? null,
    defaultCurrency: (data.defaultCurrency as string | undefined) ?? null,
    createdAt: (data.createdAt as string | undefined) ?? null,
    banned: data.banned === true,
    groups,
  };
}
