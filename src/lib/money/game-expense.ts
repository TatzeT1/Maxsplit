import { isCategoryId } from "@/lib/categories";
import { ESTIMATE_CLAIM_WINDOW_MS } from "@/lib/games/estimate-input";
import { isIsoDate, isValidDescription, isValidEmoji } from "@/lib/ledger-input";
import { splitEqual, validatePaidBy } from "@/lib/money/split";
import type {
  EstimateRound,
  Expense,
  ExpenseGame,
  ExpenseSplit,
  GameExpenseDraft,
  GroupMember,
  SplitMode,
} from "@/lib/types";

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
  // Own keys only: `uid in members` follows the prototype chain and would
  // accept "constructor", "toString" or "__proto__" as a group member.
  if (!payerUids.every((uid) => Object.hasOwn(members, uid))) return "forbidden";
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

/** The uids that pay in a split: whoever has a positive share. */
export function splitPayerUids(splits: Record<string, ExpenseSplit>): string[] {
  return Object.keys(splits).filter((uid) => splits[uid].amountMinor > 0);
}

/** Same members, whatever the order (a Firestore map has none to compare). */
export function sameUidSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((uid) => right.has(uid));
}

/**
 * "Still the equal split of `amountMinor` among exactly these payers": nobody
 * else pays, and the positive shares are the ones `splitEqual` hands out. The
 * shares are compared sorted — who gets an odd cent is not part of the check,
 * because a stored map has no order to compare against (the same rule as
 * `compareEstimateAuditToExpense.equalSplit`). `editExpense` uses it to decide
 * whether an estimate expense may keep its audit.
 */
export function isEqualSplitAmong(
  amountMinor: number,
  splits: Record<string, ExpenseSplit>,
  payerUids: readonly string[],
): boolean {
  const paying = splitPayerUids(splits);
  if (payerUids.length === 0 || !sameUidSet(paying, payerUids)) return false;
  const expected = Object.values(splitEqual(amountMinor, [...new Set(payerUids)]));
  const actual = paying.map((uid) => splits[uid].amountMinor);
  if (expected.length !== actual.length) return false;
  expected.sort((a, b) => a - b);
  actual.sort((a, b) => a - b);
  return expected.every((amount, index) => amount === actual[index]);
}

/**
 * Whether an expense may claim a finished one-phone estimate round (spec E.9),
 * i.e. be booked with that round's audit. Pure; `addExpense` reads the round and
 * applies it. Every condition must hold, and a "no" is soft — the expense is
 * still booked, as a plain game record without an audit:
 *
 * - the round is the booker's own, one-phone, finished and not claimed yet, and
 *   was finished at most `ESTIMATE_CLAIM_WINDOW_MS` ago (a finished round cannot
 *   sit in a drawer and be attached to next week's dinner);
 * - the bill is an `exact` split that is `splitEqual(amountMinor, loserUids)`
 *   share for share — the MONEY, not only the payer set — among exactly the
 *   round's payers (the form builds just that: `handleSplitGameResolve`);
 * - the game record names the players who sat at the table.
 */
export function isClaimableEstimateRound(input: {
  round: Pick<
    EstimateRound,
    "mode" | "status" | "createdBy" | "expenseId" | "loserUids" | "finishedAt" | "order"
  >;
  /** Who is booking. */
  uid: string;
  /** ISO timestamp of the booking. */
  now: string;
  amountMinor: number;
  splitMode: SplitMode;
  splits: Record<string, ExpenseSplit>;
  /** `game.playerUids` of the expense. */
  playerUids: readonly string[];
}): boolean {
  const { round, uid, now, amountMinor, splitMode, splits, playerUids } = input;
  const { loserUids, finishedAt } = round;
  if (
    round.mode !== "local" ||
    round.status !== "finished" ||
    round.createdBy !== uid ||
    (round.expenseId ?? null) !== null ||
    !loserUids ||
    loserUids.length === 0 ||
    !finishedAt
  ) {
    return false;
  }
  // `NaN <= x` is false, so an unreadable timestamp fails the freshness check too.
  if (!(Date.parse(now) - Date.parse(finishedAt) <= ESTIMATE_CLAIM_WINDOW_MS)) return false;
  if (splitMode !== "exact") return false;

  const payerUids = splitPayerUids(splits);
  if (!sameUidSet(loserUids, payerUids) || !sameUidSet(round.order, playerUids)) return false;
  const expected = splitEqual(amountMinor, loserUids);
  return payerUids.every((payer) => splits[payer].amountMinor === expected[payer]);
}
