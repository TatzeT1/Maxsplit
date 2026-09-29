"use client";

import type { ActionResult } from "@/lib/actions/groups";
import { removePushSubscription, savePushSubscription } from "@/lib/actions/notifications";
import { callAction } from "@/lib/call-action";
import { isIosDevice, isStandalone } from "@/lib/platform";

// This device's side of push notifications: permission, the browser's
// PushSubscription, and keeping the server's copy of it current.

export type PushSupport = "supported" | "ios-needs-install" | "unsupported";

/** Whether this browser can get pushes — on an iPhone or iPad only as a home-screen app (iOS 16.4+). */
export function pushSupport(): PushSupport {
  if (isIosDevice() && !isStandalone()) return "ios-needs-install";
  const capable =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return capable ? "supported" : "unsupported";
}

/** Which subscription the server last confirmed, for whom and in which language. */
const SYNCED_KEY = "split:push-synced";

function readSynced(): string | null {
  try {
    return localStorage.getItem(SYNCED_KEY);
  } catch {
    return null;
  }
}

function writeSynced(value: string | null) {
  try {
    if (value === null) localStorage.removeItem(SYNCED_KEY);
    else localStorage.setItem(SYNCED_KEY, value);
  } catch {
    // Storage blocked: the next app start just sends the subscription again.
  }
}

/** The worker that shows pushes (public/sw.js) — registered here if it isn't yet. */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  return (await existing?.pushManager.getSubscription()) ?? null;
}

function toServer(subscription: PushSubscription, locale: string) {
  const { keys } = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys?.p256dh ?? "", auth: keys?.auth ?? "" },
    locale,
  };
}

/** A VAPID public key arrives base64url-encoded; the Push API wants its bytes. */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array): boolean {
  if (!current || current.byteLength !== wanted.length) return false;
  const bytes = new Uint8Array(current);
  return bytes.every((byte, index) => byte === wanted[index]);
}

/**
 * Turns push on for this device: asks for permission — first thing, while
 * still inside the tap, or iOS refuses — subscribes with the server's VAPID
 * key and stores the subscription server-side. A subscription left over from
 * an old key is replaced, since the push service would reject our pushes.
 */
export async function subscribeThisDevice(
  uid: string,
  vapidPublicKey: string,
  locale: string,
): Promise<ActionResult<null>> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: permission === "denied" ? "denied" : "dismissed" };
  }

  const key = keyBytes(vapidPublicKey);
  const worker = await registration();
  let subscription = await worker.pushManager.getSubscription();
  if (subscription && !sameKey(subscription.options.applicationServerKey, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: key,
  });

  const saved = subscription;
  const result = await callAction(() => savePushSubscription(toServer(saved, locale)));
  if (!result.ok) {
    await saved.unsubscribe().catch(() => {});
    return result;
  }
  writeSynced(`${uid}|${locale}|${saved.endpoint}`);
  return result;
}

/**
 * Turns push off for this device, server side first (that call needs the
 * session). Also part of signing out: a shared phone must stop getting the
 * previous person's pushes.
 */
export async function unsubscribeThisDevice(): Promise<void> {
  writeSynced(null);
  const subscription = await currentSubscription();
  if (!subscription) return;
  await callAction(() => removePushSubscription({ endpoint: subscription.endpoint }));
  await subscription.unsubscribe();
}

/**
 * On app start: sends this device's subscription again when the server may
 * not have it as it is — another account signed in, the app's language
 * changed, or the browser rotated the endpoint. Nothing to do otherwise.
 */
export async function syncThisDevice(uid: string, locale: string): Promise<void> {
  if (pushSupport() !== "supported" || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  const marker = `${uid}|${locale}|${subscription.endpoint}`;
  if (readSynced() === marker) return;
  const result = await callAction(() => savePushSubscription(toServer(subscription, locale)));
  if (result.ok) writeSynced(marker);
}
