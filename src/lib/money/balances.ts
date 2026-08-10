import { distributeByWeights } from "./split";

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

export interface SimplifiedTransfer {
  fromUid: string;
  toUid: string;
  amountMinor: number;
}

/**
 * Reduces a group's net balances to a minimal set of suggested transfers
 * ("simplify debts"): repeatedly matches the largest creditor with the
 * largest debtor until everyone nets to zero. This is a greedy min-cash-flow
 * heuristic, not a globally-optimal minimum-transaction-count solver (that's
 * NP-hard) — it's the same approach Splitwise-style apps use in practice and
 * is always at most `n - 1` transfers for `n` people with a nonzero balance.
 *
 * Purely a display suggestion: it does not read or write settlements, so
 * callers must still record an actual settlement (recordSettlement) once
 * money changes hands. Input must already sum to zero (see computeBalances).
 */
export function simplifyDebts(balances: Record<string, number>): SimplifiedTransfer[] {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([uid, amount]) => ({ uid, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([uid, amount]) => ({ uid, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const transfers: SimplifiedTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amountMinor = Math.min(creditor.amount, debtor.amount);

    transfers.push({ fromUid: debtor.uid, toUid: creditor.uid, amountMinor });
    creditor.amount -= amountMinor;
    debtor.amount -= amountMinor;

    if (creditor.amount === 0) ci++;
    if (debtor.amount === 0) di++;
  }

  return transfers;
}

export interface PairwiseExpense {
  paidBy: Record<string, number>;
  splits: Record<string, number>;
}

export interface PairwiseSettlement {
  fromUid: string;
  toUid: string;
  amountMinor: number;
}

/**
 * Computes net pairwise debts for direct "Du schuldest Anna 12,50 €"-style
 * display. Returns `net[a][b]`: how much `a` owes `b` (negative means `b`
 * owes `a` instead). By construction `net[a][b] === -net[b][a]`, so callers
 * only need to read one direction. This is a direct per-expense ledger, not
 * a simplified minimum-cash-flow result — debt simplification is a
 * separate, opt-in Phase 3 feature per the project roadmap.
 *
 * With multiple payers on one expense, each participant's split is
 * attributed across the payers proportionally to what each payer
 * contributed (via the same largest-remainder distribution used for
 * splits), so e.g. a 100 € expense paid 60/40 by Anna/Ben and split evenly
 * three ways correctly credits both Anna and Ben, not just whoever happens
 * to be the first key in `paidBy`.
 */
export function computePairwiseDebts(
  expenses: PairwiseExpense[],
  settlements: PairwiseSettlement[] = [],
): Record<string, Record<string, number>> {
  const net: Record<string, Record<string, number>> = {};

  const add = (debtor: string, creditor: string, amountMinor: number) => {
    if (debtor === creditor || amountMinor === 0) return;
    net[debtor] ??= {};
    net[creditor] ??= {};
    net[debtor][creditor] = (net[debtor][creditor] ?? 0) + amountMinor;
    net[creditor][debtor] = (net[creditor][debtor] ?? 0) - amountMinor;
  };

  for (const expense of expenses) {
    const payerUids = Object.keys(expense.paidBy);
    for (const [participantUid, amountMinor] of Object.entries(expense.splits)) {
      if (amountMinor === 0) continue;
      const portions =
        payerUids.length === 1
          ? { [payerUids[0]]: amountMinor }
          : distributeByWeights(amountMinor, expense.paidBy);
      for (const payerUid of payerUids) {
        add(participantUid, payerUid, portions[payerUid]);
      }
    }
  }

  for (const settlement of settlements) {
    add(settlement.fromUid, settlement.toUid, -settlement.amountMinor);
  }

  return net;
}
