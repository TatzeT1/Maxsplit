"use server";

import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { isDuelGameId } from "@/lib/games/duel-game-ids";
import { buildMemoryDeck } from "@/lib/games/memory-duel";
import {
  applyOnlineMove,
  initialLiveState,
  isOnlineMatch,
  nextAttempt,
  type LiveSecret,
  type OnlineMove,
} from "@/lib/games/online-match";
import { randomInt, secureShuffle } from "@/lib/games/random";
import { REACTION_MAX_DELAY_MS, REACTION_MIN_DELAY_MS } from "@/lib/games/reaction-duel";
import { getServerT } from "@/lib/i18n/server";
import { recomputeGroupBalances } from "@/lib/money/balance-cache";
import { buildGameExpense, validateGameExpenseDraft } from "@/lib/money/game-expense";
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

/**
 * Everything that has to happen in the *same* transaction as the result that
 * finishes a bracket: flip it to "finished", fix the payer list, and — when
 * the tournament carries an auto-book draft — write the expense itself, so a
 * finished game can never exist without its expense (or get booked twice by
 * two racing reports; the transaction serializes them). Returns whether an
 * expense was written, so the caller can refresh the balance cache after.
 */
function applyBracketUpdate(input: {
  tx: FirebaseFirestore.Transaction;
  tournamentRef: FirebaseFirestore.DocumentReference;
  groupRef: FirebaseFirestore.DocumentReference;
  group: Omit<Group, "id">;
  tournament: TournamentDoc;
  next: BracketUpdate;
  at: string;
}): { finished: boolean; booked: boolean } {
  const { tx, tournamentRef, groupRef, group, tournament, next, at } = input;
  const merged = { ...tournament, ...next };
  const finished = isBracketFinished(merged);
  const update: Record<string, unknown> = { matches: next.matches, updatedAt: at };
  let booked = false;

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
      const losersPresent = loserUids.every((uid) => uid in group.members);
      if (draftError || !losersPresent) {
        update.autoBookError = draftError ?? "member-left";
      } else {
        const expenseRef = groupRef.collection("expenses").doc();
        tx.set(
          expenseRef,
          buildGameExpense({ draft, loserUids, createdBy: tournament.createdBy, now: at }),
        );
        update.expenseId = expenseRef.id;
        booked = true;
      }
    }
  }

  tx.update(tournamentRef, update);
  return { finished, booked };
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
    if (!Number.isInteger(amountMinor) || amountMinor < 0 || description.length > 200) {
      return { ok: false, error: "invalid-stake" };
    }
  }

  const playMode: TournamentPlayMode = input.playMode === "online" ? "online" : "local";
  const autoBook = input.autoBook ?? null;
  if (autoBook) {
    const draftError = validateGameExpenseDraft(autoBook, group.members);
    if (draftError) return { ok: false, error: draftError };
    if (autoBook.currency !== group.currency) return { ok: false, error: "invalid-currency" };
  }

  const tournamentsRef = groupRef.collection("tournaments");
  const runningSnap = await tournamentsRef.where("status", "==", "running").limit(1).get();
  if (!runningSnap.empty) return { ok: false, error: "tournament-running" };

  const seedOrder = secureShuffle(poolUids);
  const bracket = createBracket(seedOrder, input.targetLoserCount);
  const now = new Date().toISOString();
  const entrants = Object.fromEntries(
    poolUids.map((uid) => [
      uid,
      {
        displayName: group.members[uid].displayName,
        isPlaceholder: group.members[uid].isPlaceholder === true,
      },
    ]),
  );

  const tournament: Omit<Tournament, "id"> = {
    gameId: input.gameId,
    status: "running",
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    entrants,
    seedOrder,
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
    playMode,
    autoBook: autoBook ? { ...autoBook, description: autoBook.description.trim() } : null,
    expenseId: null,
  };

  const docRef = tournamentsRef.doc();
  const batch = adminDb.batch();
  batch.set(docRef, tournament);

  // An online game needs the other side to *notice* it — there are no push
  // notifications, so the group chat is where the challenge lands. The text
  // is the fallback; the chat renders `gameInvite` as a join card.
  if (playMode === "online") {
    const t = await getServerT();
    const challenger = group.members[session.uid]?.displayName ?? "";
    const game = t(GAME_TITLE_KEY[input.gameId]);
    const stake = tournament.stake;
    const message: Omit<ChatMessage, "id"> = {
      senderUid: session.uid,
      text: stake
        ? t("chat.gameInviteTextStake", {
            name: challenger,
            game,
            stake: `${stake.description} · ${formatMoney(stake.amountMinor, stake.currency)}`,
          })
        : t("chat.gameInviteText", { name: challenger, game }),
      createdAt: now,
      gameInvite: { tournamentId: docRef.id, gameId: input.gameId },
    };
    batch.set(groupRef.collection("messages").doc(), message);
  }

  await batch.commit();
  return { ok: true, data: { tournamentId: docRef.id } };
}

const GAME_TITLE_KEY = {
  tictactoe: "expenses.ticTacToeTitle",
  connectfour: "expenses.connectFourTitle",
  memory: "expenses.memoryTitle",
  reaction: "expenses.reactionTitle",
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

  const result = await adminDb.runTransaction<
    { ok: true; finished: boolean; booked: boolean } | { ok: false; error: string }
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
    });
    return { ok: true, ...outcome };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.booked) await recomputeGroupBalances(membership.groupRef);
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

  const result = await adminDb.runTransaction<{ ok: true } | { ok: false; error: string }>(
    async (tx) => {
      const [snap, liveSnap] = await Promise.all([tx.get(tournamentRef), tx.get(liveRef)]);
      if (!snap.exists) return { ok: false, error: "not-found" };
      const tournament = snap.data() as TournamentDoc;
      const match = tournament.matches[input.matchId];
      if (!match) return { ok: false, error: "match-not-found" };
      if (!isOnlineMatch(tournament, match)) return { ok: false, error: "not-online" };
      if (!match.players.includes(session.uid)) return { ok: false, error: "not-a-player" };
      if (liveSnap.exists) return { ok: true };
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
      return { ok: true };
    },
  );

  if (!result.ok) return { ok: false, error: result.error };
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

  const result = await adminDb.runTransaction<
    { ok: true; version: number; booked: boolean } | { ok: false; error: string }
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

    if (outcome.kind === "continue") {
      tx.update(liveRef, { state: applied.state, version, updatedAt: at });
      return { ok: true, version, booked: false };
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
      return { ok: true, version, booked: false };
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
    const { booked } = applyBracketUpdate({
      tx,
      tournamentRef,
      groupRef: membership.groupRef,
      group: membership.group,
      tournament,
      next,
      at,
    });
    return { ok: true, version, booked };
  });

  if (!result.ok) return { ok: false, error: result.error };
  if (result.booked) await recomputeGroupBalances(membership.groupRef);
  return { ok: true, data: { version: result.version } };
}
