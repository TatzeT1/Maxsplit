import type { GroupRole } from "@/lib/types";

/** Owner and admin can manage group membership and edit/delete any expense. */
export function isGroupManager(role: GroupRole | undefined): boolean {
  return role === "owner" || role === "admin";
}
