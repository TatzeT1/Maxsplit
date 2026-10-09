import type { SplitGameId } from "@/lib/types";

/**
 * Where an online round lives. Pure, so the server (push links), the chat
 * card, the group banner and the share page all spell the route the same way.
 *
 * Luck rounds (`luckRounds` collection) live under `/rounds/`; estimate
 * rounds (`estimateRounds`) under their own `/estimate/` — one route, one
 * collection, so a page never has to guess which collection a bare id belongs
 * to (two listeners, one of which would fail like "still loading").
 */

/** The app page of an online estimate round. */
export function estimateRoundPath(groupId: string, roundId: string): string {
  return `/groups/${groupId}/estimate/${roundId}`;
}

/** The public share entry of an online estimate round: signed-out visitors sign in, then land on the round. */
export function estimatePlayPath(groupId: string, roundId: string): string {
  return `/play/${groupId}/estimate/${roundId}`;
}

/** Where a game-result card or banner leads: luck rounds to `/rounds/`, the estimate game to `/estimate/`. */
export function gameRoundPath(groupId: string, gameId: SplitGameId, roundId: string): string {
  return gameId === "estimate"
    ? estimateRoundPath(groupId, roundId)
    : `/groups/${groupId}/rounds/${roundId}`;
}
