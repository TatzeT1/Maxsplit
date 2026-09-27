"use client";

import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { cn } from "@/lib/utils";
import type { GroupMember, Tournament, TournamentMatch } from "@/lib/types";

function PlayerRow({
  uid,
  members,
  role,
}: {
  uid: string | null;
  members: Record<string, GroupMember>;
  /** How this slot reads once the match is done — undefined while it isn't. */
  role?: "safe" | "advances" | "pays" | "champion" | "out";
}) {
  const t = useT();
  if (!uid) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-1 text-sm">
        <span className="border-border/60 flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed text-xs">
          ?
        </span>
        <span className="italic">{t("expenses.tournamentSlotOpen")}</span>
      </div>
    );
  }
  const name = members[uid]?.displayName ?? "?";
  const dimmed = role === "pays" || role === "out";
  return (
    <div className={cn("flex items-center gap-2 py-1 text-sm", dimmed && "opacity-50 grayscale")}>
      <GameAvatar name={name} className="size-6 shrink-0 text-[10px]" />
      <span className={cn("truncate", (role === "safe" || role === "champion") && "font-semibold")}>
        {name}
      </span>
      {role === "champion" && <span aria-hidden="true">👑</span>}
      {role === "pays" && (
        <span className="text-destructive ml-auto shrink-0 text-[11px] font-medium">
          {t("expenses.tournamentPays")}
        </span>
      )}
    </div>
  );
}

function MatchCard({
  match,
  members,
  advance,
  isFinal,
}: {
  match: TournamentMatch;
  members: Record<string, GroupMember>;
  advance: Tournament["advance"];
  isFinal: boolean;
}) {
  const t = useT();
  const [a, b] = match.players;
  const winner = match.result?.winnerUid ?? null;

  function roleFor(
    uid: string | null,
  ): "safe" | "advances" | "pays" | "champion" | "out" | undefined {
    if (!uid || !match.result) return undefined;
    const won = uid === winner;
    if (advance === "loser") {
      if (won) return "safe";
      return isFinal ? "pays" : "advances";
    }
    if (won) return isFinal ? "champion" : "advances";
    return "out";
  }

  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 flex w-40 shrink-0 flex-col gap-0.5 rounded-lg p-2 ring-1",
        match.status === "ready" && "ring-primary ring-2",
        match.status === "waiting" && "border-border/60 border border-dashed ring-0",
      )}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
          {isFinal
            ? t("expenses.tournamentFinal")
            : t("expenses.tournamentRound", { round: match.round })}
        </span>
        {match.status === "playing" && (
          <span
            aria-hidden="true"
            className="bg-primary size-1.5 animate-pulse rounded-full"
            title={t("expenses.tournamentLive")}
          />
        )}
      </div>
      <PlayerRow uid={a} members={members} role={roleFor(a)} />
      <div className="bg-border/60 h-px" />
      <PlayerRow uid={b} members={members} role={roleFor(b)} />
      {match.status === "playing" && match.claim && (
        <p className="text-muted-foreground mt-0.5 truncate text-[10px]">
          {t("expenses.tournamentPlayingOn", {
            name: members[match.claim.byUid]?.displayName ?? "?",
          })}
        </p>
      )}
    </div>
  );
}

/**
 * The tournament tree: one or more independent trees (see
 * `lib/games/tournament-bracket.ts`), each drawn as its rounds left to right.
 * No connector lines yet — the round grouping plus each match's own two-row
 * card already reads as a tree; the lines are a later polish pass.
 */
export function BracketView({
  tournament,
  members,
}: {
  tournament: Tournament;
  members: Record<string, GroupMember>;
}) {
  const t = useT();
  const matches = Object.values(tournament.matches);

  return (
    <div className="flex flex-col gap-4">
      {tournament.trees.map((tree, treeIndex) => {
        const treeMatches = matches.filter((m) => m.treeIndex === treeIndex);
        const maxRound = Math.max(...treeMatches.map((m) => m.round));
        const rounds = Array.from({ length: maxRound }, (_, i) => i + 1);
        return (
          <div key={treeIndex} className="flex flex-col gap-2">
            {tournament.trees.length > 1 && (
              <span className="text-muted-foreground text-xs font-medium">
                {t("expenses.tournamentTreeLabel", { number: treeIndex + 1 })}
              </span>
            )}
            <div className="flex gap-3 overflow-x-auto pb-1">
              {rounds.map((round) => (
                <div key={round} className="flex shrink-0 flex-col justify-around gap-3">
                  {treeMatches
                    .filter((m) => m.round === round)
                    .map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        members={members}
                        advance={tournament.advance}
                        isFinal={match.id === tree.finalMatchId}
                      />
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
