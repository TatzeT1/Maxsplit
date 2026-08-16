"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getFirebaseClientConfig, useFirebaseEmulators } from "./config";

function getClientApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(getFirebaseClientConfig());
}

/**
 * Persistent (IndexedDB-backed) local cache, so `onSnapshot` listeners keep
 * serving the last-known balances/expenses/chat while offline instead of
 * going silent. This only covers reads — writes still go through Server
 * Actions (ADR-001), which Firestore's client-side offline queue has no
 * visibility into; see OfflineActionQueue for the write-side counterpart.
 *
 * Falls back to the default in-memory cache when IndexedDB isn't available
 * (SSR, where this "use client" module still runs once for the initial HTML;
 * or the emulator suite, where a persisted cache would otherwise show stale
 * data across emulator restarts).
 */
function getClientFirestore(app: FirebaseApp) {
  const canPersist =
    typeof window !== "undefined" && "indexedDB" in window && !useFirebaseEmulators;
  return initializeFirestore(app, {
    localCache: canPersist
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : memoryLocalCache(),
  });
}

export const app = getClientApp();
export const auth = getAuth(app);
export const db = getClientFirestore(app);
export const storage = getStorage(app);

// Connecting an emulator twice throws, so guard with a module-level flag —
// this file can be re-evaluated across Fast Refresh in dev.
let emulatorsConnected = false;

if (useFirebaseEmulators && !emulatorsConnected) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  emulatorsConnected = true;
}
