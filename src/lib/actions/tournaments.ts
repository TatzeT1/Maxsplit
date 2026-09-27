"use server";

import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";
import { isGroupManager } from "@/lib/groups/permissions";
import { isDuelGameId } from "@/lib/games/duel-game-ids";
import { secureShuffle } from "@/lib/games/random";
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
import type { DuelGameId, Group, Tournament } from "@/lib/types";
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
    stake: input.stake,
  };

  const docRef = await tournamentsRef.add(tournament);
  return { ok: true, data: { tournamentId: docRef.id } };
}

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
    { ok: true; finished: boolean } | { ok: false; error: string }
  >(async (tx) => {
    const snap = await tx.get(tournamentRef);
    if (!snap.exists) return { ok: false, error: "not-found" };
    const tournament = snap.data() as Omit<Tournament, "id">;
    if (tournament.status !== "running") return { ok: false, error: "tournament-not-running" };

    const next = recordMatchResult(tournament, input.matchId, {
      claimId: input.claimId,
      winnerUid: input.winnerUid,
      attempts: input.attempts,
      reportedBy: session.uid,
      at,
    });
    if ("error" in next) return { ok: false, error: next.error };

    const finished = isBracketFinished(next);
    const update: Record<string, unknown> = { matches: next.matches, updatedAt: at };
    if (finished) {
      update.status = "finished";
      update.finishedAt = at;
      update.loserUids = bracketLoserUids(next);
    }
    tx.update(tournamentRef, update);
    return { ok: true, finished };
  });

  if (!result.ok) return { ok: false, error: result.error };
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
