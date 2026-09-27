"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import type { DuelGameConfig } from "@/components/groups/split-game/duel-game-dialog";
import { DuelDrawNotice, DuelHandoffCard } from "@/components/groups/split-game/duel-ladder";
import { releaseTournamentMatch, reportTournamentMatchResult } from "@/lib/actions/tournaments";
import type { GroupMember, TournamentMatch } from "@/lib/types";

const WIN_BEAT_MS = 650;
const DRAW_HOLD_MS = 1400;

type Phase = "handoff" | "live" | "decided";

/**
 * Plays exactly one claimed match, entirely locally on this device — per the
 * "co-located" tournament design (see brain/Features/Split Games.md once
 * written up), the two players share this one phone the same way the
 * knockout ladder's handoff card always has. Only the final winner (and how
 * many tries it took) ever reaches the server; a draw replay never does.
 */
export function TournamentMatchRunner({
  groupId,
  tournamentId,
  match,
  claimId,
  members,
  config,
  onDone,
}: {
  groupId: string;
  tournamentId: string;
  match: TournamentMatch;
  claimId: string;
  members: Record<string, GroupMember>;
  config: DuelGameConfig;
  onDone: () => void;
}) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("handoff");
  const [players, setPlayers] = useState<[string, string]>(match.players as [string, string]);
  const [attempt, setAttempt] = useState(0);
  const [drawNotice, setDrawNotice] = useState(false);
  const [decidedWinner, setDecidedWinner] = useState<string | null>(null);
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
    const result = await reportTournamentMatchResult({
      groupId,
      tournamentId,
      matchId: match.id,
      claimId,
      winnerUid,
      attempts: attempt + 1,
    });
    setBusy(false);
    if (!result.ok) {
      setReportError(t("expenses.tournamentReportError"));
      return;
    }
    onDone();
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
    await releaseTournamentMatch({ groupId, tournamentId, matchId: match.id, claimId });
    setBusy(false);
    onDone();
  }

  const Board = config.Board;

  return (
    <div className="flex flex-col gap-3">
      {phase === "handoff" && <DuelHandoffCard players={players} members={members} />}
      {drawNotice && <DuelDrawNotice />}
      {decidedWinner && (
        <div className="border-primary/30 bg-primary/5 animate-rise rounded-xl border p-3 text-center text-sm font-medium">
          {t("expenses.tournamentMatchWinner", {
            name: members[decidedWinner]?.displayName ?? "?",
          })}
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
      {reportError && (
        <div className="flex flex-col gap-2">
          <p className="text-destructive text-sm">{reportError}</p>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => decidedWinner && void submitResult(decidedWinner)}
          >
            {t("common.retry")}
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        {phase === "handoff" && (
          <Button type="button" size="lg" className="flex-1" onClick={() => setPhase("live")}>
            {t("expenses.duelHandoffStart")}
          </Button>
        )}
        {phase !== "decided" && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => void handleLeave()}
          >
            {t("expenses.tournamentLeaveMatch")}
          </Button>
        )}
      </div>
    </div>
  );
}
