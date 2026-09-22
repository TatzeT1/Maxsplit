export interface LotteryTotal {
  amountMinor: number;
  roundsLost: number;
}

/**
 * Per-member 🎲 Split Lottery losses: total amount and number of rounds
 * lost. Only expenses flagged `viaLottery` count — that flag is only set
 * going forward (see Expense.viaLottery), so rounds played before it
 * existed aren't reflected here.
 */
export function computeLotteryTotals(
  expenses: { viaLottery?: boolean; splits: Record<string, { amountMinor: number }> }[],
): Record<string, LotteryTotal> {
  const totals: Record<string, LotteryTotal> = {};
  for (const expense of expenses) {
    if (!expense.viaLottery) continue;
    for (const [uid, split] of Object.entries(expense.splits)) {
      if (split.amountMinor <= 0) continue;
      const entry = (totals[uid] ??= { amountMinor: 0, roundsLost: 0 });
      entry.amountMinor += split.amountMinor;
      entry.roundsLost += 1;
    }
  }
  return totals;
}
