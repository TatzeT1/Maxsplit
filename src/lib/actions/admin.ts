"use server";

import { isAdminEmail } from "@/lib/auth/admin";
import { getSession, type Session } from "@/lib/auth/session";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Unlike requireAdminSession (used by admin pages), this never calls
 * notFound() — Server Actions run inside a client-driven request/response
 * cycle, not a page render, so callers need a value they can branch on and
 * turn into an inline error message.
 */
async function requireAdminActionSession(): Promise<Session | null> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.email)) return null;
  return session;
}

export async function adminDeleteGroup(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await requireAdminActionSession();
  if (!session) return { ok: false, error: "forbidden" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };

  await adminDb.recursiveDelete(groupRef);
  return { ok: true, data: null };
}

export async function adminSetGroupArchived(input: {
  groupId: string;
  archived: boolean;
}): Promise<ActionResult<null>> {
  const session = await requireAdminActionSession();
  if (!session) return { ok: false, error: "forbidden" };

  const groupRef = adminDb.collection("groups").doc(input.groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { ok: false, error: "not-found" };

  await groupRef.update({ archived: input.archived });
  return { ok: true, data: null };
}

/**
 * Locks a user out of the platform without touching their group memberships
 * or expense/settlement history — removing them from groups would leave
 * balances that no longer sum to zero (ADR-001's money invariant). Disabling
 * the Firebase Auth account + revoking refresh tokens kills both future
 * sign-ins and the current server session cookie, since getSession() verifies
 * with checkRevoked=true (see lib/auth/session.ts).
 */
export async function adminSetUserBanned(input: {
  uid: string;
  banned: boolean;
}): Promise<ActionResult<null>> {
  const session = await requireAdminActionSession();
  if (!session) return { ok: false, error: "forbidden" };
  if (input.uid === session.uid) return { ok: false, error: "cannot-ban-self" };

  const userRef = adminDb.doc(`users/${input.uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return { ok: false, error: "not-found" };
  if (isAdminEmail((userSnap.data()?.email as string | undefined) ?? null)) {
    return { ok: false, error: "cannot-ban-admin" };
  }

  try {
    await adminAuth.updateUser(input.uid, { disabled: input.banned });
    if (input.banned) await adminAuth.revokeRefreshTokens(input.uid);
  } catch {
    return { ok: false, error: "auth-update-failed" };
  }

  await userRef.set(
    { banned: input.banned, bannedAt: input.banned ? new Date().toISOString() : null },
    { merge: true },
  );

  return { ok: true, data: null };
}
