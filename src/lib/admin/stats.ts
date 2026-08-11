import "server-only";
import { adminDb } from "@/lib/firebase/admin";

export interface AdminStats {
  totalUsers: number;
  totalGroups: number;
  activeGroups: number;
  archivedGroups: number;
  totalExpenses: number;
  totalSettlements: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const [usersSnap, groupsSnap, archivedGroupsSnap, expensesSnap, settlementsSnap] =
    await Promise.all([
      adminDb.collection("users").count().get(),
      adminDb.collection("groups").count().get(),
      adminDb.collection("groups").where("archived", "==", true).count().get(),
      adminDb.collectionGroup("expenses").count().get(),
      adminDb.collectionGroup("settlements").count().get(),
    ]);

  const totalGroups = groupsSnap.data().count;
  const archivedGroups = archivedGroupsSnap.data().count;

  return {
    totalUsers: usersSnap.data().count,
    totalGroups,
    activeGroups: totalGroups - archivedGroups,
    archivedGroups,
    totalExpenses: expensesSnap.data().count,
    totalSettlements: settlementsSnap.data().count,
  };
}
