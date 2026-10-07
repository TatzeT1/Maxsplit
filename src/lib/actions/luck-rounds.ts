"use server";

import { getSession } from "@/lib/auth/session";
import { gameResultMessage } from "@/lib/chat/game-result";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import {
  canScratchFor,
  drawScratchCard,
  isValidLuckRoundCount,
  scratchLosers,
  unrevealedUids,
} from "@/lib/games/luck-round";
import { randomInt, secureShuffle } from "@/lib/games/random";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { getServerT } from "@/lib/i18n/server";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { buildGameExpense, validateGameExpenseDraft } from "@/lib/money/game-expense";
import { expensePushes, luckChallengePushes } from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import type { PendingPush } from "@/lib/push/types";
import type {
  ChatMessage,
  Expense,
  GameExpenseDraft,
  Group,
  LuckRound,
  OnlineLuckGameId,
} from "@/lib/types";
import type { ActionResult } from "./groups";

// Online luck rounds (ADR-005): a luck game everyone plays on their own
// phone — for now the scratch cards. The rules are lib/games/luck-round.ts;
// this layer runs them inside transactions, books the bill when the last
// card is scratched, and keeps the group's `activeLuckRound` pointer (what
// the group page's banner reads) in step with the round.

type RoundDoc = Omit<LuckRound, "id">;
type ServerT = Awaited<ReturnType<typeof getServerT>>;

/** As many cards as fit a phone screen in a grid — and as many as a bracket holds. */
const MAX_LUCK_ROUND_PLAYERS = 32;

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

/**
 * Starts an online luck round for a new bill: the server draws the cards'
 * order, posts a join card to the chat and points the group at the round.
 * One luck round per group at a time.
 */
export async function createLuckRound(input: {
  groupId: string;
  gameId: OnlineLuckGameId;
  poolUids: string[];
  targetLoserCount: number;
  autoBook: GameExpenseDraft;
}): Promise<ActionResult<{ roundId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (input.gameId !== "scratch") return { ok: false, error: "invalid-game" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const poolUids = [...new Set(input.poolUids)];
  const withAccount = poolUids.filter((uid) => group.memberUids.includes(uid));
  if (
    poolUids.length < 2 ||
    poolUids.length > MAX_LUCK_ROUND_PLAYERS ||
    poolUids.some((uid) => !group.members[uid]) ||
    // Online needs phones: at least two players have to be able to scratch.
    withAccount.length < 2
  ) {
    return { ok: false, error: "invalid-pool" };
  }
  if (!isValidLuckRoundCount(input.targetLoserCount, poolUids.length)) {
    return { ok: false, error: "invalid-count" };
  }
  const draft = input.autoBook;
  if (draft.payerIsWinner) return { ok: false, error: "invalid-payer" };
  const draftError = validateGameExpenseDraft(draft, group.members);
  if (draftError) return { ok: false, error: draftError };
  if (draft.currency !== group.currency) return { ok: false, error: "invalid-currency" };

  const t = await getServerT();
  const roundRef = groupRef.collection("luckRounds").doc();
  const now = new Date().toISOString();
  const description = draft.description.trim();
  const round: RoundDoc = {
    gameId: input.gameId,
    status: "running",
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    entrants: Object.fromEntries(
      poolUids.map((uid) => [
        uid,
        {
          displayName: group.members[uid].displayName,
          isPlaceholder: group.members[uid].isPlaceholder === true,
        },
      ]),
    ),
    order: secureShuffle(poolUids),
    targetLoserCount: input.targetLoserCount,
    revealed: {},
    revealedBy: {},
    loserUids: null,
    stake: { description, amountMinor: draft.amountMinor, currency: draft.currency },
    autoBook: { ...draft, description },
    expenseId: null,
    autoBookError: null,
  };
  const invite: Omit<ChatMessage, "id"> = {
    senderUid: session.uid,
    text: t("chat.luckInviteText", {
      name: group.members[session.uid]?.displayName ?? "",
      game: t(SPLIT_GAME_META[input.gameId].nameKey),
      stake: `${description} · ${formatMoney(draft.amountMinor, draft.currency)}`,
    }),
    createdAt: now,
    luckInvite: { roundId: roundRef.id, gameId: input.gameId },
  };

  const started = await adminDb.runTransaction<{ ok: true } | { ok: false; error: string }>(
    async (tx) => {
      const fresh = (await tx.get(groupRef)).data() as Omit<Group, "id"> | undefined;
      if (fresh?.activeLuckRound) return { ok: false, error: "round-running" };
      tx.set(roundRef, round);
      tx.update(groupRef, { activeLuckRound: { id: roundRef.id, gameId: input.gameId } });
      tx.set(groupRef.collection("messages").doc(), invite);
      return { ok: true };
    },
  );
  if (!started.ok) return started;

  notifyAfterResponse(
    luckChallengePushes({
      groupId: input.groupId,
      group,
      roundId: roundRef.id,
      gameId: input.gameId,
      stake: round.stake,
      poolUids,
      actorUid: session.uid,
    }),
  );
  return { ok: true, data: { roundId: roundRef.id } };
}

/**
 * Writes newly scratched cards, and — when they were the last ones —
 * finishes the round in the same transaction: the payers, the booked bill
 * (re-checked against who is still in the group), the group's pointer
 * cleared, and the result card in the chat.
 */
function applyReveals(input: {
  tx: FirebaseFirestore.Transaction;
  groupRef: FirebaseFirestore.DocumentReference;
  group: Omit<Group, "id">;
  roundRef: FirebaseFirestore.DocumentReference;
  round: RoundDoc;
  revealed: Record<string, boolean>;
  revealedBy: Record<string, string>;
  now: string;
  t: ServerT;
}): { bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null } {
  const { tx, groupRef, group, roundRef, round, revealed, revealedBy, now, t } = input;
  const update: Record<string, unknown> = { revealed, revealedBy, updatedAt: now };
  const loserUids = scratchLosers({ order: round.order, revealed });
  let bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null = null;

  if (loserUids) {
    update.status = "finished";
    update.finishedAt = now;
    update.loserUids = loserUids;
    const draftError = validateGameExpenseDraft(round.autoBook, group.members);
    if (draftError || !loserUids.every((uid) => uid in group.members)) {
      update.autoBookError = draftError ?? "member-left";
    } else {
      const expenseRef = groupRef.collection("expenses").doc();
      const expense = buildGameExpense({
        draft: round.autoBook,
        loserUids,
        game: { gameId: round.gameId, playerUids: round.order, attempt: 1 },
        createdBy: round.createdBy,
        now,
      });
      tx.set(expenseRef, expense);
      update.expenseId = expenseRef.id;
      bookedExpense = { id: expenseRef.id, expense };
    }
    if (group.activeLuckRound?.id === roundRef.id) {
      tx.update(groupRef, { activeLuckRound: null });
    }
    tx.set(
      groupRef.collection("messages").doc(),
      gameResultMessage({
        t,
        senderUid: round.createdBy,
        nameOf: (uid) => group.members[uid]?.displayName ?? round.entrants[uid]?.displayName ?? "?",
        now,
        result: {
          gameId: round.gameId,
          loserUids,
          winnerUid: null,
          amount: update.autoBookError ? null : round.stake,
          attempt: 1,
          tournamentId: null,
          roundId: roundRef.id,
        },
      }),
    );
  }

  tx.update(roundRef, update);
  return { bookedExpense };
}

/**
 * Reveals a booked round's expense to everyone it touches who wasn't
 * playing (the players watched it happen), and refreshes the balance cache.
 */
async function afterFinish(
  groupId: string,
  group: Omit<Group, "id">,
  groupRef: FirebaseFirestore.DocumentReference,
  round: RoundDoc,
  bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null,
) {
  if (!bookedExpense) return;
  await recomputeGroupBalances(groupRef);
  const pushes: PendingPush[] = expensePushes({
    groupId,
    group,
    expenseId: bookedExpense.id,
    expense: bookedExpense.expense,
    origin: "game",
    actorUid: null,
    skip: round.order,
  });
  notifyAfterResponse(pushes);
}

/**
 * Scratches one card: your own, or as the round's creator a placeholder's.
 * Its face is drawn right now (`drawScratchCard`). Scratching a card that's
 * already scratched just answers what it said — two taps, or two phones,
 * can't draw twice.
 */
export async function revealScratchCard(input: {
  groupId: string;
  roundId: string;
  cardUid: string;
}): Promise<ActionResult<{ pays: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { groupRef } = membership;
  const roundRef = groupRef.collection("luckRounds").doc(input.roundId);
  const t = await getServerT();

  const result = await adminDb.runTransaction<
    | {
        ok: true;
        pays: boolean;
        round: RoundDoc;
        group: Omit<Group, "id">;
        bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null;
      }
    | { ok: false; error: string }
  >(async (tx) => {
    const [roundSnap, groupSnap] = await Promise.all([tx.get(roundRef), tx.get(groupRef)]);
    if (!roundSnap.exists) return { ok: false, error: "not-found" };
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as Omit<Group, "id">;
    if (!canScratchFor(round, session.uid, input.cardUid)) {
      return { ok: false, error: "not-your-card" };
    }
    if (input.cardUid in round.revealed) {
      return { ok: true, pays: round.revealed[input.cardUid], round, group, bookedExpense: null };
    }
    if (round.status !== "running") return { ok: false, error: "round-not-running" };

    const pays = drawScratchCard(round, randomInt);
    const { bookedExpense } = applyReveals({
      tx,
      groupRef,
      group,
      roundRef,
      round,
      revealed: { ...round.revealed, [input.cardUid]: pays },
      revealedBy: { ...round.revealedBy, [input.cardUid]: session.uid },
      now: new Date().toISOString(),
      t,
    });
    return { ok: true, pays, round, group, bookedExpense };
  });

  if (!result.ok) return { ok: false, error: result.error };
  await afterFinish(input.groupId, result.group, groupRef, result.round, result.bookedExpense);
  return { ok: true, data: { pays: result.pays } };
}

/**
 * "Restliche Lose aufdecken": the round's creator (or a group manager)
 * scratches every card still under foil, so one player who never opens the
 * app can't hold the bill up. Each card is drawn exactly as if its owner had
 * scratched it — nobody's chances change.
 */
export async function revealRemainingCards(input: {
  groupId: string;
  roundId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { groupRef } = membership;
  const roundRef = groupRef.collection("luckRounds").doc(input.roundId);
  const t = await getServerT();

  const result = await adminDb.runTransaction<
    | {
        ok: true;
        round: RoundDoc;
        group: Omit<Group, "id">;
        bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null;
      }
    | { ok: false; error: string }
  >(async (tx) => {
    const [roundSnap, groupSnap] = await Promise.all([tx.get(roundRef), tx.get(groupRef)]);
    if (!roundSnap.exists) return { ok: false, error: "not-found" };
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as Omit<Group, "id">;
    if (round.status !== "running") return { ok: false, error: "round-not-running" };
    if (round.createdBy !== session.uid && !isGroupManager(group.members[session.uid]?.role)) {
      return { ok: false, error: "forbidden" };
    }

    const revealed = { ...round.revealed };
    const revealedBy = { ...round.revealedBy };
    for (const uid of unrevealedUids(round)) {
      revealed[uid] = drawScratchCard({ ...round, revealed }, randomInt);
      revealedBy[uid] = session.uid;
    }
    const { bookedExpense } = applyReveals({
      tx,
      groupRef,
      group,
      roundRef,
      round,
      revealed,
      revealedBy,
      now: new Date().toISOString(),
      t,
    });
    return { ok: true, round, group, bookedExpense };
  });

  if (!result.ok) return { ok: false, error: result.error };
  await afterFinish(input.groupId, result.group, groupRef, result.round, result.bookedExpense);
  return { ok: true, data: null };
}

/**
 * Calls a round off — only before anyone has scratched. After the first
 * card, cancelling would be a way to throw away a result you don't like;
 * "Restliche Lose aufdecken" is how a stuck round ends then.
 */
export async function cancelLuckRound(input: {
  groupId: string;
  roundId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { groupRef } = membership;
  const roundRef = groupRef.collection("luckRounds").doc(input.roundId);

  return adminDb.runTransaction<ActionResult<null>>(async (tx) => {
    const [roundSnap, groupSnap] = await Promise.all([tx.get(roundRef), tx.get(groupRef)]);
    if (!roundSnap.exists) return { ok: false, error: "not-found" };
    const round = roundSnap.data() as RoundDoc;
    const group = groupSnap.data() as Omit<Group, "id">;
    if (round.status !== "running") return { ok: false, error: "round-not-running" };
    if (round.createdBy !== session.uid && !isGroupManager(group.members[session.uid]?.role)) {
      return { ok: false, error: "forbidden" };
    }
    if (Object.keys(round.revealed).length > 0) return { ok: false, error: "cards-scratched" };

    const now = new Date().toISOString();
    tx.update(roundRef, {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: session.uid,
      updatedAt: now,
    });
    if (group.activeLuckRound?.id === roundRef.id) {
      tx.update(groupRef, { activeLuckRound: null });
    }
    return { ok: true, data: null };
  });
}
