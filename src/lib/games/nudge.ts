import { liveTurn } from "@/lib/games/online-match";
import type { LiveMatchState } from "@/lib/types";

/** How long the board has to have stood still before you can nudge the other player. */
export const NUDGE_AFTER_MS = 2 * 60_000;
/** How long one nudge has to sink in before the next — a nudge buzzes the phone. */
export const NUDGE_COOLDOWN_MS = 10 * 60_000;

/**
 * Whom an online match is waiting on, seen from player `me` (an index into
 * `LiveMatch.players`): the other player when it's their move, their hand
 * still missing (Schnick-Schnack-Schnuck) or their "ready"/reaction still
 * outstanding (Reaktionsduell). `null` while it's `me` the match waits for.
 */
export function waitingOn(state: LiveMatchState, me: 0 | 1): 0 | 1 | null {
  const other: 0 | 1 = me === 0 ? 1 : 0;
  switch (state.gameId) {
    case "rps":
      return state.locked[me] && !state.locked[other] ? other : null;
    case "reaction":
      if (state.ready[me] && !state.ready[other]) return other;
      return state.results[me] !== null && state.results[other] === null ? other : null;
    default: {
      const turn = liveTurn(state);
      return turn === other ? other : null;
    }
  }
}

/**
 * From when (epoch ms) a nudge is allowed: the board has stood still for
 * `NUDGE_AFTER_MS` since its last change, and the last nudge is
 * `NUDGE_COOLDOWN_MS` old. The server enforces the same rule.
 */
export function nudgeAllowedFrom(boardUpdatedAt: string, lastNudgeAt: string | null): number {
  const afterQuiet = Date.parse(boardUpdatedAt) + NUDGE_AFTER_MS;
  const afterCooldown = lastNudgeAt ? Date.parse(lastNudgeAt) + NUDGE_COOLDOWN_MS : 0;
  return Math.max(afterQuiet, afterCooldown);
}
