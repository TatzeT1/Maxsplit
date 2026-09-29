import type { Session } from "@/lib/auth/session";

// Stand-in for lib/auth/session in the emulator integration tests: the real
// getSession verifies a cookie from next/headers, which doesn't exist in a
// plain node run. Tests pick who's calling with signInAs().

let current: Session | null = null;

export const SESSION_COOKIE_NAME = "session";

export function signInAs(session: Partial<Session> & { uid: string }): Session {
  current = {
    email: `${session.uid}@example.com`,
    emailVerified: true,
    displayName: session.uid,
    photoURL: null,
    paypalEmail: null,
    iban: null,
    paypalMeHandle: null,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    ...session,
  };
  return current;
}

export function signOut(): void {
  current = null;
}

export async function getSession(): Promise<Session | null> {
  return current;
}
