import { AmountMismatchError } from "./errors";

function assertIntegerMinorUnits(amountMinor: number, label = "amountMinor"): void {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`${label} must be an integer minor-units amount, got ${amountMinor}`);
  }
}

/**
 * Distributes an integer amount across participants proportionally to their
 * weights, using the largest-remainder method: each participant first gets
 * `floor(amount * weight / totalWeight)`, then the leftover minor units
 * (lost to flooring) are handed out one-by-one — in weight order, ties
 * broken by input order — to the participants with the largest fractional
 * remainder. This guarantees `sum(result) === amountMinor` exactly, with no
 * minor unit silently dropped or invented.
 *
 * Used for `equal` splits (all weights 1) and `shares`/`percent` splits
 * (weights are the share counts or percentages).
 */
export function distributeByWeights(
  amountMinor: number,
  weights: Record<string, number>,
): Record<string, number> {
  assertIntegerMinorUnits(amountMinor);

  const uids = Object.keys(weights);
  const totalWeight = uids.reduce((sum, uid) => sum + weights[uid], 0);
  if (totalWeight <= 0) {
    throw new Error("Total weight must be greater than zero");
  }

  const floors: Record<string, number> = {};
  const remainders: { uid: string; remainder: number }[] = [];
  let distributed = 0;

  for (const uid of uids) {
    const raw = (amountMinor * weights[uid]) / totalWeight;
    const floor = Math.floor(raw);
    floors[uid] = floor;
    distributed += floor;
    remainders.push({ uid, remainder: raw - floor });
  }

  let leftover = amountMinor - distributed;

  // Stable sort by remainder descending; Array#sort is stable in modern JS,
  // so ties keep the original `uids` order for deterministic output.
  const ordered = [...remainders].sort((a, b) => b.remainder - a.remainder);

  for (const { uid } of ordered) {
    if (leftover <= 0) break;
    floors[uid] += 1;
    leftover -= 1;
  }

  return floors;
}

/** Splits an amount equally across the given uids using the largest-remainder method. */
export function splitEqual(amountMinor: number, uids: string[]): Record<string, number> {
  const weights = Object.fromEntries(uids.map((uid) => [uid, 1]));
  return distributeByWeights(amountMinor, weights);
}

/** Throws unless the payer amounts sum exactly to the expense total. */
export function validatePaidBy(amountMinor: number, paidBy: Record<string, number>): void {
  assertIntegerMinorUnits(amountMinor);
  const sum = Object.values(paidBy).reduce((total, value) => total + value, 0);
  if (sum !== amountMinor) {
    throw new AmountMismatchError("sum(paidBy)", amountMinor, sum);
  }
}

/** Throws unless the split amounts sum exactly to the expense total. */
export function validateSplits(amountMinor: number, splits: Record<string, number>): void {
  assertIntegerMinorUnits(amountMinor);
  const sum = Object.values(splits).reduce((total, value) => total + value, 0);
  if (sum !== amountMinor) {
    throw new AmountMismatchError("sum(splits)", amountMinor, sum);
  }
}
