import "server-only";
import { adminDb } from "@/lib/firebase/admin";
import { normalizeInviteCode } from "@/lib/groups/invite-code";
import type { Group } from "@/lib/types";

/**
 * Unauthenticated lookup for the invite landing page (`/invite/[code]`) —
 * needs the group name before a visitor has signed in. Only the name is
 * exposed; joining still goes through `joinGroupByInviteCode`, which
 * requires a session.
 */
export async function findGroupByInviteCode(
  rawCode: string,
): Promise<{ groupId: string; groupName: string } | null> {
  const code = normalizeInviteCode(rawCode);
  if (!code) return null;

  const matches = await adminDb.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (matches.empty) return null;

  const group = matches.docs[0].data() as Omit<Group, "id">;
  return { groupId: matches.docs[0].id, groupName: group.name };
}
