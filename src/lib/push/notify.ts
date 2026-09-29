import "server-only";
import { after } from "next/server";
import { deliverPushes } from "./deliver";
import type { PendingPush } from "./types";

/**
 * Sends pushes once the response is out (next/server's `after`): a push can
 * never slow down or fail the action that caused it — the expense is saved
 * whether or not a phone hears about it. Failures are logged, never thrown.
 */
export function notifyAfterResponse(pushes: PendingPush[]): void {
  if (pushes.length === 0) return;
  after(async () => {
    try {
      await deliverPushes(pushes);
    } catch (error) {
      console.error("Push delivery failed", error);
    }
  });
}
