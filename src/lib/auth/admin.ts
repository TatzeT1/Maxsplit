import "server-only";
import { notFound } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";

const ADMIN_EMAILS = ["max123.tietz@gmail.com"];

export function isAdminEmail(email: string | null): boolean {
  return email !== null && ADMIN_EMAILS.includes(email.toLowerCase());
}

/**
 * Admin authorization keys on the email string, so it can only trust an email
 * the identity provider actually verified. Without the emailVerified gate an
 * attacker could register an admin address via bare email/password sign-up
 * (email_verified=false) and inherit full admin — the ADMIN_EMAILS list is a
 * gmail address reachable through Google sign-in, whose email_verified is
 * always true, so this never rejects the legitimate admin.
 */
export function isAdminSession(session: Session | null): session is Session {
  return session !== null && session.emailVerified && isAdminEmail(session.email);
}

/** Reads the session and 404s unless it belongs to an admin. Shared by every /admin page. */
export async function requireAdminSession(): Promise<Session> {
  const session = await getSession();
  if (!isAdminSession(session)) notFound();
  return session;
}
