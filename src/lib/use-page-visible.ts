"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

/**
 * Whether the page is in the foreground (`document.visibilityState`), kept
 * current — false for a background tab and for an installed app that was sent
 * away. The server has no tab, so it (and hydration) assumes visible.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => document.visibilityState === "visible",
    () => true,
  );
}
