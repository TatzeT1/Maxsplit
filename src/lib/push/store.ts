import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/firebase/admin";

// Push subscriptions live in a top-level collection keyed by a hash of the
// endpoint — not under users/{uid} — so one browser endpoint can only ever
// belong to one account: when a second person signs in on the same phone and
// turns notifications on, the document simply changes hands, and the first
// person's pushes stop landing on a phone that's no longer theirs.
// Server-only, like every write (ADR-001); the rules deny clients entirely.

export const PUSH_SUBSCRIPTIONS = "pushSubscriptions";

export interface StoredSubscription {
  uid: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The device's app language when it subscribed — pushes are written in it. */
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export function subscriptionRef(endpoint: string): FirebaseFirestore.DocumentReference {
  const id = createHash("sha256").update(endpoint).digest("base64url");
  return adminDb.collection(PUSH_SUBSCRIPTIONS).doc(id);
}

export function subscriptionsOf(uid: string): FirebaseFirestore.Query {
  return adminDb.collection(PUSH_SUBSCRIPTIONS).where("uid", "==", uid);
}

/** Where a tournament keeps who's looking at it right now (see markTournamentPresence). */
export function presenceRef(
  groupId: string,
  tournamentId: string,
  uid: string,
): FirebaseFirestore.DocumentReference {
  return adminDb.doc(`groups/${groupId}/tournaments/${tournamentId}/presence/${uid}`);
}

/**
 * How long a presence heartbeat counts: the page sends one every 20 seconds
 * while visible, so this rides out one lost beat — and a player who left
 * stops counting as present within a minute.
 */
export const PRESENCE_WINDOW_MS = 50_000;
