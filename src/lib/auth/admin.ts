import "server-only";
import { notFound } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";

const ADMIN_EMAILS = ["max123.tietz@gmail.com"];

export function isAdminEmail(email: string | null): boolean {
  return email !== null && ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Reads the session and 404s unless it belongs to an admin. Shared by every /admin page. */
export async function requireAdminSession(): Promise<Session> {
  const session = await getSession();
  if (!session || !isAdminEmail(session.email)) notFound();
  return session;
}
