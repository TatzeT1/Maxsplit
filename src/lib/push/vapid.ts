// Web Push identifies this server to the browsers' push services (Apple,
// Google, Mozilla) with a VAPID key pair (RFC 8292). Plain server env vars,
// read at runtime — not NEXT_PUBLIC_*: the public key reaches the browser as
// a prop from a Server Component, so rotating it never needs the cache-less
// rebuild AGENTS.md warns about. No keys means push is simply off.

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Shape checks, kept apart from the env lookup so they can be unit tested. A
 * P-256 public key is 65 bytes uncompressed — 87 base64url characters, the
 * first byte 0x04 making it start with "B" — the private key 32 bytes, 43
 * characters. Swapping the two, the realistic copy-paste slip, fails here.
 * The private key's value is never echoed back.
 */
export function validateVapidKeys(publicKey: string, privateKey: string): void {
  if (publicKey.length !== 87 || !BASE64URL.test(publicKey) || !publicKey.startsWith("B")) {
    throw new Error(
      `Invalid environment variable VAPID_PUBLIC_KEY: got ${publicKey.length} characters — expected the 87-character base64url public key "web-push generate-vapid-keys" prints (it starts with "B").`,
    );
  }
  if (privateKey.length !== 43 || !BASE64URL.test(privateKey)) {
    throw new Error(
      `Invalid environment variable VAPID_PRIVATE_KEY: got ${privateKey.length} characters — expected the 43-character base64url private key "web-push generate-vapid-keys" prints.`,
    );
  }
}

/** For next.config.ts: both keys or neither — a half-set or malformed pair fails the build, not the first push. */
export function assertVapidEnvFormat(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey && !privateKey) return;
  if (!publicKey || !privateKey) {
    throw new Error(
      "Set both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY, or neither (push notifications off).",
    );
  }
  validateVapidKeys(publicKey, privateKey);
}

/** The key pair and contact for web-push, or null while push isn't set up. */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: vapidSubject() };
}

/**
 * Whom a push service contacts about this sender: the app's URL rather than
 * an email address, which would travel along with every single push.
 * Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment.
 */
function vapidSubject(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "https://localhost";
}
