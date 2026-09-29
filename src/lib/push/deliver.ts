import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/translate";
import { renderPayload } from "./render";
import { PRESENCE_WINDOW_MS, presenceRef, subscriptionsOf, type StoredSubscription } from "./store";
import { readNotificationPrefs, type PendingPush } from "./types";
import { getVapidConfig } from "./vapid";

export interface SendOptions {
  ttlSeconds: number;
  urgency: "normal" | "high";
  /** Lets the push service replace an undelivered push with a newer one on the same topic. */
  topic?: string;
}

/** Hands one encrypted push to the device's push service; throws with a `statusCode` on failure. */
export type PushSender = (
  subscription: StoredSubscription,
  payload: string,
  options: SendOptions,
) => Promise<void>;

export interface DeliveryReport {
  sent: number;
  failed: number;
  /** Subscriptions the push service no longer knows (unsubscribed, expired): deleted. */
  removed: number;
  /** Not sent: no device, switched off in the profile, or watching the game already. */
  skipped: number;
}

/** A Web Push topic is at most 32 URL-safe characters; our tags are longer. */
function topicFor(tag: string): string {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

function webPushSender(): PushSender | null {
  const vapid = getVapidConfig();
  if (!vapid) return null;
  return async (subscription, payload, options) => {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      payload,
      {
        vapidDetails: vapid,
        TTL: options.ttlSeconds,
        urgency: options.urgency,
        topic: options.topic,
        timeout: 10_000,
      },
    );
  };
}

async function isWatching(uid: string, where: NonNullable<PendingPush["unlessWatching"]>) {
  const snap = await presenceRef(where.groupId, where.tournamentId, uid).get();
  const at = snap.get("at");
  return typeof at === "string" && Date.now() - Date.parse(at) < PRESENCE_WINDOW_MS;
}

/**
 * Sends each push to every device its recipient turned notifications on for,
 * in that device's language — honoring the per-event switches, skipping "Du
 * bist dran" for a player who is watching the game, and deleting
 * subscriptions a push service reports gone (404/410). Never throws for one
 * device's failure. Without VAPID keys, push is off and nothing is sent.
 */
export async function deliverPushes(
  pushes: PendingPush[],
  send: PushSender | null = webPushSender(),
): Promise<DeliveryReport> {
  const report: DeliveryReport = { sent: 0, failed: 0, removed: 0, skipped: 0 };
  if (!send) {
    report.skipped = pushes.length;
    return report;
  }

  const byUid = new Map<string, PendingPush[]>();
  for (const push of pushes) byUid.set(push.uid, [...(byUid.get(push.uid) ?? []), push]);

  await Promise.all(
    [...byUid].map(async ([uid, list]) => {
      const [userSnap, subscriptionsSnap] = await Promise.all([
        adminDb.doc(`users/${uid}`).get(),
        subscriptionsOf(uid).get(),
      ]);
      if (subscriptionsSnap.empty) {
        report.skipped += list.length;
        return;
      }
      const prefs = readNotificationPrefs(userSnap.get("notificationPrefs"));

      for (const push of list) {
        if (push.event !== "test" && !prefs[push.event]) {
          report.skipped++;
          continue;
        }
        if (push.unlessWatching && (await isWatching(uid, push.unlessWatching))) {
          report.skipped++;
          continue;
        }
        await Promise.all(
          subscriptionsSnap.docs.map(async (doc) => {
            const subscription = doc.data() as StoredSubscription;
            const locale = isLocale(subscription.locale) ? subscription.locale : DEFAULT_LOCALE;
            try {
              await send(subscription, JSON.stringify(renderPayload(push, locale)), {
                ttlSeconds: push.ttlSeconds,
                urgency: push.event === "turn" || push.event === "challenge" ? "high" : "normal",
                topic: push.event === "turn" ? topicFor(push.tag) : undefined,
              });
              report.sent++;
            } catch (error) {
              const status = (error as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                await doc.ref.delete();
                report.removed++;
              } else {
                report.failed++;
                console.error(
                  `Push to a device of ${uid} failed (${status ?? "no status"})`,
                  error,
                );
              }
            }
          }),
        );
      }
    }),
  );
  return report;
}
