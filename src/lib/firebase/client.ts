"use client";

import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  type Firestore,
  getFirestore,
  initializeFirestore,
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
 * Firestore with its cache in IndexedDB instead of memory: every listener
 * first answers from the copy this device last saw — at once when the app
 * opens, and at all while offline — then with the live data. The offline
 * mode (view-only, see [[Offline Mode]]) rests on this. Multi-tab, so a
 * second open tab shares the cache instead of falling back to memory.
 * Server rendering has no IndexedDB and never attaches a listener, so it
 * keeps the plain in-memory instance.
 */
function createDb(app: FirebaseApp): Firestore {
  if (typeof window === "undefined") return getFirestore(app);
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Some mobile networks and proxies buffer the streaming (WebChannel)
      // connection, so snapshots arrive seconds late or not at all. This
      // probes the stream once and falls back to long polling if it stalls.
      experimentalAutoDetectLongPolling: true,
    });
  } catch {
    // Already initialized: this module re-evaluates across Fast Refresh in dev.
    return getFirestore(app);
  }
}

export const app = getClientApp();
export const auth = getAuth(app);
export const db = createDb(app);
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
