import { splitEqual, validatePaidBy } from "@/lib/money/split";
import type { Expense, GameExpenseDraft, GroupMember } from "@/lib/types";

const MAX_DESCRIPTION_LENGTH = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks an auto-book draft at game start, so a bad amount or a stranger as
 * payer is rejected while the person can still fix it — not discovered at the
 * end of a tournament, when nobody's looking at the form anymore. Same rules
 * `addExpense` applies; returns its error codes.
 */
export function validateGameExpenseDraft(
  draft: GameExpenseDraft,
  members: Record<string, GroupMember>,
): string | null {
  if (!draft.description.trim() || draft.description.length > MAX_DESCRIPTION_LENGTH) {
    return "invalid-description";
  }
  if (!Number.isInteger(draft.amountMinor) || draft.amountMinor <= 0) return "invalid-amount";
  if (!ISO_DATE.test(draft.date)) return "invalid-date";
  const payerUids = Object.keys(draft.paidBy);
  if (payerUids.length === 0) return "invalid-payer";
  if (!payerUids.every((uid) => uid in members)) return "forbidden";
  try {
    validatePaidBy(draft.amountMinor, draft.paidBy);
  } catch {
    return "invalid-payer";
  }
  return null;
}

/**
 * The expense a finished game books: the drafted bill, split equally across
 * whoever lost — the exact same shape `AddExpenseDialog` produces when a game
 * result is applied by hand (an "exact" split whose inputs are
 * `splitEqual`'s amounts, `viaLottery` set), so the ledger can't tell the two
 * paths apart. `loserUids` order matters: `splitEqual` hands rounding cents
 * out in input order, and `bracketLoserUids` already orders it stably.
 */
export function buildGameExpense(input: {
  draft: GameExpenseDraft;
  loserUids: string[];
  createdBy: string;
  now: string;
}): Omit<Expense, "id"> {
  const { draft, loserUids, createdBy, now } = input;
  if (loserUids.length === 0) throw new Error("A game expense needs at least one loser");
  const amounts = splitEqual(draft.amountMinor, loserUids);
  const splits = Object.fromEntries(
    loserUids.map((uid) => [uid, { rawValue: amounts[uid], amountMinor: amounts[uid] }]),
  );
  return {
    description: draft.description.trim(),
    amountMinor: draft.amountMinor,
    currency: draft.currency,
    date: draft.date,
    category: draft.category,
    emoji: draft.emoji,
    paidBy: draft.paidBy,
    splitMode: "exact",
    splits,
    createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    viaLottery: true,
  };
}
