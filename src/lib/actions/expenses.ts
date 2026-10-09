"use server";

import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isCategoryId } from "@/lib/categories";
import { gameResultMessage } from "@/lib/chat/game-result";
import { buildEstimateAudit, buildEstimateChatSummary } from "@/lib/games/estimate-audit";
import { normalizeExpenseGame } from "@/lib/games/expense-game";
import { isGroupManager } from "@/lib/groups/permissions";
import { getServerT } from "@/lib/i18n/server";
import { isIsoDate, isValidDescription, isValidEmoji } from "@/lib/ledger-input";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import {
  isClaimableEstimateRound,
  isEqualSplitAmong,
  splitPayerUids,
} from "@/lib/money/game-expense";
import { expensePushes } from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import {
  splitByPercent,
  splitByShares,
  splitEqual,
  splitExact,
  validatePaidBy,
} from "@/lib/money/split";
import type {
  ActivityLogEntry,
  CategoryId,
  EstimateAudit,
  EstimateChatSummary,
  EstimateRound,
  Expense,
  ExpenseGame,
  ExpenseGameInput,
  ExpenseSplit,
  Group,
  SplitMode,
} from "@/lib/types";
import type { ActionResult } from "./groups";

export interface ExpenseInput {
  groupId: string;
  description: string;
  amountMinor: number;
  currency: string;
  date: string;
  category: CategoryId | null;
  emoji: string | null;
  paidBy: Record<string, number>;
  splitMode: SplitMode;
  /** Participant uids for "equal"; ignored for the other modes. */
  participantUids: string[];
  /** Raw per-uid input for "shares" (share count), "percent" (0-100), or "exact" (minor units). */
  splitInputs: Record<string, number>;
  /** True when `splitInputs` came from a split game rather than a manual entry — see Expense.viaLottery. */
  viaLottery: boolean;
  /**
   * Which game that was, who played, which attempt — read only with `viaLottery`.
   * See Expense.game. An estimate game may carry `estimateRoundId`, the finished
   * one-phone round this expense claims (verified by `addExpense`, never stored).
   */
  game?: ExpenseGameInput | null;
}

type MembershipResult =
  | { error: "not-found" | "forbidden" }
  | { group: Omit<Group, "id">; groupRef: FirebaseFirestore.DocumentReference };

async function requireGroupMembership(groupId: string, uid: string): Promise<MembershipResult> {
  const groupSnap = await adminDb.collection("groups").doc(groupId).get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { group, groupRef: groupSnap.ref };
}

function toSplits(
  amounts: Record<string, number>,
  rawValues: Record<string, number>,
): Record<string, ExpenseSplit> {
  const splits: Record<string, ExpenseSplit> = {};
  for (const [uid, amountMinor] of Object.entries(amounts)) {
    splits[uid] = { rawValue: rawValues[uid], amountMinor };
  }
  return splits;
}

/** Computes per-participant splits for the given mode. Throws on invalid split input. */
function buildSplits(input: ExpenseInput): Record<string, ExpenseSplit> {
  switch (input.splitMode) {
    case "equal": {
      const amounts = splitEqual(input.amountMinor, input.participantUids);
      const rawValues = Object.fromEntries(input.participantUids.map((uid) => [uid, 1]));
      return toSplits(amounts, rawValues);
    }
    case "shares": {
      const amounts = splitByShares(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
    case "percent": {
      const amounts = splitByPercent(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
    case "exact": {
      const amounts = splitExact(input.amountMinor, input.splitInputs);
      return toSplits(amounts, input.splitInputs);
    }
  }
}

function splitParticipantUids(input: ExpenseInput): string[] {
  return input.splitMode === "equal" ? input.participantUids : Object.keys(input.splitInputs);
}

const SPLIT_MODES: readonly SplitMode[] = ["equal", "shares", "percent", "exact"];

/**
 * Shape checks on everything the client sends. The parameter types are
 * compile-time only, and several of these fields end up somewhere a bad
 * value breaks more than one expense: an unknown category has no icon or
 * label and throws while rendering the group page, a malformed date sorts
 * and formats wrongly, an unknown split mode reaches no branch of
 * buildSplits.
 */
function validateExpenseInput(input: ExpenseInput): string | null {
  if (!isValidDescription(input.description)) return "invalid-description";
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) return "invalid-amount";
  if (!isIsoDate(input.date)) return "invalid-date";
  if (input.category !== null && !isCategoryId(input.category)) return "invalid-category";
  if (!isValidEmoji(input.emoji)) return "invalid-emoji";
  if (!SPLIT_MODES.includes(input.splitMode)) return "invalid-split";
  if (Object.keys(input.paidBy).length === 0) return "invalid-payer";
  if (splitParticipantUids(input).length === 0) return "invalid-participants";
  return null;
}

/** gRPC codes a batch commit fails with when its `lastUpdateTime` precondition no longer holds. */
const GRPC_NOT_FOUND = 5;
const GRPC_FAILED_PRECONDITION = 9;

function isClaimConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === GRPC_FAILED_PRECONDITION || code === GRPC_NOT_FOUND;
}

function creatorEntry(
  group: Pick<Group, "members">,
  uid: string,
): { name: string; placeholder: boolean } {
  const member = group.members[uid];
  return { name: member?.displayName ?? "?", placeholder: member?.isPlaceholder === true };
}

interface EstimateClaim {
  roundRef: FirebaseFirestore.DocumentReference;
  /** The version the round was verified at: the claim only lands if nobody touched it since. */
  updateTime: FirebaseFirestore.Timestamp;
  /** The round's payers, furthest first — the order the chat card lists them in. */
  loserUids: string[];
  audit: EstimateAudit;
  summary: EstimateChatSummary;
}

/**
 * Verifies that this expense really books a finished one-phone estimate round
 * (spec E.9), and returns the server-written audit and chat summary to store
 * with it — or `null`, in which case the expense is booked as a plain game
 * record: no audit, no claim. Soft on purpose: a hand-edited split must not
 * carry an audit that contradicts it, but the bill still has to be bookable.
 *
 * Checked: the round is the caller's own, one-phone, finished, unclaimed and
 * fresh (a finished round cannot sit in a drawer and be attached to next
 * week's dinner); the bill is an exact split that is the equal split of the
 * booked amount among the round's payers (the MONEY, not just the payer set);
 * and the players are the ones who sat at the table.
 */
async function verifyEstimateClaim(args: {
  groupRef: FirebaseFirestore.DocumentReference;
  group: Omit<Group, "id">;
  roundId: string;
  input: ExpenseInput;
  splits: Record<string, ExpenseSplit>;
  game: ExpenseGame;
  uid: string;
  now: string;
}): Promise<EstimateClaim | null> {
  const { groupRef, group, roundId, input, splits, game, uid, now } = args;
  const roundSnap = await groupRef.collection("estimateRounds").doc(roundId).get();
  if (!roundSnap.exists || !roundSnap.updateTime) return null;
  const round = roundSnap.data() as Omit<EstimateRound, "id">;
  const claimable = isClaimableEstimateRound({
    round,
    uid,
    now,
    amountMinor: input.amountMinor,
    splitMode: input.splitMode,
    splits,
    playerUids: game.playerUids,
  });
  if (!claimable || !round.loserUids) return null;

  const roundWithId: EstimateRound = { id: roundSnap.id, ...round };
  return {
    roundRef: roundSnap.ref,
    updateTime: roundSnap.updateTime,
    loserUids: round.loserUids,
    audit: buildEstimateAudit(
      roundWithId,
      { amountMinor: input.amountMinor, currency: input.currency },
      creatorEntry(group, uid),
    ),
    summary: buildEstimateChatSummary(roundWithId),
  };
}

async function resolveExpense(
  input: ExpenseInput,
  session: { uid: string },
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      group: Omit<Group, "id">;
      groupRef: FirebaseFirestore.DocumentReference;
      splits: Record<string, ExpenseSplit>;
      /** Exactly `{ gameId, playerUids, attempt }` — never an estimate id or audit (see normalizeExpenseGame). */
      game: ExpenseGame | null;
      /**
       * The one-phone estimate round the client says this expense books. Travels
       * beside `game` because `editExpense` stores `game` verbatim; only
       * `addExpense` reads it, and it is never stored.
       */
      claimRoundId: string | null;
    }
> {
  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const validationError = validateExpenseInput(input);
  if (validationError) return { ok: false, error: validationError };
  // Balances add every expense's amount as-is, in the group's currency —
  // an expense in another one would be counted at face value.
  if (input.currency !== group.currency) return { ok: false, error: "invalid-currency" };

  // Checked against group.members (real + placeholder), not memberUids
  // (real, authenticated members only) — placeholder members are valid
  // payers/participants even though they have no session of their own.
  const allParticipantUids = [...Object.keys(input.paidBy), ...splitParticipantUids(input)];
  // Own keys only: `uid in group.members` follows the prototype chain and would accept
  // "constructor", "toString" or "__proto__" as a member.
  if (!allParticipantUids.every((uid) => Object.hasOwn(group.members, uid))) {
    return { ok: false, error: "forbidden" };
  }

  let splits: Record<string, ExpenseSplit>;
  try {
    validatePaidBy(input.amountMinor, input.paidBy);
    splits = buildSplits(input);
  } catch {
    return { ok: false, error: "invalid-split" };
  }

  const gameCheck =
    input.viaLottery === true
      ? normalizeExpenseGame(input.game, {
          memberUids: Object.keys(group.members),
          payerUids: splitPayerUids(splits),
        })
      : ({ ok: true, game: null, estimateRoundId: undefined } as const);
  if (!gameCheck.ok) return { ok: false, error: gameCheck.error };

  return {
    ok: true,
    group,
    groupRef,
    splits,
    game: gameCheck.game,
    claimRoundId: gameCheck.estimateRoundId ?? null,
  };
}

export async function addExpense(
  input: ExpenseInput,
): Promise<ActionResult<{ expenseId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const resolved = await resolveExpense(input, session);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { group, groupRef, splits, game, claimRoundId } = resolved;

  const now = new Date().toISOString();
  const expenseRef = groupRef.collection("expenses").doc();

  // A finished one-phone estimate round this expense books: verified, then claimed in the
  // same batch. Unverified (or not an estimate game) -> the plain game record, no audit.
  const claim =
    game?.gameId === "estimate" && claimRoundId
      ? await verifyEstimateClaim({
          groupRef,
          group,
          roundId: claimRoundId,
          input,
          splits,
          game,
          uid: session.uid,
          now,
        })
      : null;
  const storedGame = game && claim ? { ...game, estimate: claim.audit } : game;

  const expense: Omit<Expense, "id"> = {
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: input.category,
    emoji: input.emoji,
    paidBy: input.paidBy,
    splitMode: input.splitMode,
    splits,
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    viaLottery: input.viaLottery === true,
    ...(storedGame ? { game: storedGame } : {}),
  };

  const batch = adminDb.batch();
  batch.set(expenseRef, expense);
  if (claim) {
    // Optimistic claim: if anything touched the round since it was verified (a second expense
    // claiming it at the same moment), the whole batch fails and nothing is written.
    batch.update(
      claim.roundRef,
      { expenseId: expenseRef.id, updatedAt: now },
      { lastUpdateTime: claim.updateTime },
    );
  }
  if (game) {
    // A game decided it: the group chat hears who pays, in the same write.
    // No chat push on top — the expense push already reaches everyone in it.
    batch.set(
      groupRef.collection("messages").doc(),
      gameResultMessage({
        t: await getServerT(),
        senderUid: session.uid,
        nameOf: (uid) => group.members[uid]?.displayName ?? "?",
        now,
        result: {
          gameId: game.gameId,
          loserUids: claim ? claim.loserUids : splitPayerUids(splits),
          winnerUid: null,
          amount: {
            description: expense.description,
            amountMinor: expense.amountMinor,
            currency: expense.currency,
          },
          attempt: game.attempt,
          tournamentId: null,
          ...(claim ? { roundId: claimRoundId, estimate: claim.summary } : {}),
        },
      }),
    );
  }
  try {
    await batch.commit();
  } catch (error) {
    // Someone else claimed (or removed) the round between our read and this write.
    if (claim && isClaimConflict(error)) return { ok: false, error: "invalid-game" };
    throw error;
  }
  await recomputeGroupBalances(groupRef);
  notifyAfterResponse(
    expensePushes({
      groupId: input.groupId,
      group,
      expenseId: expenseRef.id,
      expense,
      origin: "added",
      actorUid: session.uid,
    }),
  );
  return { ok: true, data: { expenseId: expenseRef.id } };
}

export async function editExpense(
  input: ExpenseInput & { expenseId: string },
): Promise<ActionResult<{ expenseId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const resolved = await resolveExpense(input, session);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { group, groupRef, splits, game: resolvedGame } = resolved;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const stored = expenseSnap.data() as Expense;
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if (stored.createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  // `game` is what the client's record normalizes to, and that never holds the server-written
  // estimate audit — storing it as is would wipe the audit on the next typo fix. An edit
  // keeps the stored record (audit, attempt, players) for as long as it is still the same
  // estimate bill: the same payers, still splitting the (possibly corrected) amount equally.
  // Anything else — a hand-edited split, another game, no game — stores the plain record.
  // An edit never claims a round and never stores an id (`claimRoundId` is ignored).
  const game =
    stored.game?.estimate &&
    resolvedGame?.gameId === "estimate" &&
    isEqualSplitAmong(input.amountMinor, splits, splitPayerUids(stored.splits))
      ? stored.game
      : resolvedGame;

  const now = new Date().toISOString();
  await expenseRef.update({
    description: input.description.trim(),
    amountMinor: input.amountMinor,
    currency: input.currency,
    date: input.date,
    category: input.category,
    emoji: input.emoji,
    paidBy: input.paidBy,
    splitMode: input.splitMode,
    splits,
    updatedAt: now,
    viaLottery: input.viaLottery === true,
    game,
  });

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "expense_edited",
    actorUid: session.uid,
    description: input.description.trim(),
    createdAt: now,
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: { expenseId: input.expenseId } };
}

export async function deleteExpense(input: {
  groupId: string;
  expenseId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const expense = expenseSnap.data() as Expense;
  const canManage = isGroupManager(group.members[session.uid]?.role);
  if (expense.createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }

  const now = new Date().toISOString();
  await expenseRef.update({ deletedAt: now });

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "expense_deleted",
    actorUid: session.uid,
    description: expense.description,
    createdAt: now,
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: null };
}

/**
 * Undoes `deleteExpense` — the group page's "Rückgängig" toast. Same ownership
 * rule as deleting it: whoever may delete an expense may bring it back.
 *
 * A deletion is only a `deletedAt` stamp, so there is nothing to rebuild; but
 * the group can change in the seconds between the two, and a restored row
 * must still satisfy what addExpense enforces. Both guards are about the
 * ledger's invariants rather than about who's asking:
 *   - the currency: it's only locked while something is booked, and deleting
 *     the last expense unlocks it;
 *   - the people: removing a member needs a zero balance, which deleting their
 *     only expense can produce — and balances name debts only for people who
 *     are still in `members`.
 *
 * Restoring an expense that isn't deleted is a no-op success, so a double tap
 * (or a second member undoing the same deletion) isn't an error.
 */
export async function restoreExpense(input: {
  groupId: string;
  expenseId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const expenseRef = groupRef.collection("expenses").doc(input.expenseId);
  const expenseSnap = await expenseRef.get();
  if (!expenseSnap.exists) return { ok: false, error: "not-found" };
  const expense = expenseSnap.data() as Expense;

  const canManage = isGroupManager(group.members[session.uid]?.role);
  if (expense.createdBy !== session.uid && !canManage) {
    return { ok: false, error: "not-owner" };
  }
  if (!expense.deletedAt) return { ok: true, data: null };

  if (expense.currency !== group.currency) return { ok: false, error: "invalid-currency" };
  const involved = [...Object.keys(expense.paidBy), ...Object.keys(expense.splits)];
  if (involved.some((uid) => !(uid in group.members))) return { ok: false, error: "member-gone" };

  await expenseRef.update({ deletedAt: null });

  const logEntry: Omit<ActivityLogEntry, "id"> = {
    type: "expense_restored",
    actorUid: session.uid,
    description: expense.description,
    createdAt: new Date().toISOString(),
  };
  await groupRef.collection("activityLog").add(logEntry);
  await recomputeGroupBalances(groupRef);

  return { ok: true, data: null };
}
