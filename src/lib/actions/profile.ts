"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_DISPLAY_NAME_LENGTH = 60;

/**
 * Updates the user's own display name and propagates it to every group's
 * per-member snapshot (`group.members[uid].displayName`), which is what
 * expense/balance/activity UI actually renders — see GroupMember in
 * lib/types.ts. `memberUids` only ever holds real, authenticated members, so
 * every group returned by this query is safe to update at `members.{uid}`.
 */
export async function updateDisplayName(input: {
  displayName: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const name = input.displayName.trim();
  if (!name) return { ok: false, error: "invalid-name" };
  if (name.length > MAX_DISPLAY_NAME_LENGTH) return { ok: false, error: "invalid-name" };

  await adminDb.doc(`users/${session.uid}`).set({ displayName: name }, { merge: true });

  const groups = await adminDb
    .collection("groups")
    .where("memberUids", "array-contains", session.uid)
    .get();

  if (!groups.empty) {
    const batch = adminDb.batch();
    for (const doc of groups.docs) {
      batch.update(doc.ref, { [`members.${session.uid}.displayName`]: name });
    }
    await batch.commit();
  }

  return { ok: true, data: null };
}
