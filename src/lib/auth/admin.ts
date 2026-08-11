import "server-only";

const ADMIN_EMAILS = ["max123.tietz@gmail.com"];

export function isAdminEmail(email: string | null): boolean {
  return email !== null && ADMIN_EMAILS.includes(email.toLowerCase());
}
