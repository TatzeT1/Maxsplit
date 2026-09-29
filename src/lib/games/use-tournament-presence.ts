"use client";

import { useEffect } from "react";
import { markTournamentPresence } from "@/lib/actions/tournaments";

/** How often a visible game says "still here"; PRESENCE_WINDOW_MS (lib/push/store.ts) rides out one lost beat. */
const HEARTBEAT_MS = 20_000;

/**
 * While the page is visible and `tournamentId` is set, tells the server this
 * player is looking at the game, so "Du bist dran" pushes skip them
 * (markTournamentPresence). Hiding the page (another app, a locked phone)
 * says so at once; leaving it just stops the beats — an explicit "gone" on
 * unmount would race the next game screen's "here". Best effort: a lost beat
 * costs one push too many, nothing more.
 */
export function useTournamentPresence(groupId: string, tournamentId: string | null) {
  useEffect(() => {
    if (!tournamentId) return;
    const report = (watching: boolean) => {
      if (!navigator.onLine) return;
      markTournamentPresence({ groupId, tournamentId, watching }).catch(() => {});
    };
    const beat = () => {
      if (document.visibilityState === "visible") report(true);
    };
    const onVisibilityChange = () => report(document.visibilityState === "visible");

    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [groupId, tournamentId]);
}
