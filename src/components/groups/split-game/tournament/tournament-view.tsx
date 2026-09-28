"use client";

import {
  Check,
  CircleAlert,
  Eye,
  Hourglass,
  Loader2,
  Play,
  ReceiptText,
  Share2,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import { BracketLegend, BracketView } from "@/components/groups/split-game/tournament/bracket-view";
import {
  FATE_ICON,
  FATE_TEXT_CLASS,
  MatchStakes,
} from "@/components/groups/split-game/tournament/tournament-fate";
import { TournamentMatchRunner } from "@/components/groups/split-game/tournament/tournament-match-runner";
import { OnlineMatchRunner } from "@/components/groups/split-game/online/online-match-runner";
import { OnlineInviteCard } from "@/components/groups/split-game/online/online-invite-card";
import { isOnlineMatch } from "@/lib/games/online-match";
import { cancelTournament, claimTournamentMatch } from "@/lib/actions/tournaments";
import { bracketLoserUids } from "@/lib/games/tournament-bracket";
import {
  bracketProgress,
  entrantStanding,
  pendingSourceMatch,
  type EntrantStanding,
} from "@/lib/games/tournament-status";
import { formatMoney } from "@/lib/format/money";
import { cn } from "@/lib/utils";
import type { GroupMember, Tournament, TournamentMatch } from "@/lib/types";

type Translate = ReturnType<typeof useT>;

const EYEBROW = "text-[11px] font-semibold tracking-[0.12em] uppercase";

/** "Runde 2" / "Finale", plus "· Gruppe 3" when the bracket has more than one tree. */
function matchContext(t: Translate, match: TournamentMatch, treeCount: number): string {
  const round =
    match.next === null
      ? t("expenses.tournamentFinal")
      : t("expenses.tournamentRound", { round: match.round });
  return treeCount > 1
    ? `${round} · ${t("expenses.tournamentTreeLabel", { number: match.treeIndex + 1 })}`
    : round;
}

function byBracketOrder(a: TournamentMatch, b: TournamentMatch): number {
  return a.round - b.round || a.treeIndex - b.treeIndex || a.id.localeCompare(b.id);
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative flex size-2 shrink-0", className)}>
      <span className="bg-primary/70 animate-breathe absolute inline-flex size-full rounded-full" />
      <span className="bg-primary relative inline-flex size-2 rounded-full" />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="font-heading text-base font-medium">{children}</h3>;
}

function TakeoverButton({
  onConfirm,
  disabled,
  className,
  variant = "ghost",
}: {
  onConfirm: () => void;
  disabled: boolean;
  className?: string;
  variant?: "ghost" | "outline";
}) {
  const t = useT();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled} className={className}>
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
          <AlertDialogAction onClick={onConfirm}>
            {t("expenses.tournamentTakeover")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The one card at the top that answers "what about me?" for the viewer —
 * their match to play, their match running elsewhere, who they're waiting
 * on, or how it ended for them. Absent for a spectator who isn't in the
 * bracket at all; the "ready to play" list is their focal point instead.
 */
function YourStatusCard({
  standing,
  tournament,
  members,
  currentUid,
  treeCount,
  claimingId,
  onClaim,
  onPlayOnline,
}: {
  standing: EntrantStanding;
  tournament: Tournament;
  members: Record<string, GroupMember>;
  currentUid: string;
  treeCount: number;
  claimingId: string | null;
  onClaim: (matchId: string, takeover: boolean) => void;
  onPlayOnline: (matchId: string) => void;
}) {
  const t = useT();
  const nameOf = (uid: string | null) => (uid ? (members[uid]?.displayName ?? "?") : "?");

  if (standing.kind === "safe" || standing.kind === "pays") {
    const safe = standing.kind === "safe";
    const Icon = FATE_ICON[standing.kind];
    return (
      <section
        className={cn(
          "animate-rise flex items-center gap-3.5 rounded-2xl border p-4",
          safe ? "border-success/30 bg-success/10" : "border-destructive/30 bg-destructive/10",
        )}
      >
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            safe ? "bg-success/15" : "bg-destructive/15",
            FATE_TEXT_CLASS[standing.kind],
          )}
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={cn(EYEBROW, FATE_TEXT_CLASS[standing.kind])}>
            {safe ? t("expenses.tournamentYouSafeEyebrow") : t("expenses.tournamentYouPayEyebrow")}
          </span>
          <h3 className="font-heading text-lg leading-tight font-medium">
            {safe ? t("expenses.tournamentYouSafe") : t("expenses.tournamentYouPay")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {safe ? t("expenses.tournamentYouSafeHint") : t("expenses.tournamentYouPayHint")}
          </p>
        </div>
      </section>
    );
  }

  const match = standing.match;
  const context = matchContext(t, match, treeCount);

  if (match.status === "waiting") {
    const source = pendingSourceMatch(tournament, match);
    const sourceKnown = !!source && !!source.players[0] && !!source.players[1];
    return (
      <section className="bg-muted/40 animate-rise flex flex-col gap-3 rounded-2xl border border-dashed p-4">
        <span className={cn(EYEBROW, "text-muted-foreground flex items-center gap-1.5")}>
          <Hourglass aria-hidden="true" className="size-3.5" />
          {t("expenses.tournamentWaitingEyebrow")}
        </span>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="border-border text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full border border-dashed text-base"
          >
            ?
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-heading text-base leading-tight font-medium">
              {t("expenses.tournamentWaitingTitle")}
            </h3>
            <p className="text-muted-foreground text-xs">
              {sourceKnown
                ? t("expenses.tournamentNextOpponentFrom", {
                    a: nameOf(source.players[0]),
                    b: nameOf(source.players[1]),
                  })
                : t("expenses.tournamentNextOpponentOpen")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">{context}</span>
          <MatchStakes advance={tournament.advance} match={match} />
        </div>
      </section>
    );
  }

  const opponentUid = match.players.find((uid) => uid !== currentUid) ?? null;
  const opponentName = nameOf(opponentUid);
  const claiming = claimingId === match.id;

  // Online: each of you on your own phone — no claiming, no hosting, no
  // takeover; the match just opens (or reopens) on this phone.
  if (isOnlineMatch(tournament, match)) {
    const live = match.status === "playing";
    return (
      <section className="border-primary/40 bg-primary/5 shadow-e1 animate-rise flex flex-col gap-3 rounded-2xl border p-4">
        <span className={cn(EYEBROW, "text-primary flex items-center gap-1.5")}>
          <LiveDot />
          {live ? t("expenses.tournamentYourMatchLive") : t("expenses.tournamentYourTurnEyebrow")}
        </span>
        <div className="flex items-center gap-3">
          <GameAvatar name={opponentName} className="size-11 text-base" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-heading truncate text-lg leading-tight font-medium">
              {t("expenses.tournamentYouVs", { name: opponentName })}
            </h3>
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Wifi aria-hidden="true" className="size-3.5" />
              {treeCount > 1 || Object.keys(tournament.matches).length > 1
                ? `${t("expenses.onlineBadge")} · ${context}`
                : t("expenses.onlineBadge")}
            </p>
          </div>
        </div>
        <MatchStakes advance={tournament.advance} match={match} />
        <Button type="button" size="lg" className="w-full" onClick={() => onPlayOnline(match.id)}>
          <Play />
          {live ? t("expenses.onlineResume") : t("expenses.tournamentPlayNow")}
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          {t("expenses.onlineYourTurnHint", { name: opponentName })}
        </p>
      </section>
    );
  }

  if (match.status === "playing") {
    const byUid = match.claim?.byUid ?? "";
    return (
      <section className="bg-muted/40 animate-rise flex flex-col gap-3 rounded-2xl border p-4">
        <span className={cn(EYEBROW, "text-primary flex items-center gap-1.5")}>
          <LiveDot />
          {t("expenses.tournamentYourMatchLive")}
        </span>
        <div className="flex items-center gap-3">
          <GameAvatar name={opponentName} className="size-11 text-base" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="font-heading truncate text-lg leading-tight font-medium">
              {t("expenses.tournamentYouVs", { name: opponentName })}
            </h3>
            <p className="text-muted-foreground text-xs">
              {byUid === currentUid
                ? t("expenses.tournamentPlayingOnYours")
                : t("expenses.tournamentPlayingOn", { name: nameOf(byUid) })}
            </p>
          </div>
        </div>
        <MatchStakes advance={tournament.advance} match={match} />
        {/* Normally the pair is mid-game on that other phone, so taking over
            is an escape hatch, not the next step — unless it's this viewer's
            own claim from a tab they've since lost, where it's the way back in. */}
        <TakeoverButton
          variant={byUid === currentUid ? "outline" : "ghost"}
          className={cn(
            "h-10",
            byUid === currentUid ? "w-full" : "text-muted-foreground -ml-2 self-start",
          )}
          disabled={claimingId !== null}
          onConfirm={() => onClaim(match.id, true)}
        />
      </section>
    );
  }

  // Ready: the viewer's own match is waiting for them — the single most
  // important thing on the screen, so it gets the screen's one primary button.
  return (
    <section className="border-primary/40 bg-primary/5 shadow-e1 animate-rise flex flex-col gap-3 rounded-2xl border p-4">
      <span className={cn(EYEBROW, "text-primary flex items-center gap-1.5")}>
        <LiveDot />
        {t("expenses.tournamentYourTurnEyebrow")}
      </span>
      <div className="flex items-center gap-3">
        <GameAvatar name={opponentName} className="size-11 text-base" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-heading truncate text-lg leading-tight font-medium">
            {t("expenses.tournamentYouVs", { name: opponentName })}
          </h3>
          <p className="text-muted-foreground text-xs">{context}</p>
        </div>
      </div>
      <MatchStakes advance={tournament.advance} match={match} />
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={claimingId !== null}
        onClick={() => onClaim(match.id, false)}
      >
        {claiming ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Play />}
        {t("expenses.tournamentPlayNow")}
      </Button>
      <p className="text-muted-foreground text-center text-xs">
        {t("expenses.tournamentYourTurnHint", { name: opponentName })}
      </p>
    </section>
  );
}

function PairAvatars({
  match,
  members,
}: {
  match: TournamentMatch;
  members: Record<string, GroupMember>;
}) {
  return (
    <div aria-hidden="true" className="flex shrink-0 -space-x-2">
      {match.players.map((uid, index) => (
        <GameAvatar
          key={uid ?? index}
          name={uid ? (members[uid]?.displayName ?? "?") : "?"}
          className="ring-popover size-8 text-xs ring-2"
        />
      ))}
    </div>
  );
}

function StandingsGroup({
  title,
  icon: Icon,
  iconClass,
  chipClass,
  aside,
  uids,
  members,
  currentUid,
}: {
  title: string;
  icon: LucideIcon | null;
  iconClass?: string;
  chipClass: string;
  aside?: string;
  uids: string[];
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const t = useT();
  if (uids.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold">
          {Icon ? (
            <Icon aria-hidden="true" className={cn("size-3.5", iconClass)} />
          ) : (
            <LiveDot className="mx-[3px]" />
          )}
          {title}
          <span className="text-muted-foreground font-normal tabular-nums">{uids.length}</span>
        </span>
        {aside && <span className="text-muted-foreground">{aside}</span>}
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {uids.map((uid) => {
          const name = members[uid]?.displayName ?? "?";
          return (
            <li
              key={uid}
              className={cn(
                "flex max-w-full min-w-0 items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1 text-sm",
                chipClass,
              )}
            >
              <GameAvatar name={name} className="size-6 text-[10px]" />
              <span className={cn("truncate", uid === currentUid && "font-semibold")}>{name}</span>
              {uid === currentUid && (
                <span className="bg-primary/15 text-primary shrink-0 rounded px-1 text-[10px] leading-4 font-semibold">
                  {t("expenses.tournamentYou")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The live tournament screen, ordered by what a person needs first: how far
 * along it is, then their own situation (`YourStatusCard`), then what else
 * can be played right now, and only then the full bracket and standings for
 * reference. Playing a claimed match swaps the whole view for
 * `TournamentMatchRunner` until it's reported or left.
 */
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
  const [cancelError, setCancelError] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // A plain online 1-vs-1 *is* its one match — open straight onto the board
  // for its two players instead of making them tap through an overview.
  const [onlineMatchId, setOnlineMatchId] = useState<string | null>(() => {
    const all = Object.values(tournament.matches);
    const only = all.length === 1 ? all[0] : null;
    return only &&
      only.status !== "done" &&
      only.players.includes(currentUid) &&
      isOnlineMatch(tournament, only)
      ? only.id
      : null;
  });
  const onlineMatch = onlineMatchId ? (tournament.matches[onlineMatchId] ?? null) : null;

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

  const showRunner = tournament.status !== "cancelled" && !!myMatch && stillMine && !!activeMatch;
  const showOnline = tournament.status !== "cancelled" && !!onlineMatch;

  // Entering or leaving a match swaps almost the whole screen. Without this, a
  // match started from far down the list would open with its handoff card
  // (and "Los geht's") scrolled out of view above — and coming back, the
  // overview would open somewhere in the middle.
  const swapped = showRunner || showOnline;
  const prevShowRunnerRef = useRef(swapped);
  useEffect(() => {
    if (prevShowRunnerRef.current === swapped) return;
    prevShowRunnerRef.current = swapped;
    rootRef.current?.scrollIntoView({ block: "start" });
  }, [swapped]);

  async function handleClaim(matchId: string, takeover: boolean) {
    setClaimingId(matchId);
    setClaimError(null);
    const result = await claimTournamentMatch({
      groupId,
      tournamentId: tournament.id,
      matchId,
      takeover,
    }).catch(() => ({ ok: false as const, error: "network" }));
    setClaimingId(null);
    if (!result.ok) {
      // Two phones tapping the same ready match at once is the expected race
      // in a parallel tournament — say so plainly rather than "failed".
      setClaimError(
        result.error === "match-claimed"
          ? t("expenses.tournamentClaimTaken")
          : t("expenses.tournamentClaimError"),
      );
      return;
    }
    setMyMatch({ matchId, claimId: result.data.claimId });
  }

  async function handleCancel() {
    setCancelling(true);
    setCancelError(false);
    const ok = await cancelTournament({ groupId, tournamentId: tournament.id }).then(
      (result) => result.ok,
      () => false,
    );
    setCancelling(false);
    if (!ok) setCancelError(true);
  }

  async function handleShare() {
    const url = `${window.location.origin}/play/${groupId}/${tournament.id}`;
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

  if (showOnline) {
    return (
      <div ref={rootRef} className="min-w-0 scroll-mt-16">
        <OnlineMatchRunner
          groupId={groupId}
          tournament={tournament}
          match={onlineMatch!}
          members={members}
          currentUid={currentUid}
          contextLabel={
            Object.keys(tournament.matches).length > 1
              ? matchContext(t, onlineMatch!, tournament.trees.length)
              : null
          }
          beforeFirstMove={
            bracketProgress(tournament).doneCount === 0 ? (
              <OnlineInviteCard
                groupId={groupId}
                tournament={tournament}
                members={members}
                currentUid={currentUid}
                gameTitle={t(config.titleKey)}
              />
            ) : null
          }
          onDone={() => setOnlineMatchId(null)}
        />
      </div>
    );
  }

  if (showRunner) {
    return (
      <div ref={rootRef} className="min-w-0 scroll-mt-16">
        <TournamentMatchRunner
          groupId={groupId}
          tournamentId={tournament.id}
          match={activeMatch!}
          claimId={myMatch!.claimId}
          members={members}
          config={config}
          advance={tournament.advance}
          contextLabel={matchContext(t, activeMatch!, tournament.trees.length)}
          onDone={() => setMyMatch(null)}
        />
      </div>
    );
  }

  const finished = tournament.status === "finished";
  const treeCount = tournament.trees.length;
  const matches = Object.values(tournament.matches);
  // An online 1-vs-1 is a bracket of one match: no rounds, no tree, no
  // standings worth drawing — just the match and its result.
  const isDuel = matches.length === 1;
  const progress = bracketProgress(tournament);
  const standing = entrantStanding(tournament, currentUid);
  const ownMatchId = standing?.kind === "active" ? standing.match.id : null;
  const ownReady = standing?.kind === "active" && standing.match.status === "ready";
  const ownPlayable =
    ownReady || (standing?.kind === "active" && standing.match.status === "playing");

  const readyMatches = matches
    .filter((m) => m.status === "ready" && m.id !== ownMatchId)
    .sort(byBracketOrder);
  const playingMatches = matches
    .filter((m) => m.status === "playing" && m.id !== ownMatchId)
    .sort(byBracketOrder);
  const totalReady = readyMatches.length + (ownReady ? 1 : 0);
  const nameOf = (uid: string | null) => (uid ? (members[uid]?.displayName ?? "?") : "?");

  // Standings, grouped rather than color-coded chip by chip: payers in the
  // order they were decided, everyone else alphabetically.
  const payerUids = bracketLoserUids(tournament);
  const safeUids: string[] = [];
  const activeUids: string[] = [];
  for (const uid of Object.keys(tournament.entrants)) {
    const s = entrantStanding(tournament, uid);
    if (s?.kind === "safe") safeUids.push(uid);
    else if (s?.kind === "active") activeUids.push(uid);
  }
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b));
  safeUids.sort(byName);
  activeUids.sort(byName);

  const progressText = t("expenses.tournamentProgress", {
    done: progress.doneCount,
    total: progress.totalCount,
  });
  const progressPct =
    progress.totalCount > 0 ? Math.round((progress.doneCount / progress.totalCount) * 100) : 0;

  return (
    <div ref={rootRef} className="flex min-w-0 scroll-mt-16 flex-col gap-5">
      {/* Where things stand overall, plus the invite link. */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={cn(EYEBROW, "text-muted-foreground")}>
              {isDuel
                ? finished
                  ? t("expenses.onlineDuelFinished")
                  : t("expenses.onlineBadgeDuel")
                : finished || progress.currentRound === null
                  ? t("expenses.tournamentFinished")
                  : t("expenses.tournamentRoundOf", {
                      round: progress.currentRound,
                      total: progress.roundCount,
                    })}
            </span>
            {tournament.stake && (
              <span className="truncate text-sm">
                {tournament.stake.description} ·{" "}
                <span className="font-heading tabular-money font-medium">
                  {formatMoney(tournament.stake.amountMinor, tournament.stake.currency)}
                </span>
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            onClick={() => void handleShare()}
          >
            {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
            {copied ? t("expenses.tournamentLinkCopied") : t("expenses.tournamentShare")}
          </Button>
        </div>
        {!isDuel && (
          <div className="flex items-center gap-2.5">
            <div
              role="progressbar"
              aria-label={progressText}
              aria-valuemin={0}
              aria-valuemax={progress.totalCount}
              aria-valuenow={progress.doneCount}
              className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-(--duration-slow) ease-(--ease-entrance)"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {progressText}
            </span>
          </div>
        )}
      </div>

      {finished ? (
        <div className="flex flex-col gap-3">
          <GameResultBanner
            loserUids={tournament.loserUids ?? []}
            members={members}
            inDialog={inDialog}
          />
          {tournament.expenseId ? (
            <p className="text-success flex items-center justify-center gap-1.5 text-sm font-medium">
              <ReceiptText aria-hidden="true" className="size-4" />
              {t("expenses.onlineBooked")}
            </p>
          ) : tournament.autoBookError ? (
            <p
              role="alert"
              className="text-destructive flex items-start justify-center gap-1.5 text-center text-sm"
            >
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {t("expenses.onlineBookFailed")}
            </p>
          ) : onApply ? (
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={() => onApply(tournament.loserUids ?? [])}
            >
              {t("expenses.gameApply")}
            </Button>
          ) : (
            <p className="text-muted-foreground text-center text-xs">
              {canManage
                ? t("expenses.tournamentApplyHintCreator")
                : t("expenses.tournamentApplyHintOther", { name: nameOf(tournament.createdBy) })}
            </p>
          )}
        </div>
      ) : (
        <>
          {tournament.playMode === "online" && progress.doneCount === 0 && (
            <OnlineInviteCard
              groupId={groupId}
              tournament={tournament}
              members={members}
              currentUid={currentUid}
              gameTitle={t(config.titleKey)}
            />
          )}

          {standing && (
            <YourStatusCard
              standing={standing}
              tournament={tournament}
              members={members}
              currentUid={currentUid}
              treeCount={treeCount}
              claimingId={claimingId}
              onClaim={(matchId, takeover) => void handleClaim(matchId, takeover)}
              onPlayOnline={setOnlineMatchId}
            />
          )}

          {claimError && (
            <p role="alert" className="text-destructive text-sm">
              {claimError}
            </p>
          )}

          {readyMatches.length === 0 && playingMatches.length === 0 && !standing && (
            <p className="text-muted-foreground text-sm">
              {t("expenses.tournamentWaitingOnResults")}
            </p>
          )}

          {readyMatches.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle>
                {ownPlayable
                  ? t("expenses.tournamentReadyOthersTitle")
                  : t("expenses.tournamentReadyTitle")}
              </SectionTitle>
              <ul className="flex flex-col gap-2">
                {readyMatches.map((match) => {
                  const a = nameOf(match.players[0]);
                  const b = nameOf(match.players[1]);
                  return (
                    <li
                      key={match.id}
                      className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-xl border p-2.5 pl-3"
                    >
                      <PairAvatars match={match} members={members} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {t("expenses.duelVersus", { a, b })}
                        </span>
                        <span className="text-muted-foreground truncate text-xs">
                          {matchContext(t, match, treeCount)}
                        </span>
                      </div>
                      {isOnlineMatch(tournament, match) ? (
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1 pr-1 text-xs">
                          <Wifi aria-hidden="true" className="size-3.5" />
                          {t("expenses.onlineBadge")}
                        </span>
                      ) : (
                        <Button
                          type="button"
                          // Primary only when nothing above already is: with the
                          // viewer's own match up top, their "Jetzt spielen" is
                          // the one action; hosting someone else's is secondary.
                          variant={ownReady ? "outline" : "default"}
                          size="sm"
                          className="h-10 shrink-0"
                          aria-label={t("expenses.tournamentPlayHereLabel", { a, b })}
                          disabled={claimingId !== null}
                          onClick={() => void handleClaim(match.id, false)}
                        >
                          {claimingId === match.id && (
                            <Loader2 aria-hidden="true" className="animate-spin" />
                          )}
                          {t("expenses.tournamentPlayHere")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {totalReady > 1 && (
                <p className="text-muted-foreground text-xs">
                  {t("expenses.tournamentParallelHint")}
                </p>
              )}
            </section>
          )}

          {playingMatches.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionTitle>{t("expenses.tournamentLive")}</SectionTitle>
              <ul className="flex flex-col gap-2">
                {playingMatches.map((match) => {
                  const byUid = match.claim?.byUid ?? "";
                  return (
                    <li
                      key={match.id}
                      className="bg-muted/40 flex items-center gap-3 rounded-xl border p-2.5 pl-3"
                    >
                      <PairAvatars match={match} members={members} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">
                          {t("expenses.duelVersus", {
                            a: nameOf(match.players[0]),
                            b: nameOf(match.players[1]),
                          })}
                        </span>
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
                          <LiveDot />
                          <span className="truncate">
                            {isOnlineMatch(tournament, match)
                              ? t("expenses.onlineBadge")
                              : byUid === currentUid
                                ? t("expenses.tournamentOnYourPhone")
                                : t("expenses.tournamentOnPhone", { name: nameOf(byUid) })}
                          </span>
                        </span>
                      </div>
                      {isOnlineMatch(tournament, match) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground h-10 shrink-0"
                          aria-label={t("expenses.onlineWatchLabel", {
                            a: nameOf(match.players[0]),
                            b: nameOf(match.players[1]),
                          })}
                          onClick={() => setOnlineMatchId(match.id)}
                        >
                          <Eye aria-hidden="true" />
                          {t("expenses.onlineWatch")}
                        </Button>
                      ) : (
                        <TakeoverButton
                          className="text-muted-foreground h-10 shrink-0"
                          disabled={claimingId !== null}
                          onConfirm={() => void handleClaim(match.id, true)}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {!isDuel && (
        <>
          <section className="flex min-w-0 flex-col gap-3 border-t pt-5">
            <SectionTitle>{t("expenses.tournamentBracketTitle")}</SectionTitle>
            <p className="text-muted-foreground -mt-1 text-xs">
              {tournament.advance === "loser"
                ? t("expenses.tournamentRuleLoser")
                : t("expenses.tournamentRuleWinner")}
            </p>
            <BracketLegend />
            <BracketView tournament={tournament} members={members} currentUid={currentUid} />
          </section>

          <section className="flex flex-col gap-3.5 border-t pt-5">
            <SectionTitle>{t("expenses.tournamentStandingsTitle")}</SectionTitle>
            <StandingsGroup
              title={t("expenses.tournamentStandingsPays")}
              icon={FATE_ICON.pays}
              iconClass={FATE_TEXT_CLASS.pays}
              chipClass="border-destructive/25 bg-destructive/5"
              aside={
                finished
                  ? undefined
                  : t("expenses.tournamentPayersProgress", {
                      found: payerUids.length,
                      target: tournament.targetLoserCount,
                    })
              }
              uids={payerUids}
              members={members}
              currentUid={currentUid}
            />
            <StandingsGroup
              title={t("expenses.tournamentStandingsActive")}
              icon={null}
              chipClass="border-border"
              uids={activeUids}
              members={members}
              currentUid={currentUid}
            />
            <StandingsGroup
              title={t("expenses.tournamentStandingsSafe")}
              icon={FATE_ICON.safe}
              iconClass={FATE_TEXT_CLASS.safe}
              chipClass="border-success/25 bg-success/5"
              uids={safeUids}
              members={members}
              currentUid={currentUid}
            />
          </section>
        </>
      )}

      {canManage && !finished && (
        <div className="flex flex-col items-center gap-1 border-t pt-4">
          {cancelError && (
            <p role="alert" className="text-destructive text-sm">
              {t("expenses.tournamentCancelError")}
            </p>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-10"
                disabled={cancelling}
              >
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
                <AlertDialogAction variant="destructive" onClick={() => void handleCancel()}>
                  {t("expenses.tournamentCancel")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
