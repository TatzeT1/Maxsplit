"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import type { LuckRound } from "@/lib/types";

/**
 * One online luck round, live. Same contract as `useTournament`: gated on a
 * signed-in user, and an error is its own state — never folded into "still
 * loading" (AGENTS.md). `missing` means the document doesn't exist.
 */
export function useLuckRound(
  groupId: string,
  roundId: string | null,
): { round: LuckRound | null; errorCode: string | null; missing: boolean } {
  const user = useCurrentUser();
  const [round, setRound] = useState<LuckRound | null>(null);
  const [missing, setMissing] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const subscriptionKey = roundId ? `${groupId}/${roundId}` : null;
  const [subscribedKey, setSubscribedKey] = useState(subscriptionKey);
  if (subscriptionKey !== subscribedKey) {
    setSubscribedKey(subscriptionKey);
    setRound(null);
    setMissing(false);
    setErrorCode(null);
  }

  useEffect(() => {
    if (!user || !roundId) return;
    return onSnapshot(
      doc(db, "groups", groupId, "luckRounds", roundId),
      (snapshot) => {
        setMissing(!snapshot.exists());
        setRound(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as LuckRound) : null);
      },
      (error) => {
        setErrorCode(reportSnapshotError("luck-round", error));
      },
    );
  }, [groupId, roundId, user]);

  return { round, errorCode, missing };
}
