"use client";

import { createContext, useContext } from "react";

/**
 * How many game rounds the expense form around a game has started. Every
 * game counts a round when it starts — "Neu mischen" included — and the
 * number travels with the result onto the expense (`Expense.game.attempt`).
 * A game still ends with "Neu mischen" next to "Übernehmen"; what changes is
 * that a reshuffle until someone else pays shows, on the stage while playing
 * and on the expense afterwards.
 *
 * Outside an expense form (no provider) nothing is counted.
 */
export interface GameRound {
  /** Rounds started so far; 0 before the first. */
  round: number;
  startRound: () => void;
}

const GameRoundContext = createContext<GameRound>({ round: 0, startRound: () => {} });

export const GameRoundProvider = GameRoundContext.Provider;

export function useGameRound(): GameRound {
  return useContext(GameRoundContext);
}
