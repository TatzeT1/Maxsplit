"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

/**
 * The one place this module touches the clock. Components must stay pure
 * (`react-hooks/purity` rejects `Date.now()` in a render), so every read goes
 * through here and happens in a lazy initialiser or a subscription callback,
 * never in a component body.
 */
function readClock(): number {
  return Date.now();
}

/** The last reading, held so `useSyncExternalStore` sees one stable value per render. */
interface Reading {
  now: number;
}

function createReading(): Reading {
  return { now: readClock() };
}

function getNow(reading: Reading): number {
  return reading.now;
}

/**
 * Keeps `reading` current until the returned function is called: a fresh
 * reading right away, then one every `intervalMs`.
 *
 * It stands still while the tab is hidden — a backgrounded page has nobody to
 * show a countdown to, and waking it every second only burns battery — and
 * takes a fresh reading the moment the tab is visible again, because the
 * deadline kept running while nobody looked.
 */
function tick(reading: Reading, intervalMs: number, notify: () => void): () => void {
  let timer: number | undefined;

  const refresh = () => {
    reading.now = readClock();
    notify();
  };
  const stop = () => {
    if (timer === undefined) return;
    window.clearInterval(timer);
    timer = undefined;
  };
  const start = () => {
    refresh();
    timer = window.setInterval(refresh, intervalMs);
  };
  const onVisibilityChange = () => {
    stop();
    if (document.visibilityState !== "hidden") start();
  };

  if (document.visibilityState !== "hidden") start();
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    stop();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

function idle(): () => void {
  return () => {};
}

/**
 * A ticking clock for countdowns: the current time in epoch milliseconds,
 * re-read every `intervalMs` while `active` is true, so a component that shows
 * "Noch 2:41" re-renders once a second and nothing else has to.
 *
 * - **Active** (`active && intervalMs > 0`): one timer. It pauses while the
 *   tab is hidden and takes a fresh reading as soon as it is visible again.
 * - **Inactive**: no timer at all. The value stands still at the last reading
 *   (the one a countdown stopped on), and turning `active` back on takes a
 *   fresh reading immediately instead of waiting out a full interval. So
 *   `active` may safely depend on the clock itself — "running and `closesAt`
 *   is still ahead of `now`" stops the ticking exactly when the time is up.
 * - **Display only.** The first value is read when the component mounts, so a
 *   screen that renders a countdown must not be server-rendered with one:
 *   render it from data that only the client has (a Firestore snapshot), or
 *   the server's clock and the device's will disagree about the text. Whoever
 *   decides a deadline decides it on the server; this is just what the screen
 *   shows meanwhile.
 *
 * Each caller has its own clock; calling it from several components is cheap
 * but they will not tick in the same frame.
 */
export function useNow(intervalMs: number, active: boolean): number {
  const [reading] = useState(createReading);
  const ticking = active && Number.isFinite(intervalMs) && intervalMs > 0;
  // A new function identity is how `useSyncExternalStore` learns to unsubscribe
  // and subscribe again, which is exactly what a changed interval or a flipped
  // `active` needs.
  const subscribe = useCallback(
    (notify: () => void) => (ticking ? tick(reading, intervalMs, notify) : idle()),
    [reading, ticking, intervalMs],
  );
  return useSyncExternalStore(
    subscribe,
    () => getNow(reading),
    () => getNow(reading),
  );
}
