"use client";

import { BellRing, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { onlineGameUrl } from "@/components/groups/split-game/online/online-invite-card";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { nudgeOpponent } from "@/lib/actions/tournaments";
import { callAction } from "@/lib/call-action";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { nudgeAllowedFrom, waitingOn } from "@/lib/games/nudge";
import { useOnline } from "@/lib/use-online";
import type { LiveMatch, Tournament } from "@/lib/types";

/** Re-renders every `intervalMs`, for something that turns on after a while. */
function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * "Lea anstupsen": once an online match has been waiting on the other player
 * for a while (`NUDGE_AFTER_MS` of a still board), the one waiting can send
 * them a fresh "Du bist dran". "Warte auf Lea …" alone can't tell thinking
 * from a phone in a pocket. The server says whether the push can reach them;
 * when it can't, a WhatsApp message is one tap away.
 *
 * Keyed by the board's version by the caller, so every move starts over.
 */
export function NudgeButton({
  groupId,
  tournament,
  live,
  me,
  opponentName,
}: {
  groupId: string;
  tournament: Tournament;
  live: LiveMatch;
  me: 0 | 1;
  opponentName: string;
}) {
  const t = useT();
  const online = useOnline();
  const now = useNow(15_000);
  const [nudgedAt, setNudgedAt] = useState<string | null>(null);
  const [reach, setReach] = useState<"push" | "watching" | "off" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (live.winnerUid !== null || waitingOn(live.state, me) === null) return null;
  const allowed = now >= nudgeAllowedFrom(live.updatedAt, nudgedAt);
  if (!allowed && !reach && !error) return null;

  // Only ever built after a nudge came back "off" — client-side, after hydration.
  const whatsAppHref = () =>
    `https://wa.me/?text=${encodeURIComponent(
      t("expenses.nudgeWhatsAppText", {
        name: opponentName,
        game: t(DUEL_GAME_META[tournament.gameId].titleKey),
        url: onlineGameUrl(window.location.origin, groupId, tournament.id),
      }),
    )}`;

  async function nudge() {
    setSending(true);
    setError(null);
    const result = await callAction(() =>
      nudgeOpponent({ groupId, tournamentId: tournament.id, matchId: live.id }),
    );
    setSending(false);
    if (!result.ok) {
      setError(
        result.error === "too-early" ? t("expenses.nudgeTooEarly") : t("expenses.nudgeError"),
      );
      return;
    }
    setNudgedAt(new Date().toISOString());
    setReach(result.data.reach);
  }

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {allowed && (
        <Button
          type="button"
          variant="outline"
          className="h-10"
          disabled={!online || sending}
          onClick={() => void nudge()}
        >
          <BellRing aria-hidden="true" />
          {t("expenses.nudgeButton", { name: opponentName })}
        </Button>
      )}
      {reach && (
        <p role="status" className="text-muted-foreground text-xs">
          {reach === "push"
            ? t("expenses.nudgeSent", { name: opponentName })
            : reach === "watching"
              ? t("expenses.nudgeWatching", { name: opponentName })
              : t("expenses.nudgeOff", { name: opponentName })}
        </p>
      )}
      {reach === "off" && (
        <Button asChild size="sm" variant="ghost" className="h-10">
          <a href={whatsAppHref()} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            {t("expenses.nudgeWhatsApp")}
          </a>
        </Button>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
