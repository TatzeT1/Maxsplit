export interface BalanceExpense {
  paidBy: Record<string, number>;
  splits: Record<string, number>;
}

export interface BalanceSettlement {
  fromUid: string;
  toUid: string;
  amountMinor: number;
}

/**
 * Computes each member's net balance in minor units: positive means the
 * group owes them money, negative means they owe the group. Relies on each
 * expense already satisfying `sum(paidBy) === sum(splits) === amountMinor`
 * (see validatePaidBy/validateSplits in split.ts) — that per-expense
 * invariant is what makes `sum(balances) === 0` hold here.
 */
export function computeBalances(
  expenses: BalanceExpense[],
  settlements: BalanceSettlement[] = [],
): Record<string, number> {
  const balances: Record<string, number> = {};

  const add = (uid: string, amountMinor: number) => {
    balances[uid] = (balances[uid] ?? 0) + amountMinor;
  };

  for (const expense of expenses) {
    for (const [uid, amountMinor] of Object.entries(expense.paidBy)) {
      add(uid, amountMinor);
    }
    for (const [uid, amountMinor] of Object.entries(expense.splits)) {
      add(uid, -amountMinor);
    }
  }

  for (const settlement of settlements) {
    // The payer's debt shrinks (balance moves toward zero); the payee's
    // credit shrinks by the same amount, since they've now been paid.
    add(settlement.fromUid, settlement.amountMinor);
    add(settlement.toUid, -settlement.amountMinor);
  }

  return balances;
}

export interface PairwiseExpense {
  payerUid: string;
  splits: Record<string, number>;
}

export interface PairwiseSettlement {
  fromUid: string;
  toUid: string;
  amountMinor: number;
}

/**
 * Computes net pairwise debts for direct "Du schuldest Anna 12,50 €"-style
 * display (single payer per expense, as in Phase 1 — see plan.md). Returns
 * `net[a][b]`: how much `a` owes `b` (negative means `b` owes `a` instead).
 * By construction `net[a][b] === -net[b][a]`, so callers only need to read
 * one direction. This is a direct per-expense ledger, not a simplified
 * minimum-cash-flow result — debt simplification is a separate, opt-in
 * Phase 3 feature per the project roadmap.
 */
export function computePairwiseDebts(
  expenses: PairwiseExpense[],
  settlements: PairwiseSettlement[] = [],
): Record<string, Record<string, number>> {
  const net: Record<string, Record<string, number>> = {};

  const add = (debtor: string, creditor: string, amountMinor: number) => {
    if (debtor === creditor) return;
    net[debtor] ??= {};
    net[creditor] ??= {};
    net[debtor][creditor] = (net[debtor][creditor] ?? 0) + amountMinor;
    net[creditor][debtor] = (net[creditor][debtor] ?? 0) - amountMinor;
  };

  for (const expense of expenses) {
    for (const [participantUid, amountMinor] of Object.entries(expense.splits)) {
      if (participantUid === expense.payerUid) continue;
      add(participantUid, expense.payerUid, amountMinor);
    }
  }

  for (const settlement of settlements) {
    add(settlement.fromUid, settlement.toUid, -settlement.amountMinor);
  }

  return net;
}
