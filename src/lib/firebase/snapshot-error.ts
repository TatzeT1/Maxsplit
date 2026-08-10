"use client";

import type { FirestoreError } from "firebase/firestore";

/**
 * Reports a failed Firestore `onSnapshot` listener and returns its error code
 * for display.
 *
 * These callbacks used to swallow `permission-denied` outright, so that the
 * brief window between sign-out and listener teardown wouldn't spam the
 * console. The cost was severe: `permission-denied` is also what Firestore
 * returns for a genuine rules rejection *and* for a misaddressed project, and
 * swallowing it made those indistinguishable from "still loading" — no console
 * output, no UI change, just a skeleton forever. A wrong
 * NEXT_PUBLIC_FIREBASE_PROJECT_ID hid behind exactly that silence in
 * production.
 *
 * Every error is now surfaced. The sign-out noise it was hiding is handled
 * structurally instead: callers only render the error once there is a current
 * user, so the listener teardown that follows a sign-out cannot strand a stale
 * message on screen.
 */
export function reportSnapshotError(context: string, error: FirestoreError): string {
  console.error(`[firestore] ${context} listener failed: ${error.code}`, error);
  return error.code;
}
