"use client";

import { collection, doc, getDocFromServer, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import type { LiveMatch, Tournament } from "@/lib/types";

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

/** How often an undecided online match double-checks the server, beyond its listener. */
const RESYNC_INTERVAL_MS = 3000;

/**
 * Subscribes to one online match's live board. Same contract as
 * `useTournament`: an error must never read as "still loading", so callers
 * render `errorCode` as soon as it's set. `live === null` with no error and
 * `loading === false` means the board simply doesn't exist yet (nobody has
 * opened the match) — the runner then calls `openOnlineMatch`.
 */
export function useLiveMatch(
  groupId: string,
  tournamentId: string,
  matchId: string | null,
): { live: LiveMatch | null; errorCode: string | null; loading: boolean } {
  const user = useCurrentUser();
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const subscriptionKey = matchId ? `${groupId}/${tournamentId}/${matchId}` : null;
  const [subscribedKey, setSubscribedKey] = useState(subscriptionKey);
  if (subscriptionKey !== subscribedKey) {
    setSubscribedKey(subscriptionKey);
    setLive(null);
    setLoaded(false);
    setErrorCode(null);
  }

  useEffect(() => {
    if (!user || !matchId) return;
    return onSnapshot(
      doc(db, "groups", groupId, "tournaments", tournamentId, "liveMatches", matchId),
      (snapshot) => {
        setLive(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as LiveMatch) : null);
        setLoaded(true);
      },
      (error) => {
        setErrorCode(reportSnapshotError("live-match", error));
      },
    );
  }, [groupId, tournamentId, matchId, user]);

  // Safety net under the listener: a phone that was backgrounded, or sits on
  // a network that buffers the stream, can miss the opponent's move for a
  // long while. While the match is undecided, ask the server directly every
  // few seconds and the moment the app comes back to the front. Only ever
  // moves forward (by `version`), so it can't undo a fresher snapshot.
  const watching = !!user && !!matchId && live !== null && live.winnerUid === null;
  useEffect(() => {
    if (!watching || !matchId) return;
    const ref = doc(db, "groups", groupId, "tournaments", tournamentId, "liveMatches", matchId);
    let cancelled = false;
    const resync = () => {
      if (document.visibilityState === "hidden" || !navigator.onLine) return;
      getDocFromServer(ref)
        .then((snapshot) => {
          if (cancelled || !snapshot.exists()) return;
          const fresh = { id: snapshot.id, ...snapshot.data() } as LiveMatch;
          setLive((current) => (current && fresh.version > current.version ? fresh : current));
        })
        .catch(() => {
          // The listener reports real errors; this is only a backstop.
        });
    };
    const timer = setInterval(resync, RESYNC_INTERVAL_MS);
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    window.addEventListener("focus", resync);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
      window.removeEventListener("focus", resync);
    };
  }, [watching, groupId, tournamentId, matchId]);

  return { live, errorCode, loading: !!matchId && !loaded && !errorCode };
}
