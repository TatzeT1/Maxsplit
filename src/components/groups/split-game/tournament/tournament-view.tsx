"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import type { DuelGameConfig } from "@/components/groups/split-game/duel-game-dialog";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { BracketView } from "@/components/groups/split-game/tournament/bracket-view";
import { TournamentMatchRunner } from "@/components/groups/split-game/tournament/tournament-match-runner";
import { cancelTournament, claimTournamentMatch } from "@/lib/actions/tournaments";
import { bracketLoserUids } from "@/lib/games/tournament-bracket";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { GroupMember, Tournament } from "@/lib/types";

export function TournamentView({
  groupId,
  tournament,
  members,
  currentUid,
  canManage,
  config,
  inDialog = true,
  onApply,
}: {
  groupId: string;
  tournament: Tournament;
  members: Record<string, GroupMember>;
  currentUid: string;
  canManage: boolean;
  config: DuelGameConfig;
  inDialog?: boolean;
  onApply?: (loserUids: string[]) => void;
}) {
  const t = useT();
  const [myMatch, setMyMatch] = useState<{ matchId: string; claimId: string } | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeMatch = myMatch ? tournament.matches[myMatch.matchId] : null;
  // Trust a just-made local claim optimistically: the snapshot for it can lag
  // the server write that made it (different SDK, a real network hop) by a
  // beat, during which the match might still read "ready" with no claim yet.
  // Only a *conflicting* claim — someone else's claimId — is positive
  // evidence we've actually been taken over.
  const takenOver = !!(
    myMatch &&
    activeMatch?.claim &&
    activeMatch.claim.claimId !== myMatch.claimId
  );
  const stillMine = !!myMatch && !takenOver;

  // Adjusted during render (React's pattern for reacting to a changed value
  // without an effect) — condition clears itself the moment it fires, so it
  // can't loop.
  if (takenOver) setMyMatch(null);

  async function handlePlay(matchId: string) {
    setClaimingId(matchId);
    setClaimError(null);
    const result = await claimTournamentMatch({ groupId, tournamentId: tournament.id, matchId });
    setClaimingId(null);
    if (!result.ok) {
      setClaimError(t("expenses.tournamentClaimError"));
      return;
    }
    setMyMatch({ matchId, claimId: result.data.claimId });
  }

  async function handleTakeover(matchId: string) {
    setClaimingId(matchId);
    setClaimError(null);
    const result = await claimTournamentMatch({
      groupId,
      tournamentId: tournament.id,
      matchId,
      takeover: true,
    });
    setClaimingId(null);
    if (!result.ok) {
      setClaimError(t("expenses.tournamentClaimError"));
      return;
    }
    setMyMatch({ matchId, claimId: result.data.claimId });
  }

  async function handleCancel() {
    setCancelling(true);
    await cancelTournament({ groupId, tournamentId: tournament.id });
    setCancelling(false);
  }

  async function handleShare() {
    const url = `${window.location.origin}/groups/${groupId}/tournaments/${tournament.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: t(config.titleKey) });
      } catch {
        // User cancelled the share sheet — not an error.
      }
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (tournament.status === "cancelled") {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm">
        {t("expenses.tournamentCancelled")}
      </p>
    );
  }

  if (myMatch && stillMine && activeMatch) {
    return (
      <TournamentMatchRunner
        groupId={groupId}
        tournamentId={tournament.id}
        match={activeMatch}
        claimId={myMatch.claimId}
        members={members}
        config={config}
        onDone={() => setMyMatch(null)}
      />
    );
  }

  const finished = tournament.status === "finished";
  const readyMatches = Object.values(tournament.matches).filter((m) => m.status === "ready");
  const playingMatches = Object.values(tournament.matches).filter((m) => m.status === "playing");

  const outUids = new Set(bracketLoserUids(tournament));
  const safeUids = new Set(
    Object.values(tournament.matches)
      .filter((m) => m.result && (tournament.advance === "loser" || m.next === null))
      .map((m) => m.result!.winnerUid),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        {tournament.stake && (
          <span className="text-muted-foreground text-sm">
            {tournament.stake.description} ·{" "}
            {formatMoney(tournament.stake.amountMinor, tournament.stake.currency)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void handleShare()}>
            {copied ? t("expenses.tournamentLinkCopied") : t("expenses.tournamentShare")}
          </Button>
          {canManage && !finished && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" disabled={cancelling}>
                  {t("expenses.tournamentCancel")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("expenses.tournamentCancelConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("expenses.tournamentCancelConfirmBody")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void handleCancel()}>
                    {t("expenses.tournamentCancel")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {finished ? (
        <>
          <GameResultBanner
            loserUids={tournament.loserUids ?? []}
            members={members}
            inDialog={inDialog}
          />
          {onApply && (
            <Button type="button" size="lg" onClick={() => onApply(tournament.loserUids ?? [])}>
              {t("expenses.gameApply")}
            </Button>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          {readyMatches.length === 0 && playingMatches.length === 0 && (
            <p className="text-muted-foreground text-sm">
              {t("expenses.tournamentWaitingOnResults")}
            </p>
          )}
          {readyMatches.map((match) => (
            <div
              key={match.id}
              className="border-primary/30 bg-primary/5 flex items-center gap-2 rounded-xl border p-2.5"
            >
              <div className="flex -space-x-1.5">
                {match.players.map(
                  (uid) =>
                    uid && (
                      <GameAvatar
                        key={uid}
                        name={members[uid]?.displayName ?? "?"}
                        className="size-7 text-xs"
                      />
                    ),
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm">
                {match.players
                  .map((uid) => (uid ? (members[uid]?.displayName ?? "?") : "?"))
                  .join(" vs. ")}
              </span>
              <Button
                type="button"
                size="sm"
                disabled={claimingId === match.id}
                onClick={() => void handlePlay(match.id)}
              >
                {t("expenses.tournamentPlayHere")}
              </Button>
            </div>
          ))}
          {playingMatches.map((match) => (
            <div
              key={match.id}
              className="bg-muted/40 flex items-center gap-2 rounded-xl border p-2.5"
            >
              <div className="flex -space-x-1.5">
                {match.players.map(
                  (uid) =>
                    uid && (
                      <GameAvatar
                        key={uid}
                        name={members[uid]?.displayName ?? "?"}
                        className="size-7 text-xs"
                      />
                    ),
                )}
              </div>
              <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                {t("expenses.tournamentPlayingOn", {
                  name: members[match.claim?.byUid ?? ""]?.displayName ?? "?",
                })}
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={claimingId === match.id}
                  >
                    {t("expenses.tournamentTakeover")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("expenses.tournamentTakeoverConfirm")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("expenses.tournamentTakeoverConfirmBody")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void handleTakeover(match.id)}>
                      {t("expenses.tournamentTakeover")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
          {claimError && <p className="text-destructive text-sm">{claimError}</p>}
        </div>
      )}

      <BracketView tournament={tournament} members={members} />

      {!finished && (
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t("expenses.tournamentStandingsTitle")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(tournament.entrants).map((uid) => {
              const status = outUids.has(uid) ? "pays" : safeUids.has(uid) ? "safe" : "playing";
              return (
                <span
                  key={uid}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                    status === "pays" && "border-destructive/30 text-destructive opacity-70",
                    status === "safe" && "border-primary/30 text-primary",
                    status === "playing" && "border-border text-foreground",
                  )}
                >
                  <GameAvatar
                    name={members[uid]?.displayName ?? "?"}
                    className="size-4 text-[8px]"
                  />
                  {members[uid]?.displayName ?? "?"}
                  {currentUid === uid && ` · ${t("expenses.tournamentYou")}`}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
