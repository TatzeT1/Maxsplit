"use client";

import { useEffect, useRef, useState } from "react";

/** How often the fuse looks at the clock — often enough for a smooth bar. */
const TICK_MS = 100;
/** One tick never counts for more than this, so a throttled page can't burn a fuse in a single jump. */
const MAX_STEP_MS = TICK_MS * 5;

export interface TurnFuse {
  /** Milliseconds left on this turn. */
  remainingMs: number;
  /** 1 when the fuse is lit, 0 once it has burnt down. */
  fraction: number;
  burnt: boolean;
}

/**
 * The clock on one turn (the matchstick duel's fuse). It only runs while
 * `running` is true, starts over whenever `resetKey` changes (a new turn),
 * counts only time the page is actually visible — a phone put down for a
 * minute must not come back to a spent turn — and calls `onBurnt` exactly
 * once per key when the time is up.
 *
 * It owns its own state on purpose: a component that shows a fuse re-renders
 * ten times a second, so that component should be a small one.
 */
export function useTurnFuse({
  seconds,
  running,
  resetKey,
  onBurnt,
}: {
  seconds: number;
  running: boolean;
  resetKey: string | number;
  onBurnt?: () => void;
}): TurnFuse {
  const totalMs = seconds * 1000;
  const [spent, setSpent] = useState<{ key: string | number; ms: number }>({
    key: resetKey,
    ms: 0,
  });
  // A new key means a new turn: whatever was spent on the old one doesn't count.
  const elapsed = spent.key === resetKey ? spent.ms : 0;

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const step = Math.min(now - last, MAX_STEP_MS);
      last = now;
      if (document.visibilityState === "hidden") return;
      setSpent((previous) => ({
        key: resetKey,
        ms: Math.min(totalMs, (previous.key === resetKey ? previous.ms : 0) + step),
      }));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, resetKey, totalMs]);

  const onBurntRef = useRef(onBurnt);
  useEffect(() => {
    onBurntRef.current = onBurnt;
  });
  const firedFor = useRef<string | number | null>(null);
  const burnt = elapsed >= totalMs;
  useEffect(() => {
    if (!running || !burnt || firedFor.current === resetKey) return;
    firedFor.current = resetKey;
    onBurntRef.current?.();
  }, [running, burnt, resetKey]);

  return {
    remainingMs: Math.max(0, totalMs - elapsed),
    fraction: Math.max(0, 1 - elapsed / totalMs),
    burnt,
  };
}
