import type { PendingPush } from "@/lib/push/types";

// Stand-in for lib/push/notify in the emulator integration tests: the real
// one schedules delivery with next/server's `after`, which throws outside a
// request. Tests read what an action would have sent from `sentPushes`.

export const sentPushes: PendingPush[] = [];

export function notifyAfterResponse(pushes: PendingPush[]): void {
  sentPushes.push(...pushes);
}

export function clearSentPushes(): void {
  sentPushes.length = 0;
}
