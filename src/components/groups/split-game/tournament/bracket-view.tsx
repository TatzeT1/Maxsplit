"use client";

import { Crown } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { layoutTree } from "@/lib/games/bracket-layout";
import { cn } from "@/lib/utils";
import type { GroupMember, Tournament, TournamentMatch } from "@/lib/types";

const CARD_WIDTH = 172;
const CARD_HEIGHT = 64;
const ROW_HEIGHT = 84;
const COLUMN_GAP = 40;

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
        <span className="truncate text-xs italic">{t("expenses.tournamentSlotOpen")}</span>
      </div>
    );
  }
  const name = members[uid]?.displayName ?? "?";
  const dimmed = role === "pays" || role === "out";
  return (
    <div className={cn("flex items-center gap-2 py-1 text-sm", dimmed && "opacity-45 grayscale")}>
      <GameAvatar name={name} className="size-6 shrink-0 text-[10px]" />
      <span
        className={cn(
          "truncate",
          (role === "safe" || role === "champion") && "text-primary font-semibold",
        )}
      >
        {name}
      </span>
      {role === "champion" && (
        <Crown aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-amber-400" />
      )}
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
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      className={cn(
        "bg-card shadow-e1 ring-foreground/10 relative flex flex-col justify-center gap-0.5 rounded-xl px-2.5 ring-1 transition-shadow",
        match.status === "ready" && "ring-primary ring-2",
        match.status === "playing" && "ring-primary/60 ring-2",
        match.status === "waiting" && "border-border/60 shadow-none ring-0",
        isFinal && match.status === "done" && "ring-2 ring-amber-400/50",
      )}
    >
      {match.status === "playing" && (
        <span
          aria-hidden="true"
          title={t("expenses.tournamentLive")}
          className="bg-primary ring-card absolute -top-1 -right-1 size-2.5 animate-pulse rounded-full ring-2"
        />
      )}
      <PlayerRow uid={a} members={members} role={roleFor(a)} />
      <div className="bg-border/60 h-px" />
      <PlayerRow uid={b} members={members} role={roleFor(b)} />
    </div>
  );
}

/**
 * The tournament tree, drawn as a real bracket: rounds left to right, each
 * match's card centered between the two matches feeding into it
 * (`lib/games/bracket-layout.ts`), connected by elbow lines whose color marks
 * a decided path. Multiple independent trees stack vertically, each with its
 * own label.
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
    <div className="flex flex-col gap-6">
      {tournament.trees.map((tree, treeIndex) => {
        const treeMatches = matches.filter((m) => m.treeIndex === treeIndex);
        const layout = layoutTree(treeMatches);
        const matchById = new Map(treeMatches.map((m) => [m.id, m]));
        const nodeByMatchId = new Map(layout.nodes.map((n) => [n.matchId, n]));

        const width = layout.maxRound * CARD_WIDTH + (layout.maxRound - 1) * COLUMN_GAP;
        const height = layout.rowCount * ROW_HEIGHT;
        const rounds = Array.from({ length: layout.maxRound }, (_, i) => i + 1);

        const xForRound = (round: number) => (round - 1) * (CARD_WIDTH + COLUMN_GAP);
        const yForRow = (row: number) => row * ROW_HEIGHT + ROW_HEIGHT / 2;

        return (
          <div key={treeIndex} className="flex flex-col gap-2">
            {tournament.trees.length > 1 && (
              <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
                {t("expenses.tournamentTreeLabel", { number: treeIndex + 1 })}
              </span>
            )}
            <div className="overflow-x-auto pb-1">
              <div style={{ width }} className="flex flex-col gap-2">
                <div className="flex" style={{ gap: COLUMN_GAP }}>
                  {rounds.map((round) => (
                    <span
                      key={round}
                      style={{ width: CARD_WIDTH }}
                      className="text-muted-foreground shrink-0 text-center text-[11px] font-semibold tracking-[0.1em] uppercase"
                    >
                      {round === layout.maxRound
                        ? t("expenses.tournamentFinal")
                        : t("expenses.tournamentRound", { round })}
                    </span>
                  ))}
                </div>

                <div className="relative" style={{ width, height }}>
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    width={width}
                    height={height}
                  >
                    {layout.edges.map((edge) => {
                      const from = nodeByMatchId.get(edge.fromMatchId)!;
                      const to = nodeByMatchId.get(edge.toMatchId)!;
                      const fromX = xForRound(from.round) + CARD_WIDTH;
                      const fromY = yForRow(from.row);
                      const toX = xForRound(to.round);
                      const toY = yForRow(to.row);
                      const midX = fromX + COLUMN_GAP / 2;
                      const decided = matchById.get(edge.fromMatchId)?.status === "done";
                      return (
                        <path
                          key={`${edge.fromMatchId}-${edge.toMatchId}`}
                          d={`M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          className={decided ? "text-primary/70" : "text-border"}
                        />
                      );
                    })}
                  </svg>
                  {layout.nodes.map((node) => (
                    <div
                      key={node.matchId}
                      className="absolute"
                      style={{
                        left: xForRound(node.round),
                        top: yForRow(node.row) - CARD_HEIGHT / 2,
                      }}
                    >
                      <MatchCard
                        match={matchById.get(node.matchId)!}
                        members={members}
                        advance={tournament.advance}
                        isFinal={node.matchId === tree.finalMatchId}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
