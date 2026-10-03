import type { Tournament } from "@/lib/types";

/**
 * Whether a finished game can be played again as is ("Revanche"): online,
 * and either just for fun or for a stake with no bill behind it. A game that
 * booked a real bill can't — a rematch would book that bill a second time.
 */
export function canRematch(
  tournament: Pick<Tournament, "status" | "playMode" | "autoBook">,
): boolean {
  return (
    tournament.status === "finished" &&
    tournament.playMode === "online" &&
    (!tournament.autoBook || tournament.autoBook.payerIsWinner === true)
  );
}

/**
 * Who opens the rematch: in a duel the loser moves first this time; a bigger
 * bracket is drawn afresh by the caller (`null`).
 */
export function rematchSeedOrder(
  poolUids: string[],
  loserUids: readonly string[],
): string[] | null {
  if (poolUids.length !== 2) return null;
  return [...poolUids].sort(
    (a, b) => Number(loserUids.includes(b)) - Number(loserUids.includes(a)),
  );
}
