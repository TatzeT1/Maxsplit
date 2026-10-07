/**
 * A fresh message id for `sendMessage`'s retry-safe `clientId`. `randomUUID`
 * only exists in secure contexts; the fallback builds the same 32 hex digits
 * from `getRandomValues`, which is available everywhere.
 */
export function newClientMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
