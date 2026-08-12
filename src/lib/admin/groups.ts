import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import type { Group, GroupRole } from "@/lib/types";

export interface AdminGroupSummary {
  groupId: string;
  name: string;
  icon: string | null;
  currency: string;
  archived: boolean;
  createdAt: string;
  memberCount: number;
}

export async function listGroups(): Promise<AdminGroupSummary[]> {
  const snap = await adminDb.collection("groups").orderBy("createdAt", "desc").get();
  return snap.docs.map((doc) => {
    const group = doc.data() as Omit<Group, "id">;
    return {
      groupId: doc.id,
      name: group.name,
      icon: group.icon ?? null,
      currency: group.currency,
      archived: group.archived,
      createdAt: group.createdAt,
      memberCount: group.memberUids.length,
    };
  });
}

export interface AdminGroupMember {
  uid: string;
  displayName: string;
  role: GroupRole;
  isPlaceholder: boolean;
}

export interface AdminGroupDetail extends AdminGroupSummary {
  createdBy: string;
  inviteCode: string;
  members: AdminGroupMember[];
  expenseCount: number;
  settlementCount: number;
}

export async function getGroupDetail(groupId: string): Promise<AdminGroupDetail | null> {
  const groupRef = adminDb.collection("groups").doc(groupId);
  const [groupSnap, expensesCountSnap, settlementsCountSnap] = await Promise.all([
    groupRef.get(),
    groupRef.collection("expenses").count().get(),
    groupRef.collection("settlements").count().get(),
  ]);
  if (!groupSnap.exists) return null;
  const group = groupSnap.data() as Omit<Group, "id">;

  const members: AdminGroupMember[] = Object.entries(group.members).map(([uid, member]) => ({
    uid,
    displayName: member.displayName,
    role: member.role,
    isPlaceholder: member.isPlaceholder === true,
  }));

  return {
    groupId,
    name: group.name,
    icon: group.icon ?? null,
    currency: group.currency,
    archived: group.archived,
    createdAt: group.createdAt,
    createdBy: group.createdBy,
    inviteCode: group.inviteCode,
    memberCount: group.memberUids.length,
    members,
    expenseCount: expensesCountSnap.data().count,
    settlementCount: settlementsCountSnap.data().count,
  };
}
