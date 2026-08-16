import "server-only";
import { cookies } from "next/headers";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export const SESSION_COOKIE_NAME = "session";

export interface Session {
  uid: string;
  email: string | null;
  /**
   * Whether the identity provider verified ownership of `email`. False for a
   * bare email/password sign-up that never confirmed the address. Any
   * privilege boundary keyed on the email string (see isAdminEmail) MUST also
   * require this, or an attacker can register someone else's email unverified
   * and inherit whatever that email is trusted for.
   */
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  paypalEmail: string | null;
  iban: string | null;
}

/**
 * Reads and verifies the session cookie server-side. Returns null if absent
 * or invalid.
 *
 * `displayName`/`photoURL` come from the `users/{uid}` Firestore doc, not the
 * session cookie's own claims — the cookie only ever carries the name Google
 * had at sign-in time, which would silently overwrite a user's own edit (see
 * updateDisplayName in lib/actions/profile.ts) every time it's read. Falling
 * back to the cookie's claims covers the brief window before the profile doc
 * exists (first-ever sign-in, before POST /api/auth/session finishes).
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
    const profileSnap = await adminDb.doc(`users/${decoded.uid}`).get();
    const profile = profileSnap.data();
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified === true,
      displayName: (profile?.displayName as string | undefined) || decoded.name || null,
      photoURL: (profile?.photoURL as string | undefined) || decoded.picture || null,
      paypalEmail: (profile?.paypalEmail as string | undefined) || null,
      iban: (profile?.iban as string | undefined) || null,
    };
  } catch {
    return null;
  }
}
