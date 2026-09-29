"use client";

import { clearIndexedDbPersistence, terminate } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { clearSyncMarks } from "@/lib/offline/sync-marks";

/** The service worker's (public/sw.js) saved pages — its build-file cache holds nothing personal. */
const PAGES_CACHE_PREFIX = "split-pages-";
/** Kept: the worker's answer to any page that has no saved copy. */
const OFFLINE_PAGE = "/offline.html";

/**
 * Removes everything personal this device kept for offline use — Firestore's
 * copy of the ledger, the pages the service worker saved, the sync marks — so the
 * next person to sign in on a shared phone can't read the last one's groups,
 * online or off. Terminates Firestore: the page has to be reloaded after.
 */
export async function clearLocalData(): Promise<void> {
  clearSyncMarks();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (error) {
    // Fails while another tab still holds the cache. That tab signs out too
    // (Firebase Auth shares its state across tabs) and clears it then.
    console.error("Could not clear the offline copy", error);
  }
  // The worker empties its saved pages too — and drops a save still in flight,
  // which would otherwise put this person's page back after the wipe below.
  const worker = (await navigator.serviceWorker?.getRegistration("/"))?.active;
  worker?.postMessage({ type: "forget-pages" });

  if (!("caches" in window)) return;
  for (const name of await caches.keys()) {
    if (!name.startsWith(PAGES_CACHE_PREFIX)) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname !== OFFLINE_PAGE) await cache.delete(request);
    }
  }
}
