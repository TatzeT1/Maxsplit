"use client";

import { useEffect, useSyncExternalStore } from "react";

// When this device last had a screen's data live from the server, per
// signed-in user and screen ("<uid>:groups", "<uid>:group:<id>", …).
//
// Offline, Firestore answers from its cache (lib/firebase/client.ts), and a
// cached answer looks the same whether it's a minute or a week old — or
// whether a group really has no expenses or this phone simply never loaded
// them. The mark tells those apart: a screen with one shows its copy with
// "Stand 29.09., 14:32"; a screen without one says it needs a connection instead of
// presenting an empty cache as the truth (AGENTS.md: a failure must never
// look like a normal state). In localStorage, because it has to outlive a
// restart like the cache it describes; wiped with that cache on sign-out.

const PREFIX = "split:synced:";
/** How often a live screen refreshes its mark — the most an offline "Stand" can lag behind. */
const REFRESH_MS = 30_000;

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function readSyncMark(key: string): number | null {
  try {
    const value = Number(localStorage.getItem(PREFIX + key));
    return value > 0 ? value : null;
  } catch {
    // Storage blocked (private mode, a policy): behaves like "never synced".
    return null;
  }
}

function writeSyncMark(key: string, at: number) {
  try {
    localStorage.setItem(PREFIX + key, String(at));
  } catch {
    // See readSyncMark.
  }
  emit();
}

export function clearSyncMarks() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // See readSyncMark.
  }
  emit();
}

interface Screen {
  key: string;
  live: boolean;
}

/** The screen on display, so the offline banner can say how old its data is. */
let currentScreen: Screen | null = null;

/**
 * For a screen built on Firestore listeners. `live` means every one of them
 * last delivered server data (`metadata.fromCache === false`); `key` is null
 * until the user is known. Keeps the screen's mark fresh while live, tells
 * the offline banner which screen is showing, and returns when its data was
 * last live on this device — null if never.
 */
export function useScreenSync(key: string | null, live: boolean): number | null {
  useEffect(() => {
    if (!key) return;
    const entry: Screen = { key, live };
    currentScreen = entry;
    emit();
    return () => {
      if (currentScreen !== entry) return;
      currentScreen = null;
      emit();
    };
  }, [key, live]);

  useEffect(() => {
    if (!key || !live) return;
    const mark = () => writeSyncMark(key, Date.now());
    mark();
    const timer = window.setInterval(mark, REFRESH_MS);
    window.addEventListener("pagehide", mark);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", mark);
      // Live right up to now: going offline or leaving the screen ends it.
      mark();
    };
  }, [key, live]);

  return useSyncExternalStore(
    subscribe,
    () => (key ? readSyncMark(key) : null),
    () => null,
  );
}

export interface ScreenSync {
  live: boolean;
  syncedAt: number | null;
}

let snapshot: { screen: Screen | null; syncedAt: number | null; value: ScreenSync | null } = {
  screen: null,
  syncedAt: null,
  value: null,
};

function getScreenSnapshot(): ScreenSync | null {
  const syncedAt = currentScreen ? readSyncMark(currentScreen.key) : null;
  if (snapshot.screen !== currentScreen || snapshot.syncedAt !== syncedAt) {
    snapshot = {
      screen: currentScreen,
      syncedAt,
      value: currentScreen ? { live: currentScreen.live, syncedAt } : null,
    };
  }
  return snapshot.value;
}

/** The screen on display right now: whether its data is live, and since when its copy dates. */
export function useCurrentScreenSync(): ScreenSync | null {
  return useSyncExternalStore(subscribe, getScreenSnapshot, () => null);
}
