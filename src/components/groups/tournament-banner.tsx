"use client";

import { ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/locale-provider";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { isOnlineMatch } from "@/lib/games/online-match";
import { bracketProgress } from "@/lib/games/tournament-status";
import { useRunningTournaments } from "@/lib/games/use-tournament";
import { useTournamentPresence } from "@/lib/games/use-tournament-presence";
import { cn } from "@/lib/utils";

/**
 * Shows up on the group page whenever a tournament is running — the entry
 * point for a spectator or a player on their own phone, since the bracket
 * itself only lives inside the game dialog on whichever device created it.
 * Turns primary and pulses when the signed-in member has a match ready to
 * play right now; otherwise says how far along the tournament is.
 */
export function TournamentBanner({ groupId, currentUid }: { groupId: string; currentUid: string }) {
  const t = useT();
  const { tournaments, errorCode } = useRunningTournaments(groupId);
  // This banner turns "Du bist dran!" live, so a player on the group page
  // counts as watching their online game — no push needed.
  const running = tournaments[0];
  useTournamentPresence(
    groupId,
    running?.playMode === "online" && currentUid in running.entrants ? running.id : null,
  );

  // Per AGENTS.md: a failed listener must never look like "no tournament".
  if (errorCode) {
    return (
      <div className="border-destructive/50 text-destructive flex flex-col gap-0.5 rounded-xl border p-3">
        <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
        <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
      </div>
    );
  }

  if (tournaments.length === 0) return null;
  // createTournament enforces at most one running tournament per group.
  const tournament = tournaments[0];
  // Only the game's name and emoji — not TOURNAMENT_GAME_CONFIGS, whose boards would ride
  // along into every group page.
  const config = DUEL_GAME_META[tournament.gameId];
  const progress = bracketProgress(tournament);

  const online = tournament.playMode === "online";
  const matches = Object.values(tournament.matches);
  const isDuel = matches.length === 1;
  // An online match stays "yours to act on" while it's running too — the
  // board is waiting on this phone, not on some other phone in the room.
  const hasReadyMatch = matches.some(
    (match) =>
      match.players.includes(currentUid) &&
      (match.status === "ready" ||
        (match.status === "playing" && isOnlineMatch(tournament, match))),
  );
  const challenger = tournament.entrants[tournament.createdBy]?.displayName ?? "";
  const title = online
    ? isDuel
      ? t("expenses.onlineBannerDuelTitle")
      : t("expenses.onlineBannerTournamentTitle")
    : t("expenses.tournamentBannerTitle");
  const yourTurnText =
    online && tournament.createdBy !== currentUid && progress.doneCount === 0
      ? t("expenses.onlineBannerChallenge", { name: challenger })
      : t("expenses.tournamentBannerYourTurn");

  return (
    <Link
      href={`/groups/${groupId}/tournaments/${tournament.id}`}
      className={cn(
        "bg-card ring-foreground/10 hover:ring-primary/40 hover:shadow-e1 relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]",
        hasReadyMatch && "bg-primary/5 ring-primary/50",
      )}
    >
      <div className="from-primary/20 to-primary/5 text-primary relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br">
        <Trophy className="h-4.5 w-4.5" />
        {hasReadyMatch && (
          <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
            <span className="bg-primary/70 animate-breathe absolute inline-flex h-full w-full rounded-full" />
            <span className="bg-primary ring-card relative inline-flex h-2.5 w-2.5 rounded-full ring-2" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {config.emoji} {title}
        </span>
        <p
          className={cn(
            "truncate text-xs",
            hasReadyMatch ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          {hasReadyMatch
            ? yourTurnText
            : t("expenses.tournamentBannerProgress", {
                game: t(config.titleKey),
                done: progress.doneCount,
                total: progress.totalCount,
              })}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </Link>
  );
}
