"use server";

import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { gameResultMessage } from "@/lib/chat/game-result";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { isDuelGameId } from "@/lib/games/duel-game-ids";
import { buildMemoryDeck } from "@/lib/games/memory-duel";
import { nudgeAllowedFrom, waitingOn } from "@/lib/games/nudge";
import { canRematch, rematchSeedOrder } from "@/lib/games/rematch";
import {
  applyOnlineMove,
  initialLiveState,
  isOnlineMatch,
  liveTurn,
  nextAttempt,
  type LiveSecret,
  type OnlineMove,
} from "@/lib/games/online-match";
import { randomInt, secureShuffle } from "@/lib/games/random";
import { REACTION_MAX_DELAY_MS, REACTION_MIN_DELAY_MS } from "@/lib/games/reaction-duel";
import { isRpsHand } from "@/lib/games/rock-paper-scissors";
import { getServerT } from "@/lib/i18n/server";
import { MAX_DESCRIPTION_LENGTH, isIsoDate } from "@/lib/ledger-input";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { buildGameExpense, validateGameExpenseDraft } from "@/lib/money/game-expense";
import { pushReach } from "@/lib/push/deliver";
import {
  challengePushes,
  expensePushes,
  newlyReadyMatches,
  nudgePush,
  turnPush,
} from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import { presenceRef } from "@/lib/push/store";
import type { PendingPush } from "@/lib/push/types";
import {
  MAX_TOURNAMENT_ENTRANTS,
  bracketLoserUids,
  claimMatch,
  createBracket,
  isBracketFinished,
  maxTournamentLoserCount,
  recordMatchResult,
  releaseMatch,
} from "@/lib/games/tournament-bracket";
import type {
  ChatMessage,
  DuelGameId,
  Expense,
  GameExpenseDraft,
  Group,
  LiveMatch,
  Tournament,
  TournamentPlayMode,
} from "@/lib/types";
import type { ActionResult } from "./groups";

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

type TournamentDoc = Omit<Tournament, "id">;
type BracketUpdate = Pick<TournamentDoc, "matches">;
type ServerT = Awaited<ReturnType<typeof getServerT>>;

/**
 * Everything that has to happen in the *same* transaction as the result that
 * finishes a bracket: flip it to "finished", fix the payer list, and — when
 * the tournament carries an auto-book draft — write the expense itself, so a
 * finished game can never exist without its expense (or get booked twice by
 * two racing reports; the transaction serializes them). Returns whether an
 * expense was written, so the caller can refresh the balance cache after.
 * A finished game also tells the group chat how it ended (`gameResult`).
 */
function applyBracketUpdate(input: {
  tx: FirebaseFirestore.Transaction;
  tournamentRef: FirebaseFirestore.DocumentReference;
  groupRef: FirebaseFirestore.DocumentReference;
  group: Omit<Group, "id">;
  tournament: TournamentDoc;
  next: BracketUpdate;
  at: string;
  t: ServerT;
}): {
  finished: boolean;
  booked: boolean;
  bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null;
} {
  const { tx, tournamentRef, groupRef, group, tournament, next, at, t } = input;
  const merged = { ...tournament, ...next };
  const finished = isBracketFinished(merged);
  const update: Record<string, unknown> = { matches: next.matches, updatedAt: at };
  let booked = false;
  let bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null = null;

  if (finished) {
    const loserUids = bracketLoserUids(merged);
    update.status = "finished";
    update.finishedAt = at;
    update.loserUids = loserUids;

    const draft = tournament.autoBook;
    if (draft && !tournament.expenseId) {
      // Re-checked at finish, not just at start: someone may have left the
      // group (or the payer been removed) while the tournament ran.
      const draftError = validateGameExpenseDraft(draft, group.members);
      // A stake game pays the winner: exactly one entrant is left standing.
      const winnerUids = Object.keys(merged.entrants).filter((uid) => !loserUids.includes(uid));
      const winnerUid = winnerUids.length === 1 ? winnerUids[0] : undefined;
      const winnerMissing = draft.payerIsWinner && (!winnerUid || !(winnerUid in group.members));
      const losersPresent = loserUids.every((uid) => uid in group.members);
      if (draftError || !losersPresent || winnerMissing) {
        update.autoBookError = draftError ?? "member-left";
      } else {
        const expenseRef = groupRef.collection("expenses").doc();
        const expense = buildGameExpense({
          draft,
          loserUids,
          winnerUid,
          // A server-run game can't be reshuffled: always the first attempt.
          game: { gameId: tournament.gameId, playerUids: Object.keys(merged.entrants), attempt: 1 },
          createdBy: tournament.createdBy,
          now: at,
        });
        tx.set(expenseRef, expense);
        update.expenseId = expenseRef.id;
        booked = true;
        bookedExpense = { id: expenseRef.id, expense };
      }
    }

    // The result card for the group chat. It names the amount only when it
    // really is owed: not after a failed auto-booking, not for a free game.
    const winnerUids = Object.keys(merged.entrants).filter((uid) => !loserUids.includes(uid));
    const stake = tournament.stake;
    const amountOwed = stake && stake.amountMinor > 0 && !update.autoBookError ? stake : null;
    tx.set(
      groupRef.collection("messages").doc(),
      gameResultMessage({
        t,
        senderUid: tournament.createdBy,
        nameOf: (uid) => entrantName(group, merged, uid) || "?",
        now: at,
        result: {
          gameId: tournament.gameId,
          loserUids,
          winnerUid: winnerUids.length === 1 ? winnerUids[0] : null,
          amount: amountOwed
            ? {
                description: amountOwed.description,
                amountMinor: amountOwed.amountMinor,
                currency: amountOwed.currency,
              }
            : null,
          attempt: 1,
          tournamentId: tournamentRef.id,
        },
      }),
    );
  }

  tx.update(tournamentRef, update);
  return { finished, booked, bookedExpense };
}

function entrantName(
  group: Omit<Group, "id">,
  tournament: Pick<TournamentDoc, "entrants">,
  uid: string,
): string {
  return group.members[uid]?.displayName ?? tournament.entrants[uid]?.displayName ?? "";
}

/**
 * The pushes a bracket update causes: "Du bist dran" to both players of every
 * online match it just made playable, and "Neue Ausgabe" when it booked the
 * stake — for everyone the expense touches who wasn't playing (the players
 * watched the result happen).
 */
function bracketPushes(input: {
  groupId: string;
  group: Omit<Group, "id">;
  tournamentId: string;
  before: TournamentDoc;
  next: BracketUpdate;
  bookedExpense: { id: string; expense: Omit<Expense, "id"> } | null;
}): PendingPush[] {
  const { groupId, group, tournamentId, before } = input;
  const after = { ...before, ...input.next };
  const pushes: PendingPush[] = [];
  for (const match of newlyReadyMatches(before.matches, after.matches)) {
    if (!isOnlineMatch(after, match)) continue;
    const [first, second] = match.players as [string, string];
    for (const [uid, opponent] of [
      [first, second],
      [second, first],
    ]) {
      pushes.push(
        turnPush({
          uid,
          opponentName: entrantName(group, after, opponent),
          reason: "ready",
          groupId,
          group,
          tournamentId,
          matchId: match.id,
          gameId: after.gameId,
        }),
      );
    }
  }
  if (input.bookedExpense) {
    pushes.push(
      ...expensePushes({
        groupId,
        group,
        expenseId: input.bookedExpense.id,
        expense: input.bookedExpense.expense,
        origin: "game",
        actorUid: null,
        skip: Object.keys(after.entrants),
      }),
    );
  }
  return pushes;
}

/** Untrusted client input → a well-formed move, or `null`. The rules engine validates the rest. */
function parseOnlineMove(raw: unknown): OnlineMove | null {
  if (typeof raw !== "object" || raw === null) return null;
  const move = raw as Record<string, unknown>;
  switch (move.kind) {
    case "cell":
      return typeof move.index === "number" ? { kind: "cell", index: move.index } : null;
    case "column":
      return typeof move.column === "number" ? { kind: "column", column: move.column } : null;
    case "flip":
      return typeof move.index === "number" ? { kind: "flip", index: move.index } : null;
    case "pick":
      return isRpsHand(move.hand) ? { kind: "pick", hand: move.hand } : null;
    case "take":
      return typeof move.row === "number" && typeof move.count === "number"
        ? { kind: "take", row: move.row, count: move.count, late: move.late === true }
        : null;
    case "skip":
      return { kind: "skip" };
    case "line":
      return typeof move.index === "number" ? { kind: "line", index: move.index } : null;
    case "ready":
      return { kind: "ready" };
    case "forfeit":
      return { kind: "forfeit" };
    case "reaction": {
      const report = move.report as Record<string, unknown> | undefined;
      if (report?.kind === "falseStart")
        return { kind: "reaction", report: { kind: "falseStart" } };
      if (report?.kind === "time" && typeof report.ms === "number") {
        return { kind: "reaction", report: { kind: "time", ms: report.ms } };
      }
      return null;
    }
    default:
      return null;
  }
}

function drawSignalDelay(): number {
  return randomInt(REACTION_MIN_DELAY_MS, REACTION_MAX_DELAY_MS);
}

function freshDeck(gameId: DuelGameId): string[] | undefined {
  return gameId === "memory" ? buildMemoryDeck().map((card) => card.face) : undefined;
}

/**
 * Starts a new tournament bracket. The server draws the pairing order
 * (`secureShuffle`), never the client — a modified client reporting its own
 * shuffle could otherwise pick its own matchups. At most one tournament may
 * be `running` per group at a time, so the group's banner/route never has to
 * pick which one to show.
 */
export async function createTournament(input: {
  groupId: string;
  gameId: DuelGameId;
  poolUids: string[];
  targetLoserCount: number;
  stake: { description: string; amountMinor: number; currency: string } | null;
  /** Absent = "local", the original one-phone-per-match flow. */
  playMode?: TournamentPlayMode;
  /** The expense to book automatically once the result is in; `null` = apply it by hand. */
  autoBook?: GameExpenseDraft | null;
}): Promise<ActionResult<{ tournamentId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  if (!isDuelGameId(input.gameId)) return { ok: false, error: "invalid-game" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const poolUids = [...new Set(input.poolUids)];
  if (
    poolUids.length < 2 ||
    poolUids.length > MAX_TOURNAMENT_ENTRANTS ||
    poolUids.some((uid) => !group.members[uid])
  ) {
    return { ok: false, error: "invalid-pool" };
  }

  const maxLoserCount = maxTournamentLoserCount(poolUids.length);
  if (
    !Number.isInteger(input.targetLoserCount) ||
    input.targetLoserCount < 1 ||
    input.targetLoserCount > maxLoserCount
  ) {
    return { ok: false, error: "invalid-count" };
  }

  if (input.stake) {
    const { amountMinor, description } = input.stake;
    if (
      !Number.isInteger(amountMinor) ||
      amountMinor < 0 ||
      description.length > MAX_DESCRIPTION_LENGTH
    ) {
      return { ok: false, error: "invalid-stake" };
    }
  }

  const playMode: TournamentPlayMode = input.playMode === "online" ? "online" : "local";
  const autoBook = input.autoBook ?? null;
  if (autoBook) {
    const draftError = validateGameExpenseDraft(autoBook, group.members);
    if (draftError) return { ok: false, error: draftError };
    if (autoBook.currency !== group.currency) return { ok: false, error: "invalid-currency" };
    // "Winner takes the stake" needs one winner: play until everyone else has lost.
    if (autoBook.payerIsWinner && input.targetLoserCount !== poolUids.length - 1) {
      return { ok: false, error: "invalid-count" };
    }
  }

  const tournamentsRef = groupRef.collection("tournaments");
  const runningSnap = await tournamentsRef.where("status", "==", "running").limit(1).get();
  if (!runningSnap.empty) return { ok: false, error: "tournament-running" };

  const now = new Date().toISOString();
  const tournament = newTournamentDoc({
    group,
    createdBy: session.uid,
    gameId: input.gameId,
    seedOrder: secureShuffle(poolUids),
    targetLoserCount: input.targetLoserCount,
    stake: input.stake,
    playMode,
    autoBook,
    now,
  });

  const docRef = tournamentsRef.doc();
  const batch = adminDb.batch();
  batch.set(docRef, tournament);

  // An online game needs the other side to *notice* it. Whoever turned push
  // on gets a "Herausforderung" (below, after the commit); the group chat is
  // where it lands for everyone else. The text is the fallback; the chat
  // renders `gameInvite` as a join card.
  if (playMode === "online") {
    batch.set(
      groupRef.collection("messages").doc(),
      inviteMessage({
        t: await getServerT(),
        group,
        challengerUid: session.uid,
        tournament,
        tournamentId: docRef.id,
        rematch: false,
      }),
    );
  }

  await batch.commit();
  if (playMode === "online") {
    notifyAfterResponse(
      challengePushes({
        groupId: input.groupId,
        group,
        tournamentId: docRef.id,
        gameId: input.gameId,
        stake: tournament.stake,
        poolUids,
        actorUid: session.uid,
      }),
    );
  }
  return { ok: true, data: { tournamentId: docRef.id } };
}

/**
 * A new tournament document, built the same way for a fresh game and a
 * rematch: the bracket from a server-drawn seed order, a name snapshot of
 * the entrants, and the stake shown on the game (the auto-book draft's, when
 * there is one).
 */
function newTournamentDoc(input: {
  group: Omit<Group, "id">;
  createdBy: string;
  gameId: DuelGameId;
  seedOrder: string[];
  targetLoserCount: number;
  stake: TournamentDoc["stake"];
  playMode: TournamentPlayMode;
  autoBook: GameExpenseDraft | null;
  now: string;
}): TournamentDoc {
  const { group, autoBook, now } = input;
  const bracket = createBracket(input.seedOrder, input.targetLoserCount);
  return {
    gameId: input.gameId,
    status: "running",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    entrants: Object.fromEntries(
      input.seedOrder.map((uid) => [
        uid,
        {
          displayName: group.members[uid].displayName,
          isPlaceholder: group.members[uid].isPlaceholder === true,
        },
      ]),
    ),
    seedOrder: input.seedOrder,
    targetLoserCount: input.targetLoserCount,
    advance: bracket.advance,
    trees: bracket.trees,
    matches: bracket.matches,
    loserUids: null,
    stake: autoBook
      ? {
          description: autoBook.description.trim(),
          amountMinor: autoBook.amountMinor,
          currency: autoBook.currency,
        }
      : input.stake,
    playMode: input.playMode,
    autoBook: autoBook ? { ...autoBook, description: autoBook.description.trim() } : null,
    expenseId: null,
  };
}

/** The chat's join card for an online game — "X fordert euch heraus", or for a rematch "X will Revanche". */
function inviteMessage(input: {
  t: ServerT;
  group: Omit<Group, "id">;
  challengerUid: string;
  tournament: TournamentDoc;
  tournamentId: string;
  rematch: boolean;
}): Omit<ChatMessage, "id"> {
  const { t, group, challengerUid, tournament, tournamentId, rematch } = input;
  const name = group.members[challengerUid]?.displayName ?? "";
  const game = t(GAME_TITLE_KEY[tournament.gameId]);
  const stake = tournament.stake;
  const stakeText = stake
    ? `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`
    : "";
  return {
    senderUid: challengerUid,
    text: rematch
      ? stake
        ? t("chat.gameRematchTextStake", { name, game, stake: stakeText })
        : t("chat.gameRematchText", { name, game })
      : stake
        ? t("chat.gameInviteTextStake", { name, game, stake: stakeText })
        : t("chat.gameInviteText", { name, game }),
    createdAt: tournament.createdAt,
    gameInvite: { tournamentId, gameId: tournament.gameId },
  };
}

/**
 * "Revanche": the same game, the same people, the same stake, started from a
 * finished online game by one of its players. In a duel the loser opens the
 * rematch; a bigger bracket is drawn afresh. Idempotent — the new game's id
 * is stored on the old one (`rematchId`), so when both players tap
 * "Revanche" the second simply joins the first one's game.
 */
export async function createRematch(input: {
  groupId: string;
  tournamentId: string;
  /** Today, from the player's phone — the day a stake game is booked on. */
  date: string;
}): Promise<ActionResult<{ tournamentId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (!isIsoDate(input.date)) return { ok: false, error: "invalid-date" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const tournamentsRef = groupRef.collection("tournaments");
  const oldRef = tournamentsRef.doc(input.tournamentId);
  const newRef = tournamentsRef.doc();
  const t = await getServerT();
  const now = new Date().toISOString();

  const result = await adminDb.runTransaction<
    | { ok: true; tournamentId: string; created: TournamentDoc | null; poolUids: string[] }
    | { ok: false; error: string }
  >(async (tx) => {
    const oldSnap = await tx.get(oldRef);
    if (!oldSnap.exists) return { ok: false, error: "not-found" };
    const old = oldSnap.data() as TournamentDoc;
    if (!(session.uid in old.entrants)) return { ok: false, error: "not-a-player" };
    if (old.rematchId) {
      return { ok: true, tournamentId: old.rematchId, created: null, poolUids: [] };
    }
    if (!canRematch(old)) return { ok: false, error: "rematch-unavailable" };

    const runningSnap = await tx.get(tournamentsRef.where("status", "==", "running").limit(1));
    if (!runningSnap.empty) return { ok: false, error: "tournament-running" };

    // Everyone again — as long as they're still here with an account.
    const poolUids = Object.keys(old.entrants).filter(
      (uid) => group.memberUids.includes(uid) && group.members[uid]?.isPlaceholder !== true,
    );
    if (poolUids.length !== Object.keys(old.entrants).length || poolUids.length < 2) {
      return { ok: false, error: "member-left" };
    }

    const seedOrder = rematchSeedOrder(poolUids, old.loserUids ?? []) ?? secureShuffle(poolUids);
    const autoBook = old.autoBook ? { ...old.autoBook, date: input.date } : null;
    const created = newTournamentDoc({
      group,
      createdBy: session.uid,
      gameId: old.gameId,
      seedOrder,
      targetLoserCount: old.targetLoserCount,
      stake: old.stake,
      playMode: "online",
      autoBook,
      now,
    });
    tx.set(newRef, created);
    tx.update(oldRef, { rematchId: newRef.id, updatedAt: now });
    tx.set(
      groupRef.collection("messages").doc(),
      inviteMessage({
        t,
        group,
        challengerUid: session.uid,
        tournament: created,
        tournamentId: newRef.id,
        rematch: true,
      }),
    );
    return { ok: true, tournamentId: newRef.id, created, poolUids };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.created) {
    notifyAfterResponse(
      challengePushes({
        groupId: input.groupId,
        group,
        tournamentId: result.tournamentId,
        gameId: result.created.gameId,
        stake: result.created.stake,
        poolUids: result.poolUids,
        actorUid: session.uid,
      }),
    );
  }
  return { ok: true, data: { tournamentId: result.tournamentId } };
}

const GAME_TITLE_KEY = {
  tictactoe: "expenses.ticTacToeTitle",
  connectfour: "expenses.connectFourTitle",
  memory: "expenses.memoryTitle",
  reaction: "expenses.reactionTitle",
  rps: "expenses.rpsTitle",
  nim: "expenses.nimTitle",
  dots: "expenses.dotsTitle",
} as const satisfies Record<DuelGameId, string>;

/**
 * A device claims a ready match to play it. `takeover` reissues a fresh
 * `claimId` for a match another (unresponsive) device already holds — the
 * one mechanism behind "that phone's tab is closed" and "stuck match".
 */
export async function claimTournamentMatch(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
  takeover?: boolean;
}): Promise<ActionResult<{ claimId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);
  const claimId = randomUUID();
  const claimedAt = new Date().toISOString();

  const result = await adminDb.runTransaction<{ ok: true } | { ok: false; error: string }>(
    async (tx) => {
      const snap = await tx.get(tournamentRef);
      if (!snap.exists) return { ok: false, error: "not-found" };
      const tournament = snap.data() as Omit<Tournament, "id">;
      if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };
      // An online match is played on its two players' own phones, move by
      // move — nobody else's phone may "host" (or take it over).
      const target = tournament.matches[input.matchId];
      if (target && isOnlineMatch(tournament, target)) return { ok: false, error: "online-match" };

      const next = claimMatch(
        tournament,
        input.matchId,
        { byUid: session.uid, claimId, claimedAt },
        { takeover: input.takeover === true },
      );
      if ("error" in next) return { ok: false, error: next.error };

      tx.update(tournamentRef, { matches: next.matches, updatedAt: claimedAt });
      return { ok: true };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: { claimId } };
}

/** "Doch nicht hier spielen" — hands a claimed match back to `ready` without playing it. */
export async function releaseTournamentMatch(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
  claimId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);

  const result = await adminDb.runTransaction<{ ok: true } | { ok: false; error: string }>(
    async (tx) => {
      const snap = await tx.get(tournamentRef);
      if (!snap.exists) return { ok: false, error: "not-found" };
      const tournament = snap.data() as Omit<Tournament, "id">;

      const next = releaseMatch(tournament, input.matchId, input.claimId);
      if ("error" in next) return { ok: false, error: next.error };

      tx.update(tournamentRef, { matches: next.matches, updatedAt: new Date().toISOString() });
      return { ok: true };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, data: null };
}

/**
 * Reports the device-local winner of a claimed match. The bracket's
 * advancement and finish detection happen here, server-side, from the pure
 * `tournament-bracket.ts` engine — the client never gets to say who advances,
 * only who won the match it was holding.
 */
export async function reportTournamentMatchResult(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
  claimId: string;
  winnerUid: string;
  attempts: number;
}): Promise<ActionResult<{ tournamentFinished: boolean }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  if (!Number.isInteger(input.attempts) || input.attempts < 1 || input.attempts > 50) {
    return { ok: false, error: "invalid-attempts" };
  }

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);
  const at = new Date().toISOString();
  const t = await getServerT();

  const result = await adminDb.runTransaction<
    | { ok: true; finished: boolean; booked: boolean; pushes: PendingPush[] }
    | { ok: false; error: string }
  >(async (tx) => {
    const snap = await tx.get(tournamentRef);
    if (!snap.exists) return { ok: false, error: "not-found" };
    const tournament = snap.data() as Omit<Tournament, "id">;
    if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };
    // Only the board decides an online match (see playOnlineMove) — a bare
    // "X won" report would let either player skip the actual game.
    const target = tournament.matches[input.matchId];
    if (target && isOnlineMatch(tournament, target)) return { ok: false, error: "online-match" };

    const next = recordMatchResult(tournament, input.matchId, {
      claimId: input.claimId,
      winnerUid: input.winnerUid,
      attempts: input.attempts,
      reportedBy: session.uid,
      at,
    });
    if ("error" in next) return { ok: false, error: next.error };

    const outcome = applyBracketUpdate({
      tx,
      tournamentRef,
      groupRef: membership.groupRef,
      group: membership.group,
      tournament,
      next,
      at,
      t,
    });
    const pushes = bracketPushes({
      groupId: input.groupId,
      group: membership.group,
      tournamentId: input.tournamentId,
      before: tournament,
      next,
      bookedExpense: outcome.bookedExpense,
    });
    return { ok: true, finished: outcome.finished, booked: outcome.booked, pushes };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.booked) await recomputeGroupBalances(membership.groupRef);
  notifyAfterResponse(result.pushes);
  return { ok: true, data: { tournamentFinished: result.finished } };
}

/** The creator or a group manager can cancel a running tournament — no result is recorded. */
export async function cancelTournament(input: {
  groupId: string;
  tournamentId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);
  const snap = await tournamentRef.get();
  if (!snap.exists) return { ok: false, error: "not-found" };
  const tournament = snap.data() as Omit<Tournament, "id">;

  const role = membership.group.members[session.uid]?.role;
  if (tournament.createdBy !== session.uid && !isGroupManager(role)) {
    return { ok: false, error: "not-creator" };
  }
  if (tournament.status !== "running") return { ok: false, error: "already-finished" };

  const now = new Date().toISOString();
  await tournamentRef.update({
    status: "cancelled",
    cancelledAt: now,
    cancelledBy: session.uid,
    updatedAt: now,
  });
  return { ok: true, data: null };
}

/**
 * Opens one online match's live board — idempotent, so both players' phones
 * can call it on arrival and whoever's first creates it. Claims the bracket
 * match in the same transaction (so it reads "läuft" for everyone) and, for
 * memory, deals the hidden deck into `liveSecrets`, which no client can read.
 */
export async function openOnlineMatch(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);
  const liveRef = tournamentRef.collection("liveMatches").doc(input.matchId);
  const secretRef = tournamentRef.collection("liveSecrets").doc(input.matchId);

  const result = await adminDb.runTransaction<
    { ok: true; push: PendingPush | null } | { ok: false; error: string }
  >(async (tx) => {
    const [snap, liveSnap] = await Promise.all([tx.get(tournamentRef), tx.get(liveRef)]);
    if (!snap.exists) return { ok: false, error: "not-found" };
    const tournament = snap.data() as TournamentDoc;
    const match = tournament.matches[input.matchId];
    if (!match) return { ok: false, error: "match-not-found" };
    if (!isOnlineMatch(tournament, match)) return { ok: false, error: "not-online" };
    if (!match.players.includes(session.uid)) return { ok: false, error: "not-a-player" };
    if (liveSnap.exists) return { ok: true, push: null };
    if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };

    const at = new Date().toISOString();
    const claimed = claimMatch(
      tournament,
      input.matchId,
      { byUid: session.uid, claimId: randomUUID(), claimedAt: at },
      { takeover: false },
    );
    if ("error" in claimed) return { ok: false, error: claimed.error };

    const { state, secret } = initialLiveState(tournament.gameId, freshDeck(tournament.gameId));
    const live: Omit<LiveMatch, "id"> = {
      gameId: tournament.gameId,
      players: match.players as [string, string],
      attempt: 0,
      state,
      version: 0,
      lastDrawAt: null,
      winnerUid: null,
      finish: null,
      updatedAt: at,
    };
    tx.update(tournamentRef, { matches: claimed.matches, updatedAt: at });
    tx.set(liveRef, live);
    if (secret) tx.set(secretRef, secret);

    // The board is up and this player is at it: the other one gets a
    // "Dein Match wartet" — unless they're already watching.
    const opponent = match.players.find((uid) => uid !== session.uid) as string;
    const push = turnPush({
      uid: opponent,
      opponentName: entrantName(membership.group, tournament, session.uid),
      reason: "ready",
      groupId: input.groupId,
      group: membership.group,
      tournamentId: input.tournamentId,
      matchId: input.matchId,
      gameId: tournament.gameId,
    });
    return { ok: true, push };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.push) notifyAfterResponse([result.push]);
  return { ok: true, data: null };
}

/**
 * One move in an online match, validated server-side by the same pure rules
 * the one-phone boards use (`applyOnlineMove`). A draw replays in place with
 * the players swapped; a win records the bracket result — and books the
 * expense if this was the last match — in the same transaction as the move.
 */
export async function playOnlineMove(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
  move: OnlineMove;
}): Promise<ActionResult<{ version: number }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const move = parseOnlineMove(input.move);
  if (!move) return { ok: false, error: "invalid-move" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const tournamentRef = membership.groupRef.collection("tournaments").doc(input.tournamentId);
  const liveRef = tournamentRef.collection("liveMatches").doc(input.matchId);
  const secretRef = tournamentRef.collection("liveSecrets").doc(input.matchId);
  // The move that decides the game also posts its result to the chat.
  const t = await getServerT();

  const result = await adminDb.runTransaction<
    | { ok: true; version: number; booked: boolean; pushes: PendingPush[] }
    | { ok: false; error: string }
  >(async (tx) => {
    const [snap, liveSnap, secretSnap] = await Promise.all([
      tx.get(tournamentRef),
      tx.get(liveRef),
      tx.get(secretRef),
    ]);
    if (!snap.exists || !liveSnap.exists) return { ok: false, error: "not-found" };
    const tournament = snap.data() as TournamentDoc;
    if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };
    const live = liveSnap.data() as Omit<LiveMatch, "id">;
    const secret = secretSnap.exists ? (secretSnap.data() as LiveSecret) : null;

    const player = live.players.indexOf(session.uid);
    if (player === -1) return { ok: false, error: "not-a-player" };

    const applied = applyOnlineMove({
      live,
      secret,
      player: player as 0 | 1,
      move,
      drawSignalDelay,
    });
    if ("error" in applied) return { ok: false, error: applied.error };

    const at = new Date().toISOString();
    const version = live.version + 1;
    const { outcome } = applied;

    // "Du bist dran" for whoever moves next, when that's now the other
    // player — a found memory pair keeps the turn, the reaction duel has none.
    const handOver = (state: LiveMatch["state"], players: readonly string[]): PendingPush[] => {
      const turn = liveTurn(state);
      const nextUid = turn === null ? null : players[turn];
      if (!nextUid || nextUid === session.uid) return [];
      return [
        turnPush({
          uid: nextUid,
          opponentName: entrantName(membership.group, tournament, session.uid),
          reason: "move",
          groupId: input.groupId,
          group: membership.group,
          tournamentId: input.tournamentId,
          matchId: input.matchId,
          gameId: tournament.gameId,
        }),
      ];
    };

    // A move that changes the match's hidden state (a locked-in or revealed
    // Schnick-Schnack-Schnuck hand) is stored in the same transaction.
    if (applied.secret) tx.set(secretRef, applied.secret);

    if (outcome.kind === "continue") {
      tx.update(liveRef, { state: applied.state, version, updatedAt: at });
      return { ok: true, version, booked: false, pushes: handOver(applied.state, live.players) };
    }

    if (outcome.kind === "draw") {
      const replay = nextAttempt(live, freshDeck(live.gameId));
      tx.update(liveRef, {
        players: replay.players,
        attempt: replay.attempt,
        state: replay.state,
        version,
        lastDrawAt: at,
        updatedAt: at,
      });
      if (replay.secret) tx.set(secretRef, replay.secret);
      return {
        ok: true,
        version,
        booked: false,
        pushes: handOver(replay.state, replay.players),
      };
    }

    const winnerUid = live.players[outcome.player];
    const match = tournament.matches[input.matchId];
    const claimId = match?.claim?.claimId;
    if (!claimId) return { ok: false, error: "claim-lost" };
    const next = recordMatchResult(tournament, input.matchId, {
      claimId,
      winnerUid,
      attempts: live.attempt + 1,
      reportedBy: session.uid,
      at,
    });
    if ("error" in next) return { ok: false, error: next.error };

    tx.update(liveRef, {
      state: applied.state,
      version,
      winnerUid,
      finish: { reason: outcome.reason, at },
      updatedAt: at,
    });
    const { booked, bookedExpense } = applyBracketUpdate({
      tx,
      tournamentRef,
      groupRef: membership.groupRef,
      group: membership.group,
      tournament,
      next,
      at,
      t,
    });
    const pushes = bracketPushes({
      groupId: input.groupId,
      group: membership.group,
      tournamentId: input.tournamentId,
      before: tournament,
      next,
      bookedExpense,
    });
    return { ok: true, version, booked, pushes };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.booked) await recomputeGroupBalances(membership.groupRef);
  notifyAfterResponse(result.pushes);
  return { ok: true, data: { version: result.version } };
}

/**
 * "Anstupsen": the player an online match has been waiting on for a while
 * gets a fresh "Du bist dran" from the one waiting. Allowed once the board
 * has stood still for `NUDGE_AFTER_MS`, then once per `NUDGE_COOLDOWN_MS`
 * (`nudges/{matchId}`, server-only like `presence`). Returns whether the
 * push can reach them, so the waiting player knows to try WhatsApp instead:
 * `"watching"` (they're looking at the game already) or `"off"`.
 */
export async function nudgeOpponent(input: {
  groupId: string;
  tournamentId: string;
  matchId: string;
}): Promise<ActionResult<{ reach: "push" | "watching" | "off" }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;

  const tournamentRef = groupRef.collection("tournaments").doc(input.tournamentId);
  const liveRef = tournamentRef.collection("liveMatches").doc(input.matchId);
  const nudgeRef = tournamentRef.collection("nudges").doc(input.matchId);

  const result = await adminDb.runTransaction<
    { ok: true; targetUid: string; gameId: DuelGameId; at: string } | { ok: false; error: string }
  >(async (tx) => {
    const [tournamentSnap, liveSnap, nudgeSnap] = await Promise.all([
      tx.get(tournamentRef),
      tx.get(liveRef),
      tx.get(nudgeRef),
    ]);
    if (!tournamentSnap.exists || !liveSnap.exists) return { ok: false, error: "not-found" };
    const tournament = tournamentSnap.data() as TournamentDoc;
    if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };
    const live = liveSnap.data() as Omit<LiveMatch, "id">;
    if (live.winnerUid !== null) return { ok: false, error: "match-finished" };
    const me = live.players.indexOf(session.uid);
    if (me !== 0 && me !== 1) return { ok: false, error: "not-a-player" };
    const waited = waitingOn(live.state, me);
    if (waited === null) return { ok: false, error: "not-waiting" };

    const now = Date.now();
    const lastNudgeAt = nudgeSnap.exists ? (nudgeSnap.get("at") as string) : null;
    if (now < nudgeAllowedFrom(live.updatedAt, lastNudgeAt)) {
      return { ok: false, error: "too-early" };
    }
    const at = new Date(now).toISOString();
    tx.set(nudgeRef, { at, byUid: session.uid });
    return { ok: true, targetUid: live.players[waited], gameId: tournament.gameId, at };
  });
  if (!result.ok) return { ok: false, error: result.error };

  const where = { groupId: input.groupId, tournamentId: input.tournamentId };
  const reach = await pushReach(result.targetUid, "turn", where);
  if (reach === "push") {
    notifyAfterResponse([
      nudgePush({
        uid: result.targetUid,
        byName: group.members[session.uid]?.displayName ?? "",
        groupId: input.groupId,
        group,
        tournamentId: input.tournamentId,
        matchId: input.matchId,
        gameId: result.gameId,
        at: result.at,
      }),
    ]);
  }
  return { ok: true, data: { reach } };
}

/**
 * "I'm looking at this game": the tournament page and the group page's game
 * banner send this every 20 seconds while visible — and `watching: false`
 * when hidden or left — so a "Du bist dran" push skips a player who's
 * already watching (lib/push/deliver.ts). Only the server reads it.
 */
export async function markTournamentPresence(input: {
  groupId: string;
  tournamentId: string;
  watching: boolean;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (
    typeof input.tournamentId !== "string" ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.tournamentId)
  ) {
    return { ok: false, error: "not-found" };
  }

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const ref = presenceRef(input.groupId, input.tournamentId, session.uid);
  if (input.watching) await ref.set({ at: new Date().toISOString() });
  else await ref.delete();
  return { ok: true, data: null };
}
