"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { ArrowLeft, Wifi } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { Skeleton } from "@/components/ui/skeleton";
import { TOURNAMENT_GAME_CONFIGS } from "@/components/groups/split-game/tournament/tournament-game-configs";
import { TournamentView } from "@/components/groups/split-game/tournament/tournament-view";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useTournament } from "@/lib/games/use-tournament";
import { useTournamentPresence } from "@/lib/games/use-tournament-presence";
import { useOnline } from "@/lib/use-online";
import type { Group, GroupMember } from "@/lib/types";

/**
 * The home of every server-backed game: a tournament's live bracket, and
 * the board of an online match (a 1-vs-1 online duel opens straight onto
 * it). Reached from the group page's `TournamentBanner`, the chat invite,
 * a shared `/play/...` link — and, for a game started from a new expense,
 * directly after "Start", since such a game books the expense by itself.
 */
export function TournamentPageClient({
  groupId,
  tournamentId,
}: {
  groupId: string;
  tournamentId: string;
}) {
  const t = useT();
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [groupErrorCode, setGroupErrorCode] = useState<string | null>(null);
  const { tournament, errorCode: tournamentErrorCode } = useTournament(groupId, tournamentId);
  const online = useOnline();
  // A player looking at their game needs no "Du bist dran" push.
  useTournamentPresence(
    groupId,
    user && tournament?.status === "running" && user.uid in tournament.entrants
      ? tournamentId
      : null,
  );

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
      },
      (error) => {
        setGroupErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user]);

  const errorCode = groupErrorCode ?? tournamentErrorCode;

  // Every move and result goes through the server; offline, a cached board
  // would only invite taps that can't land. (It also keeps the runner from
  // trying to open a match it can't reach.)
  if (user && !online) {
    return <NeedsConnection body={t("offline.gameNeedsConnection")} />;
  }

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  if (!group || !tournament || !user) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const config = TOURNAMENT_GAME_CONFIGS[tournament.gameId];
  // Falls back to the entrants snapshot for a uid the group doc no longer
  // has (a member left, or a placeholder got claimed since) — see
  // lib/types.ts's Tournament.entrants doc comment.
  const members: Record<string, GroupMember> = { ...group.members };
  for (const [uid, entrant] of Object.entries(tournament.entrants)) {
    if (!members[uid]) {
      members[uid] = {
        displayName: entrant.displayName,
        photoURL: "",
        joinedAt: tournament.createdAt,
        role: "member",
        isPlaceholder: entrant.isPlaceholder,
      };
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/groups/${groupId}`}
          aria-label={t("common.back")}
          className="hover:bg-accent -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <h1 className="font-heading flex min-w-0 items-center gap-2 text-lg font-semibold">
          <span aria-hidden="true">{config.emoji}</span>
          <span className="truncate">{t(config.titleKey)}</span>
          <span className="bg-primary/10 text-primary flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-[0.08em] uppercase">
            {tournament.playMode === "online" && <Wifi aria-hidden="true" className="size-3" />}
            {tournament.playMode !== "online"
              ? t("expenses.tournamentModeTournament")
              : Object.keys(tournament.matches).length === 1
                ? t("expenses.onlineBadgeDuel")
                : t("expenses.onlineBadgeTournament")}
          </span>
        </h1>
      </div>

      <TournamentView
        groupId={groupId}
        tournament={tournament}
        members={members}
        currentUid={user.uid}
        canManage={user.uid === tournament.createdBy}
        config={config}
        inDialog={false}
      />
    </div>
  );
}
