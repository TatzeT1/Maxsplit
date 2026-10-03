import { isCategoryId } from "@/lib/categories";
import { isIsoDate, isValidDescription, isValidEmoji } from "@/lib/ledger-input";
import { splitEqual, validatePaidBy } from "@/lib/money/split";
import type { Expense, ExpenseGame, GameExpenseDraft, GroupMember } from "@/lib/types";

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
  if (!isValidDescription(draft.description)) return "invalid-description";
  if (!Number.isInteger(draft.amountMinor) || draft.amountMinor <= 0) return "invalid-amount";
  if (!isIsoDate(draft.date)) return "invalid-date";
  if (draft.category !== null && !isCategoryId(draft.category)) return "invalid-category";
  if (!isValidEmoji(draft.emoji)) return "invalid-emoji";
  if (draft.payerIsWinner) {
    // The winner isn't known yet; a preset payer would contradict "winner takes it".
    return Object.keys(draft.paidBy).length === 0 ? null : "invalid-payer";
  }
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
  /** Required when the draft is `payerIsWinner`: the one player who didn't lose. */
  winnerUid?: string;
  /** Which game decided it and who played, as a hand-applied result records it. */
  game?: ExpenseGame;
  createdBy: string;
  now: string;
}): Omit<Expense, "id"> {
  const { draft, loserUids, winnerUid, game, createdBy, now } = input;
  if (loserUids.length === 0) throw new Error("A game expense needs at least one loser");
  if (draft.payerIsWinner && !winnerUid) throw new Error("A stake game needs a winner to pay");
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
    paidBy: draft.payerIsWinner ? { [winnerUid!]: draft.amountMinor } : draft.paidBy,
    splitMode: "exact",
    splits,
    createdBy,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    viaLottery: true,
    ...(game ? { game } : {}),
  };
}
