"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { flushPendingChecks, usePendingChecks } from "@/lib/shopping/pending-checks";

/**
 * Sends the shopping-list ticks this device made offline (ADR-009) as soon
 * as it can: on app start, when the connection comes back, and whenever a
 * new one is queued — on every screen, not just the list, so a tick made in
 * the shop goes out even if the next thing opened is the group page.
 */
export function ShoppingCheckSync() {
  const user = useCurrentUser();
  const uid = user?.uid ?? null;
  const checks = usePendingChecks(uid);
  const hasUnsent = Object.values(checks).some((check) => check.sentAt === undefined);

  useEffect(() => {
    if (!uid) return;
    const flush = () => void flushPendingChecks(uid);
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [uid]);

  useEffect(() => {
    if (uid && hasUnsent) void flushPendingChecks(uid);
  }, [uid, hasUnsent]);

  return null;
}
