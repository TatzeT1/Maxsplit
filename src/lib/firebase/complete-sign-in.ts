"use client";

/**
 * Exchanges a signed-in Firebase user's ID token for the server session
 * cookie (see POST /api/auth/session). Shared by every sign-in method —
 * Google/Microsoft/Apple popups and the email/password form — since they all
 * end the same way once a Firebase Auth credential exists.
 */
export async function createServerSession(idToken: string): Promise<boolean> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return response.ok;
}
