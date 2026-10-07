"use server";

import { FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import { MESSAGE_ID } from "@/lib/chat/constants";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/translate";
import { deliverPushes } from "@/lib/push/deliver";
import { isAllowedPushEndpoint } from "@/lib/push/endpoints";
import { subscriptionRef, type StoredSubscription } from "@/lib/push/store";
import { PUSH_EVENTS, type NotificationPrefs } from "@/lib/push/types";
import { getVapidConfig } from "@/lib/push/vapid";
import type { ActionResult } from "./groups";

// Push notifications (brain: Features/Push Notifications). The browser's
// PushSubscription is stored server-side only (lib/push/store.ts); the
// per-event switches live on users/{uid}.notificationPrefs.

/** A subscription key as the browser hands it over, decoded — or null if it isn't `bytes` long. */
function decodeKey(value: unknown, bytes: number): string | null {
  if (typeof value !== "string" || value.length > 200) return null;
  // "base64" decoding accepts the URL-safe alphabet and missing padding too.
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes) return null;
  // An uncompressed P-256 point starts with 0x04.
  if (bytes === 65 && decoded[0] !== 0x04) return null;
  return decoded.toString("base64url");
}

export async function savePushSubscription(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!getVapidConfig()) return { ok: false, error: "push-not-configured" };

  // p256dh is the device's P-256 public key (65 bytes uncompressed), auth a
  // 16-byte secret — both needed to encrypt what it receives.
  const p256dh = decodeKey(input.keys?.p256dh, 65);
  const auth = decodeKey(input.keys?.auth, 16);
  if (
    typeof input.endpoint !== "string" ||
    input.endpoint.length > 2048 ||
    !isAllowedPushEndpoint(input.endpoint) ||
    !p256dh ||
    !auth
  ) {
    return { ok: false, error: "invalid-subscription" };
  }

  const ref = subscriptionRef(input.endpoint);
  const now = new Date().toISOString();
  const existing = await ref.get();
  const subscription: StoredSubscription = {
    uid: session.uid,
    endpoint: input.endpoint,
    keys: { p256dh, auth },
    locale: isLocale(input.locale) ? input.locale : DEFAULT_LOCALE,
    // A takeover by another account (a shared phone) starts fresh.
    createdAt:
      existing.exists && existing.get("uid") === session.uid ? existing.get("createdAt") : now,
    updatedAt: now,
  };
  await ref.set(subscription);
  return { ok: true, data: null };
}

/** Turns this device off — only ever the caller's own subscription. */
export async function removePushSubscription(input: {
  endpoint: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (typeof input.endpoint !== "string" || input.endpoint.length > 2048) {
    return { ok: false, error: "invalid-subscription" };
  }
  const ref = subscriptionRef(input.endpoint);
  const snap = await ref.get();
  if (snap.exists && snap.get("uid") === session.uid) await ref.delete();
  return { ok: true, data: null };
}

export async function updateNotificationPrefs(
  input: NotificationPrefs,
): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (typeof input !== "object" || input === null) return { ok: false, error: "invalid-prefs" };
  if (!PUSH_EVENTS.every((event) => typeof input[event] === "boolean")) {
    return { ok: false, error: "invalid-prefs" };
  }
  const prefs = Object.fromEntries(PUSH_EVENTS.map((event) => [event, input[event]]));
  await adminDb.doc(`users/${session.uid}`).set({ notificationPrefs: prefs }, { merge: true });
  return { ok: true, data: null };
}

/**
 * Silences (or un-silences) the push for every message in one group's chat,
 * on all the caller's devices. A message that names them with @ still comes
 * through. Silencing needs membership; un-silencing doesn't, so a group left
 * long ago can still be cleaned out of the list.
 */
export async function setChatMuted(input: {
  groupId: string;
  muted: boolean;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (typeof input.groupId !== "string" || !MESSAGE_ID.test(input.groupId)) {
    return { ok: false, error: "invalid-group" };
  }
  if (typeof input.muted !== "boolean") return { ok: false, error: "invalid-group" };

  if (input.muted) {
    const groupSnap = await adminDb.collection("groups").doc(input.groupId).get();
    if (!groupSnap.exists) return { ok: false, error: "not-found" };
    if (!(groupSnap.get("memberUids") as string[]).includes(session.uid)) {
      return { ok: false, error: "forbidden" };
    }
  }
  await adminDb.doc(`users/${session.uid}`).set(
    {
      mutedChatGroupIds: input.muted
        ? FieldValue.arrayUnion(input.groupId)
        : FieldValue.arrayRemove(input.groupId),
    },
    { merge: true },
  );
  return { ok: true, data: null };
}

/**
 * The profile's "Test-Nachricht senden": straight to every device of the
 * caller, right now (not after the response — the answer says whether it
 * went out) and regardless of the per-event switches.
 */
export async function sendTestPush(): Promise<ActionResult<{ sent: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!getVapidConfig()) return { ok: false, error: "push-not-configured" };

  const report = await deliverPushes([
    {
      uid: session.uid,
      event: "test",
      title: { key: "push.testTitle" },
      body: [{ key: "push.testBody" }],
      url: "/profile",
      tag: "test",
      ttlSeconds: 60,
    },
  ]);
  if (report.sent === 0) return { ok: false, error: "not-delivered" };
  return { ok: true, data: { sent: report.sent } };
}
