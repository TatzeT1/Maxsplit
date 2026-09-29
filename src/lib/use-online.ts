"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * `navigator.onLine`, kept current. The server has no network state of its
 * own, so it (and hydration) assumes online — the first client render then
 * matches what SSR rendered, and corrects itself right after if offline.
 *
 * Writes are Server Actions (ADR-001), so there is nothing to queue offline:
 * anything that saves is disabled while this is false, rather than left to
 * fail or hang.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
