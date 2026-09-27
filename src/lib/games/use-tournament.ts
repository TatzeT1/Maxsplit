"use client";

import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import type { Tournament } from "@/lib/types";

/**
 * Subscribes to one tournament document — the live source of truth every
 * device (creator's, players', spectators') renders from. Gated on a signed-in
 * user, per AGENTS.md: an error must never look like loading, so callers
 * should render `errorCode` once `user` is truthy, not fold it into the
 * `tournament === null` "still loading" state.
 */
export function useTournament(
  groupId: string,
  tournamentId: string | null,
): { tournament: Tournament | null; errorCode: string | null; loading: boolean } {
  const user = useCurrentUser();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  // Reset the moment the subscription target changes, so a stale tournament
  // from a previous id never lingers — done during render (React's blessed
  // pattern for "adjust state when a prop changes"), not as a synchronous
  // setState-in-effect, which cascades an extra render for no benefit here.
  const subscriptionKey = tournamentId ? `${groupId}/${tournamentId}` : null;
  const [subscribedKey, setSubscribedKey] = useState(subscriptionKey);
  if (subscriptionKey !== subscribedKey) {
    setSubscribedKey(subscriptionKey);
    setTournament(null);
    setErrorCode(null);
  }

  useEffect(() => {
    if (!user || !tournamentId) return;
    return onSnapshot(
      doc(db, "groups", groupId, "tournaments", tournamentId),
      (snapshot) => {
        setTournament(
          snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Tournament) : null,
        );
      },
      (error) => {
        setErrorCode(reportSnapshotError("tournament", error));
      },
    );
  }, [groupId, tournamentId, user]);

  return { tournament, errorCode, loading: !!tournamentId && !tournament && !errorCode };
}

/** Every `running` tournament in a group — drives the group page's banner. Almost always zero or one, since `createTournament` enforces one at a time. */
export function useRunningTournaments(groupId: string): {
  tournaments: Tournament[];
  errorCode: string | null;
} {
  const user = useCurrentUser();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const runningQuery = query(
      collection(db, "groups", groupId, "tournaments"),
      where("status", "==", "running"),
    );
    return onSnapshot(
      runningQuery,
      (snapshot) => {
        setTournaments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Tournament));
      },
      (error) => {
        setErrorCode(reportSnapshotError("running-tournaments", error));
      },
    );
  }, [groupId, user]);

  return { tournaments, errorCode };
}
