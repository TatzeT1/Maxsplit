"use client";

import { ChevronRight, Trophy } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/locale-provider";
import { TOURNAMENT_GAME_CONFIGS } from "@/components/groups/split-game/tournament/tournament-game-configs";
import { bracketProgress } from "@/lib/games/tournament-status";
import { useRunningTournaments } from "@/lib/games/use-tournament";
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
  const config = TOURNAMENT_GAME_CONFIGS[tournament.gameId];
  const progress = bracketProgress(tournament);

  const hasReadyMatch = Object.values(tournament.matches).some(
    (match) => match.status === "ready" && match.players.includes(currentUid),
  );

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
          {config.emoji} {t("expenses.tournamentBannerTitle")}
        </span>
        <p
          className={cn(
            "truncate text-xs",
            hasReadyMatch ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          {hasReadyMatch
            ? t("expenses.tournamentBannerYourTurn")
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
