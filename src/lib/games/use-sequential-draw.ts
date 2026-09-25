"use client";

import { useCallback, useState } from "react";
import { secureShuffle } from "@/lib/games/random";

/**
 * Shared "who pays" resolution engine for the split mini-games: precomputes
 * a fixed, shuffled order of losers once at game start (the same pattern the
 * original lottery uses for its grid), then lets each game reveal them one
 * at a time through whatever interaction it wants — a wheel spin, a lever
 * pull, a scratched card. The outcome is fixed the instant the round starts;
 * revealing it is purely presentational, so a skipped or replayed animation
 * can never change who actually pays.
 */
export function useSequentialDraw() {
  const [losers, setLosers] = useState<string[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);

  const start = useCallback((poolUids: string[], targetCount: number) => {
    const count = Math.min(Math.max(targetCount, 1), poolUids.length);
    setLosers(secureShuffle(poolUids).slice(0, count));
    setRevealedCount(0);
  }, []);

  const revealNext = useCallback(() => {
    setRevealedCount((count) => Math.min(count + 1, losers.length));
  }, [losers.length]);

  const reset = useCallback(() => {
    setLosers([]);
    setRevealedCount(0);
  }, []);

  return {
    /** Full draw order, fixed at `start()` — reveal it progressively, don't recompute it. */
    losers,
    /** How many of `losers` have been revealed so far. */
    revealedCount,
    /** The uid this round's action (spin/pull/scratch) will reveal. */
    currentUid: losers[revealedCount] ?? null,
    /** Losers already revealed, in reveal order. */
    revealedLosers: losers.slice(0, revealedCount),
    /** True once every drawn loser has been revealed. */
    gameOver: losers.length > 0 && revealedCount >= losers.length,
    start,
    revealNext,
    reset,
  };
}
