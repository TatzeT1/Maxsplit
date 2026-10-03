"use client";

import { ChevronRight, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { createRematch } from "@/lib/actions/tournaments";
import { callAction } from "@/lib/call-action";
import { localDay } from "@/lib/games/game-stats";
import { canRematch } from "@/lib/games/rematch";
import { useOnline } from "@/lib/use-online";
import type { GroupMember, Tournament } from "@/lib/types";

/**
 * "Revanche" under a finished online game, for its players: the same game,
 * people and stake once more, with the loser opening a duel. Once one player
 * asked, everyone else's button leads into that game instead of starting
 * another (`rematchId`, set by `createRematch`).
 */
export function RematchButton({
  groupId,
  tournament,
  members,
  currentUid,
}: {
  groupId: string;
  tournament: Tournament;
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const t = useT();
  const router = useRouter();
  const online = useOnline();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canRematch(tournament) || !(currentUid in tournament.entrants)) return null;

  if (tournament.rematchId) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button asChild size="lg" className="w-full">
          <Link href={`/groups/${groupId}/tournaments/${tournament.rematchId}`}>
            {t("expenses.rematchJoin")}
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
        <p className="text-muted-foreground text-center text-xs">{t("expenses.rematchExists")}</p>
      </div>
    );
  }

  const entrantUids = Object.keys(tournament.entrants);
  const opener = entrantUids.length === 2 ? tournament.loserUids?.[0] : undefined;
  const openerName = opener
    ? (members[opener]?.displayName ?? tournament.entrants[opener]?.displayName ?? "")
    : "";

  async function start() {
    setStarting(true);
    setError(null);
    const result = await callAction(() =>
      createRematch({
        groupId,
        tournamentId: tournament.id,
        date: localDay(new Date().toISOString()),
      }),
    );
    setStarting(false);
    if (!result.ok) {
      setError(
        result.error === "tournament-running"
          ? t("expenses.tournamentAlreadyRunning")
          : result.error === "member-left"
            ? t("expenses.rematchMemberLeft")
            : result.error === "network"
              ? t("errors.notSaved")
              : t("expenses.tournamentStartError"),
      );
      return;
    }
    router.push(`/groups/${groupId}/tournaments/${result.data.tournamentId}`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!online || starting}
        onClick={() => void start()}
      >
        <RotateCcw aria-hidden="true" />
        {starting ? t("common.loading") : t("expenses.rematchStart")}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        {openerName
          ? t("expenses.rematchHintDuel", { name: openerName })
          : t("expenses.rematchHint")}
      </p>
      {!online && (
        <p role="alert" className="text-destructive text-center text-sm">
          {t("offline.gameNeedsConnection")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-center text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
