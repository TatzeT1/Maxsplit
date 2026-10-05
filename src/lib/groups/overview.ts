import type { Group } from "@/lib/types";

// What the groups list shows across groups: one total per currency, which
// groups come first, and which are filed under "Archiviert". All of it reads
// the cached `Group.balancesMinor` (see types.ts) — the list never subscribes
// to every group's ledger just to add things up.

type BalanceSource = Pick<Group, "currency" | "balancesMinor">;

/** The caller's own balance in a group (positive = owed to them), or `null` while the group has no cached balances yet. */
export function ownBalance(group: Pick<Group, "balancesMinor">, uid: string): number | null {
  if (group.balancesMinor === undefined) return null;
  // The cache names only people the ledger mentions: someone it doesn't is square.
  return group.balancesMinor[uid] ?? 0;
}

export interface CurrencyTotals {
  currency: string;
  /** Everything other people still owe you in this currency, over every group. */
  owedToYouMinor: number;
  /** Everything you still owe other people in this currency, over every group. */
  youOweMinor: number;
}

export interface BalanceSummary {
  /** One entry per currency with something open, sorted by code. */
  byCurrency: CurrencyTotals[];
  /** Groups without cached balances: left out of the totals, since a missing figure is not a zero. */
  unknownCount: number;
}

/**
 * Adds up your balances over all groups, per currency. Credits and debts stay
 * apart rather than netting out: +40 € in one group and −25 € in another are
 * different people, and "you're 15 € up" would hide that you still owe 25 €.
 * Archived groups count too — hiding a group doesn't pay its debts.
 */
export function summarizeBalances(groups: BalanceSource[], uid: string): BalanceSummary {
  const totals = new Map<string, CurrencyTotals>();
  let unknownCount = 0;

  for (const group of groups) {
    const balance = ownBalance(group, uid);
    if (balance === null) {
      unknownCount += 1;
      continue;
    }
    if (balance === 0) continue;
    const entry = totals.get(group.currency) ?? {
      currency: group.currency,
      owedToYouMinor: 0,
      youOweMinor: 0,
    };
    if (balance > 0) entry.owedToYouMinor += balance;
    else entry.youOweMinor += -balance;
    totals.set(group.currency, entry);
  }

  return {
    byCurrency: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    unknownCount,
  };
}

/** Groups where you owe or are owed something first, then the newest — a settled group has nothing to ask of you. Doesn't modify its input. */
export function sortGroupsForList<T extends BalanceSource & Pick<Group, "createdAt">>(
  groups: T[],
  uid: string,
): T[] {
  const isOpen = (group: T) => (ownBalance(group, uid) ?? 0) !== 0;
  return [...groups].sort(
    (a, b) => Number(isOpen(b)) - Number(isOpen(a)) || b.createdAt.localeCompare(a.createdAt),
  );
}

/** Splits a list into what the main list shows and what goes under "Archiviert", keeping the order. */
export function partitionArchived<T extends Partial<Pick<Group, "archived">>>(
  groups: T[],
): { active: T[]; archived: T[] } {
  return {
    active: groups.filter((group) => group.archived !== true),
    archived: groups.filter((group) => group.archived === true),
  };
}
