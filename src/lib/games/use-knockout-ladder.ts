"use client";

import { useCallback, useState } from "react";
import { secureShuffle } from "@/lib/games/random";
import {
  IDLE_LADDER,
  isLadderOver,
  recordDraw,
  recordWin,
  startLadder,
  type DuelPairing,
  type DuelResult,
} from "@/lib/games/knockout-ladder";

/**
 * React wrapper around `knockout-ladder.ts` for the four duel mini-games
 * (Tic-Tac-Toe, Connect Four, Memory-Duell, Reaktionsduell) — the duel
 * equivalent of `useSequentialDraw`. Each game's board only ever plays one
 * match at a time and reports its outcome back via `reportWin`/`reportDraw`;
 * this hook handles who plays whom next and when enough losers are found.
 */
export function useKnockoutLadder() {
  const [state, setState] = useState(IDLE_LADDER);

  const start = useCallback((poolUids: string[], targetLoserCount: number) => {
    // The shuffle happens once, here, outside the state updater — a fresh
    // crypto-random order every call, never recomputed on a re-render.
    const order = secureShuffle(poolUids);
    setState(startLadder(order, targetLoserCount));
  }, []);

  const reportWin = useCallback((pairingKey: string, winnerUid: string) => {
    setState((current) => recordWin(current, pairingKey, winnerUid));
  }, []);

  const reportDraw = useCallback((pairingKey: string) => {
    setState((current) => recordDraw(current, pairingKey));
  }, []);

  const reset = useCallback(() => setState(IDLE_LADDER), []);

  return {
    /** The match to play right now, or `null` once the ladder is over. */
    current: state.current as DuelPairing | null,
    queue: state.queue,
    /** Elimination order so far — this is the `loserUids` the caller resolves the expense with. */
    losers: state.losers,
    results: state.results as DuelResult[],
    targetLoserCount: state.targetLoserCount,
    /** How many payers are already decided — maps straight onto `GameProgressPips.revealedCount`. */
    decidedCount: state.losers.length,
    started: state.targetLoserCount > 0,
    gameOver: isLadderOver(state),
    start,
    reportWin,
    reportDraw,
    reset,
  };
}
