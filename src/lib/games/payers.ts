import { payerShare, splitEqual } from "@/lib/money/split";

/**
 * Who pays, and how much it shows — the pieces every luck game shares.
 *
 * The amounts here are display only. The bill is booked by the expense form
 * (`handleSplitGameResolve`: `splitEqual` over the loser list a game hands
 * back), or for an online round by `buildGameExpense` with the same call.
 * Everything below goes through that same `splitEqual`, in the same loser
 * order, so the cents on a slip are the cents that end up on the expense —
 * including which payer carries a rounding cent.
 */

/** The bill a game is being played for, as the expense form has it right now. */
export interface GameStake {
  description: string;
  amountMinor: number;
  currency: string;
}

/**
 * The most payers a luck game allows for a pool of `poolSize`: everyone but
 * one. "Everyone pays" is not a game — its last spin or card has nothing left
 * to decide — so somebody always stays dry, and a pool of two always means
 * exactly one payer. The online scratch round validates against the same cap.
 */
export function maxPayerCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

/** A stake worth printing: a whole, positive amount. The form can open a game before an amount is typed (0). */
export function hasStakeAmount(stake: GameStake | null | undefined): stake is GameStake {
  return !!stake && Number.isInteger(stake.amountMinor) && stake.amountMinor > 0;
}

/**
 * Each payer's share of the stake, keyed by uid, for a payer list in the
 * order the game hands it to `onResolve`. `null` without an amount to show,
 * or before anyone pays.
 */
export function stakeShares(
  stake: GameStake | null | undefined,
  loserUids: readonly string[],
): Record<string, number> | null {
  if (!hasStakeAmount(stake) || loserUids.length === 0) return null;
  return splitEqual(stake.amountMinor, [...loserUids]);
}

/**
 * The share of the payer caught `index`-th of `payerCount`, for a game that
 * books its payers in the order it catches them and knows how many there will
 * be before they are all found (the balloon). Equal to `stakeShares` over the
 * final list; `null` without an amount to show.
 */
export function stakeShareAt(
  stake: GameStake | null | undefined,
  payerCount: number,
  index: number,
): number | null {
  if (!hasStakeAmount(stake)) return null;
  return payerShare(stake.amountMinor, payerCount, index);
}
