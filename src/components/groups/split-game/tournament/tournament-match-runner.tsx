"use client";

import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { DuelDrawNotice, DuelHandoffCard } from "@/components/groups/split-game/duel-ladder";
import {
  FATE_ICON,
  FATE_TEXT_CLASS,
  MatchStakes,
} from "@/components/groups/split-game/tournament/tournament-fate";
import { releaseTournamentMatch, reportTournamentMatchResult } from "@/lib/actions/tournaments";
import { matchFates, type MatchFate } from "@/lib/games/tournament-status";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import type { GroupMember, TournamentAdvance, TournamentMatch } from "@/lib/types";

const WIN_BEAT_MS = 650;
const DRAW_HOLD_MS = 1400;

type Phase = "handoff" | "live" | "decided";

const OUTCOME_KEY: Record<MatchFate, TranslationKey> = {
  safe: "expenses.tournamentOutcomeSafe",
  pays: "expenses.tournamentOutcomePays",
  advances: "expenses.tournamentOutcomeAdvances",
};

/**
 * Plays exactly one claimed match, entirely locally on this device — per the
 * "co-located" tournament design (see brain/Features/Split Games.md), the two
 * players share this one phone the same way the knockout ladder's handoff
 * card always has. Only the final winner (and how many tries it took) ever
 * reaches the server; a draw replay never does.
 *
 * The flow is handoff (who plays, what's at stake) → the board → a result
 * card that says what the result means for both players and confirms it was
 * saved, and only then back to the tournament — so a pair never walks away
 * unsure whether their match counted.
 */
export function TournamentMatchRunner({
  groupId,
  tournamentId,
  match,
  claimId,
  members,
  config,
  advance,
  contextLabel,
  onDone,
}: {
  groupId: string;
  tournamentId: string;
  match: TournamentMatch;
  claimId: string;
  members: Record<string, GroupMember>;
  config: DuelGameConfig;
  advance: TournamentAdvance;
  /** "Runde 2 · Gruppe 1" — where this match sits in the bracket. */
  contextLabel: string;
  onDone: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("handoff");
  const [players, setPlayers] = useState<[string, string]>(match.players as [string, string]);
  const [attempt, setAttempt] = useState(0);
  const [drawNotice, setDrawNotice] = useState(false);
  const [decidedWinner, setDecidedWinner] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  async function submitResult(winnerUid: string) {
    setBusy(true);
    setReportError(null);
    // A dropped connection makes the action *throw* rather than return
    // `ok: false` — caught here too, or the card would spin on "wird
    // eingetragen" forever with no way to retry.
    const ok = await reportTournamentMatchResult({
      groupId,
      tournamentId,
      matchId: match.id,
      claimId,
      winnerUid,
      attempts: attempt + 1,
    }).then(
      (result) => result.ok,
      () => false,
    );
    setBusy(false);
    if (!ok) {
      setReportError(t("expenses.tournamentReportError"));
      return;
    }
    setReported(true);
  }

  function handleWin(winnerUid: string) {
    if (phase !== "live") return;
    setPhase("decided");
    setDecidedWinner(winnerUid);
    const beat = setTimeout(() => {
      void submitResult(winnerUid);
    }, WIN_BEAT_MS);
    timersRef.current.push(beat);
  }

  function handleDraw() {
    if (phase !== "live") return;
    setDrawNotice(true);
    const hold = setTimeout(() => {
      setDrawNotice(false);
      setAttempt((n) => n + 1);
      setPlayers(([a, b]) => [b, a]);
    }, DRAW_HOLD_MS);
    timersRef.current.push(hold);
  }

  async function handleLeave() {
    setBusy(true);
    // Leave regardless: if the release didn't land, the match just stays
    // claimed by this phone, and the overview offers "Übernehmen" for it.
    await releaseTournamentMatch({ groupId, tournamentId, matchId: match.id, claimId }).catch(
      () => null,
    );
    setBusy(false);
    onDone();
  }

  const Board = config.Board;
  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";
  const fates = matchFates(advance, match);
  const loserUid = decidedWinner ? players.find((uid) => uid !== decidedWinner)! : null;

  const backButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="text-muted-foreground -ml-2 h-10"
      disabled={busy}
      onClick={phase === "handoff" ? () => void handleLeave() : undefined}
    >
      <ArrowLeft aria-hidden="true" />
      {t("expenses.tournamentLeaveMatch")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-10 items-center justify-between gap-2">
        {phase === "handoff" ? (
          backButton
        ) : phase === "live" ? (
          // Mid-game, backing out throws the board away — worth one confirm.
          <AlertDialog>
            <AlertDialogTrigger asChild>{backButton}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("expenses.tournamentLeaveConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("expenses.tournamentLeaveConfirmBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("expenses.tournamentLeaveConfirmStay")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => void handleLeave()}>
                  {t("expenses.tournamentLeaveConfirmAction")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {contextLabel}
        </span>
      </div>

      {phase === "handoff" && (
        <>
          <DuelHandoffCard players={players} members={members} />
          <MatchStakes advance={advance} match={match} className="justify-center" />
          <Button type="button" size="lg" className="w-full" onClick={() => setPhase("live")}>
            {t("expenses.duelHandoffStart")}
          </Button>
        </>
      )}

      {drawNotice && <DuelDrawNotice />}

      {decidedWinner && loserUid && (
        <div
          aria-live="polite"
          className="border-primary/30 bg-primary/5 animate-rise flex flex-col items-center gap-2 rounded-xl border p-4 text-center"
        >
          <p className="font-heading text-lg font-medium">
            {t("expenses.tournamentMatchWinner", { name: nameOf(decidedWinner) })}
          </p>
          <div className="flex flex-col items-center gap-1 text-sm">
            {(
              [
                [decidedWinner, fates.win],
                [loserUid, fates.loss],
              ] as const
            ).map(([uid, fate]) => {
              const Icon = FATE_ICON[fate];
              return (
                <span key={uid} className="flex items-center gap-1.5">
                  <Icon aria-hidden="true" className={cn("size-4", FATE_TEXT_CLASS[fate])} />
                  {t(OUTCOME_KEY[fate], { name: nameOf(uid) })}
                </span>
              );
            })}
          </div>
          {reportError ? (
            <div className="flex flex-col items-center gap-2 pt-1">
              <p role="alert" className="text-destructive text-sm">
                {reportError}
              </p>
              <Button
                type="button"
                size="sm"
                className="h-10"
                disabled={busy}
                onClick={() => void submitResult(decidedWinner)}
              >
                {t("common.retry")}
              </Button>
            </div>
          ) : reported ? (
            <>
              <span className="text-success flex items-center gap-1 pt-1 text-xs font-medium">
                <Check aria-hidden="true" className="size-3.5" />
                {t("expenses.tournamentReported")}
              </span>
              <Button type="button" size="lg" className="mt-1 w-full" onClick={onDone}>
                {t("expenses.tournamentLeaveMatch")}
              </Button>
            </>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1.5 pt-1 text-xs">
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              {t("expenses.tournamentReporting")}
            </span>
          )}
        </div>
      )}

      {(phase === "live" || phase === "decided") && (
        <Board
          key={attempt}
          players={players}
          members={members}
          attempt={attempt}
          locked={phase !== "live"}
          onWin={handleWin}
          onDraw={handleDraw}
        />
      )}
    </div>
  );
}
