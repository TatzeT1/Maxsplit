"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useEffectEvent, useState } from "react";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useNow } from "@/lib/use-now";
import type { EstimateRound } from "@/lib/types";

export interface EstimateRoundState {
  round: EstimateRound | null;
  /** The listener failed (its Firestore code). Its own state — never folded into "still loading" (AGENTS.md). */
  errorCode: string | null;
  /** The server answered and the document does not exist. */
  missing: boolean;
  /**
   * Firestore answered from the local cache and has no copy of the document:
   * a round never opened on this device while the connection is down (or
   * lie-fi). That is NOT "missing" — the server has not been asked yet.
   */
  cachedEmpty: boolean;
  /** The latest snapshot came from the cache. */
  fromCache: boolean;
  /** A first snapshot has arrived (cached or live, with or without the document). */
  received: boolean;
}

const INITIAL: EstimateRoundState = {
  round: null,
  errorCode: null,
  missing: false,
  cachedEmpty: false,
  fromCache: false,
  received: false,
};

/**
 * One online estimate round, live: `useLuckRound` plus the snapshot metadata,
 * so a screen can tell "the server says there is no such round" from "this
 * device has no copy and cannot ask" (`cachedEmpty`) from "still waiting for a
 * first answer" (`!received`). Gated on a signed-in user.
 *
 * `onSnapshotMetadata` is called with every snapshot (a screen feeds
 * `useLiveSources` with it, so the offline banner can say "Stand …"); it need
 * not be stable.
 *
 * The state is keyed by `groupId/roundId`: changing either shows a clean
 * "not received yet" at once, never the previous round for a render.
 */
export function useEstimateRound(
  groupId: string,
  roundId: string | null,
  onSnapshotMetadata?: (snapshot: { metadata: { fromCache: boolean } }) => void,
): EstimateRoundState {
  const user = useCurrentUser();
  const key = roundId ? `${groupId}/${roundId}` : null;
  const [held, setHeld] = useState<{ key: string | null; value: EstimateRoundState }>({
    key,
    value: INITIAL,
  });
  const report = useEffectEvent((snapshot: { metadata: { fromCache: boolean } }) => {
    onSnapshotMetadata?.(snapshot);
  });

  useEffect(() => {
    if (!user || !roundId) return;
    const subscribedKey = `${groupId}/${roundId}`;
    return onSnapshot(
      doc(db, "groups", groupId, "estimateRounds", roundId),
      { includeMetadataChanges: true },
      (snapshot) => {
        const fromCache = snapshot.metadata.fromCache;
        const exists = snapshot.exists();
        setHeld({
          key: subscribedKey,
          value: {
            round: exists ? ({ id: snapshot.id, ...snapshot.data() } as EstimateRound) : null,
            errorCode: null,
            missing: !exists && !fromCache,
            cachedEmpty: !exists && fromCache,
            fromCache,
            received: true,
          },
        });
        report(snapshot);
      },
      (error) => {
        const errorCode = reportSnapshotError("estimate-round", error);
        setHeld((previous) => ({
          key: subscribedKey,
          value: { ...(previous.key === subscribedKey ? previous.value : INITIAL), errorCode },
        }));
      },
    );
  }, [groupId, roundId, user]);

  return held.key === key ? held.value : INITIAL;
}

/**
 * A clock for a deadline: the current time in epoch ms, ticking every
 * `intervalMs` while `running` and the deadline is still ahead, and standing
 * still from the first reading at or past it — so "Zeit um" costs no timer. A
 * deadline that moves (a last call) wakes the clock again with a fresh reading.
 * Display only: the server decides the deadline (`closesAt + grace`).
 */
export function useDeadlineNow(
  deadlineMs: number | null,
  running: boolean,
  intervalMs = 1000,
): number {
  // The deadline a reading has already reached; a different deadline is a new countdown.
  const [reachedFor, setReachedFor] = useState<number | null>(null);
  const reached = deadlineMs !== null && reachedFor === deadlineMs;
  const now = useNow(intervalMs, running && deadlineMs !== null && !reached);
  if (deadlineMs !== null && !reached && now >= deadlineMs) setReachedFor(deadlineMs);
  return now;
}
