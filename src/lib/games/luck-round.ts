import { maxPayerCount } from "@/lib/games/payers";
import type { LuckRound } from "@/lib/types";

/**
 * Online scratch cards ("Rubbellos online"): every player scratches their
 * own card on their own phone. Pure rules; `lib/actions/luck-rounds.ts`
 * applies them inside transactions.
 *
 * No face is dealt at the start. A card is drawn the moment it is scratched:
 * "zahlt" with probability (payer cards left) / (cards left). Drawing card by
 * card like this gives every card the same chance of paying whoever scratches
 * first — the exact distribution of shuffling the faces up front — but there
 * is no dealt secret anywhere that a modified client, or anyone with database
 * access, could read in the meantime.
 */

export type RandomInt = (min: number, max: number) => number;

type RoundCards = Pick<LuckRound, "order" | "revealed" | "targetLoserCount">;

/**
 * Whether a round of `poolSize` cards may hold `targetLoserCount` "zahlt"
 * faces: at least one, and never all of them — someone always stays dry, the
 * same cap as on one phone (`maxPayerCount`).
 */
export function isValidLuckRoundCount(targetLoserCount: number, poolSize: number): boolean {
  return (
    Number.isInteger(targetLoserCount) &&
    targetLoserCount >= 1 &&
    poolSize >= 2 &&
    targetLoserCount <= maxPayerCount(poolSize)
  );
}

/** Cards still under foil, in card order. */
export function unrevealedUids(round: Pick<LuckRound, "order" | "revealed">): string[] {
  return round.order.filter((uid) => !(uid in round.revealed));
}

/** How many "zahlt" faces the cards still under foil hold between them. */
export function payerCardsLeft(round: RoundCards): number {
  const found = Object.values(round.revealed).filter(Boolean).length;
  return round.targetLoserCount - found;
}

/** Draws the face of the next card to be scratched: `true` = "zahlt". */
export function drawScratchCard(round: RoundCards, randomInt: RandomInt): boolean {
  const cardsLeft = unrevealedUids(round).length;
  if (cardsLeft === 0) throw new Error("Every card is already scratched");
  return randomInt(0, cardsLeft - 1) < payerCardsLeft(round);
}

/** Who pays, in card order, once every card is scratched; `null` before. */
export function scratchLosers(round: Pick<LuckRound, "order" | "revealed">): string[] | null {
  if (unrevealedUids(round).length > 0) return null;
  return round.order.filter((uid) => round.revealed[uid] === true);
}

/**
 * Whether `actorUid` may scratch `cardUid`'s card: your own, and — since a
 * placeholder has no phone — a placeholder's when you started the round.
 */
export function canScratchFor(
  round: Pick<LuckRound, "entrants" | "createdBy">,
  actorUid: string,
  cardUid: string,
): boolean {
  const entrant = round.entrants[cardUid];
  if (!entrant) return false;
  return cardUid === actorUid || (entrant.isPlaceholder && actorUid === round.createdBy);
}
