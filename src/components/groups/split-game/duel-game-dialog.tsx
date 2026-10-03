"use client";

import { AnimatePresence } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { useGameRound } from "@/components/groups/split-game/game-round";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { useT } from "@/components/locale-provider";
import { readRememberedSetup, rememberSetup } from "@/lib/games/game-memory";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useKnockoutLadder } from "@/lib/games/use-knockout-ladder";
import { maxDuelLoserCount } from "@/lib/games/knockout-ladder";
import { useTournament } from "@/lib/games/use-tournament";
import { createTournament } from "@/lib/actions/tournaments";
import { playAppliedSound, playLaughSound, playStampSound } from "@/lib/sound/game-sounds";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import {
  DuelDrawNotice,
  DuelHandoffCard,
  DuelLadderStrip,
} from "@/components/groups/split-game/duel-ladder";
import { TournamentView } from "@/components/groups/split-game/tournament/tournament-view";
import {
  DuelModePicker,
  DuelPlacePicker,
  TournamentPlanCard,
  type DuelMode,
  type DuelPlace,
} from "@/components/groups/split-game/tournament/tournament-mode-picker";
import type { DuelGameId, GameExpenseDraft, GroupMember } from "@/lib/types";

/** How long a finished match holds its winning position before the "caught" takeover covers it. */
const MATCH_END_BEAT_MS = 650;
/** How long the draw banner holds before the same match replays. */
const DRAW_HOLD_MS = 1400;

export interface SplitGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Who pays, and everyone who played (stored on the expense). */
  onResolve: (loserUids: string[], playerUids: string[]) => void;
  /** Needed only for tournament mode (live cross-device sync) — absent, the toggle never shows. */
  groupId?: string;
  currentUid?: string;
  stake?: { description: string; amountMinor: number; currency: string } | null;
  /**
   * The expense a server-backed game (online, or a tournament) books by
   * itself once it's decided. `undefined` means this dialog can't auto-book
   * (editing an existing expense) — the result is then applied by hand, and
   * online play isn't offered. `null` means it could, but the form isn't
   * complete enough yet.
   */
  expenseDraft?: GameExpenseDraft | null;
  /** Called once a server-backed game with `expenseDraft` has started — the caller closes the form and opens the game's page. */
  onServerGameStarted?: (tournamentId: string) => void;
}

export interface DuelBoardProps {
  /** `players[0]` moves/goes first in this match. */
  players: [string, string];
  members: Record<string, GroupMember>;
  /** 0 on a match's first try, +1 per draw replay — Tic-Tac-Toe uses this to switch into its sudden-death variant. */
  attempt: number;
  /** True while the shell is holding on a just-finished match or a draw notice: the board should ignore input but keep rendering its final position. */
  locked: boolean;
  /** Call once a match has a winner. */
  onWin: (winnerUid: string) => void;
  /** Call if a match ends with no winner — the shell replays it with the players swapped. */
  onDraw: () => void;
}

export interface DuelGameConfig {
  emoji: string;
  titleKey: TranslationKey;
  introKey: TranslationKey;
  Board: ComponentType<DuelBoardProps>;
  gameId: DuelGameId;
  /** Whether the "Turnier" mode toggle shows in setup (pool >= 3) — off until a game's runner is verified end to end. */
  tournament?: boolean;
}

type Step = "setup" | "playing";
type MatchPhase = "handoff" | "live";

interface DecidedMatch {
  key: string;
  winnerUid: string;
  loserUid: string;
}

interface FlashState {
  id: number;
  uid: string;
}

/**
 * Shared dialog shell for every 1-vs-1 duel mini-game (Tic-Tac-Toe, Connect
 * Four, Memory-Duell, Reaktionsduell): setup step (pool + how many should
 * pay, same as the wheel/scratch/lottery), then the knockout ladder
 * (`useKnockoutLadder`) drives handoff cards, one match at a time on
 * `config.Board`, and the shared "caught!" celebration on every loss, until
 * enough payers are decided. Each game only has to implement its board.
 */
export function DuelGameDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  onResolve,
  groupId,
  currentUid,
  stake,
  expenseDraft,
  onServerGameStarted,
  config,
}: SplitGameDialogProps & { config: DuelGameConfig }) {
  const t = useT();
  const { startRound } = useGameRound();
  const [step, setStep] = useState<Step>("setup");
  const [remembered] = useState(() => readRememberedSetup(groupId, memberUids));
  const [poolUids, setPoolUids] = useState<string[]>(remembered?.poolUids ?? memberUids);
  const [loserCountInput, setLoserCountInput] = useState(String(remembered?.loserCount ?? 1));
  const [stepperDirection, setStepperDirection] = useState<1 | -1>(1);
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("handoff");
  const [decided, setDecided] = useState<DecidedMatch | null>(null);
  const [drawNotice, setDrawNotice] = useState<{ id: number } | null>(null);
  const [flash, setFlash] = useState<FlashState | null>(null);
  const flashIdRef = useRef(0);
  const drawIdRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, shakeStage] = useImpactShake();
  const ladder = useKnockoutLadder();

  // Tournament mode: a live, cross-device bracket instead of the local
  // knockout ladder. Only offered when the caller wired a groupId and the
  // game's config opts in (see DuelGameConfig.tournament).
  const [mode, setMode] = useState<DuelMode>("ladder");
  const [place, setPlace] = useState<DuelPlace>("device");
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [tournamentStarting, setTournamentStarting] = useState(false);
  const [tournamentStartError, setTournamentStartError] = useState<string | null>(null);
  const { tournament, errorCode: tournamentErrorCode } = useTournament(groupId ?? "", tournamentId);
  const canOfferTournament = !!(config.tournament && groupId && currentUid);
  const canAutoBook = expenseDraft !== undefined;

  // Online needs a phone on both ends of at least one match: two members
  // with an account. Placeholders still play — on their opponent's phone.
  const realPoolUids = poolUids.filter((uid) => members[uid]?.isPlaceholder !== true);
  const placeholderNames = poolUids
    .filter((uid) => members[uid]?.isPlaceholder === true)
    .map((uid) => members[uid].displayName);
  const onlineUnavailableHint = !canOfferTournament
    ? null
    : !canAutoBook
      ? t("expenses.duelPlaceOnlineEditHint")
      : realPoolUids.length < 2
        ? t("expenses.duelPlaceOnlineMinHint")
        : null;
  const setupPlace: DuelPlace =
    canOfferTournament && onlineUnavailableHint === null ? place : "device";
  const tournamentAvailable = canOfferTournament && poolUids.length >= 3;
  // What "Start" will actually do. Online is always a bracket (a 1-vs-1 is a
  // bracket of one match); on one device a tournament picked earlier falls
  // back to the ladder if the pool has since shrunk below three, rather than
  // quietly starting a two-person "tournament" behind a hidden toggle.
  const setupMode: DuelMode =
    setupPlace === "online" ? "tournament" : tournamentAvailable ? mode : "ladder";

  // The tournament was cancelled elsewhere (or by this device) — drop back to
  // setup so the dialog doesn't sit on a dead bracket. Adjusted during render
  // (React's pattern for reacting to a changed value without an effect):
  // once handled, `tournament?.status` stops matching "cancelled" here — the
  // tournamentId that made it so is already cleared — so this can't loop.
  const [ackedCancelledId, setAckedCancelledId] = useState<string | null>(null);
  if (tournament?.status === "cancelled" && tournamentId !== ackedCancelledId) {
    setAckedCancelledId(tournamentId);
    setTournamentId(null);
    setStep("setup");
  }

  useEffect(() => {
    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function togglePoolMember(uid: string) {
    setPoolUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  const maxLoserCount = maxDuelLoserCount(Math.max(poolUids.length, 1));
  const loserCount = Math.min(
    Math.max(Number.parseInt(loserCountInput, 10) || 1, 1),
    maxLoserCount,
  );

  function stepLoserCount(delta: number) {
    setStepperDirection(delta > 0 ? 1 : -1);
    setLoserCountInput(String(Math.min(Math.max(loserCount + delta, 1), maxLoserCount)));
  }

  async function startGame() {
    startRound();
    rememberSetup(groupId, { poolUids, loserCount });
    if (setupMode === "tournament" && groupId) {
      // A server-backed game books the expense itself at the end, so the
      // form has to be complete *now* — nobody's looking at it afterwards.
      if (canAutoBook && !expenseDraft) {
        setTournamentStartError(t("expenses.duelNeedsExpense"));
        return;
      }
      setTournamentStarting(true);
      setTournamentStartError(null);
      // A dropped connection throws instead of returning `ok: false` —
      // without the catch the start button would sit on "Lädt …" for good.
      const result = await createTournament({
        groupId,
        gameId: config.gameId,
        poolUids,
        targetLoserCount: loserCount,
        stake: stake ?? null,
        playMode: setupPlace === "online" ? "online" : "local",
        autoBook: expenseDraft ?? null,
      }).catch(() => ({ ok: false as const, error: "network" }));
      setTournamentStarting(false);
      if (!result.ok) {
        setTournamentStartError(
          result.error === "tournament-running"
            ? t("expenses.tournamentAlreadyRunning")
            : t("expenses.tournamentStartError"),
        );
        return;
      }
      if (expenseDraft && onServerGameStarted) {
        // The game now lives on its own page (the same one the others open
        // from the invite) and books the expense when it's decided.
        resetAll();
        onServerGameStarted(result.data.tournamentId);
        return;
      }
      setTournamentId(result.data.tournamentId);
      setStep("playing");
      return;
    }
    setMode("ladder");
    ladder.start(poolUids, loserCount);
    setMatchPhase("handoff");
    setStep("playing");
  }

  function resetAll() {
    clearTimers();
    ladder.reset();
    setDecided(null);
    setFlash(null);
    setDrawNotice(null);
    setMatchPhase("handoff");
    setStep("setup");
  }

  /** A finished tournament's result, applied to the expense form exactly like the ladder's. */
  function applyTournamentResult(loserUids: string[]) {
    playAppliedSound();
    onResolve(loserUids, tournament ? Object.keys(tournament.entrants) : poolUids);
    setTournamentId(null);
    setMode("ladder");
    resetAll();
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    // A live tournament survives closing the dialog — reopening the same
    // game shows it again, rather than losing it to a ladder-style reset.
    const tournamentIsLive =
      mode === "tournament" && tournamentId && tournament?.status === "running";
    if (!nextOpen && !tournamentIsLive) resetAll();
    onOpenChange(nextOpen);
  }

  function handleBoardWin(pairingKey: string, winnerUid: string) {
    if (decided || drawNotice) return;
    if (!ladder.current || ladder.current.key !== pairingKey) return;
    const [a, b] = ladder.current.players;
    const loserUid = a === winnerUid ? b : a;
    setDecided({ key: pairingKey, winnerUid, loserUid });

    const beat = setTimeout(() => {
      playStampSound(STAMP_IMPACT_S);
      playLaughSound(STAMP_IMPACT_S + 0.1);
      shakeStage();
      flashIdRef.current += 1;
      setFlash({ id: flashIdRef.current, uid: loserUid });

      const hold = setTimeout(() => {
        setFlash(null);
        setDecided(null);
        ladder.reportWin(pairingKey, winnerUid);
        setMatchPhase("handoff");
      }, CATCH_FLASH_HOLD_MS);
      timersRef.current.push(hold);
    }, MATCH_END_BEAT_MS);
    timersRef.current.push(beat);
  }

  function handleBoardDraw(pairingKey: string) {
    if (decided || drawNotice) return;
    if (!ladder.current || ladder.current.key !== pairingKey) return;
    drawIdRef.current += 1;
    setDrawNotice({ id: drawIdRef.current });

    const hold = setTimeout(() => {
      setDrawNotice(null);
      ladder.reportDraw(pairingKey);
    }, DRAW_HOLD_MS);
    timersRef.current.push(hold);
  }

  function applyResult() {
    playAppliedSound();
    onResolve(ladder.losers, poolUids);
    handleOpenChange(false);
  }

  const showVerdict = ladder.gameOver && flash === null;
  const showBoard = !!ladder.current && (matchPhase === "live" || !!decided || !!drawNotice);
  const Board = config.Board;

  let liveAnnouncement = "";
  if (drawNotice) liveAnnouncement = t("expenses.duelDrawNotice");
  else if (decided) {
    liveAnnouncement = t("expenses.duelLostCaption", {
      name: members[decided.winnerUid].displayName,
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">{config.emoji}</span>
            {t(config.titleKey)}
            {step === "playing" && mode === "tournament" && (
              <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-sans text-[11px] font-semibold tracking-[0.08em] uppercase">
                {t("expenses.tournamentModeTournament")}
              </span>
            )}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t(config.introKey)}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-4">
            {canOfferTournament && (
              <DuelPlacePicker
                place={setupPlace}
                onPlaceChange={setPlace}
                onlineUnavailableHint={onlineUnavailableHint}
              />
            )}
            {canOfferTournament && setupPlace === "device" && (
              <DuelModePicker
                mode={setupMode}
                onModeChange={setMode}
                tournamentAvailable={tournamentAvailable}
              />
            )}
            <GamePoolSetupStep
              memberUids={memberUids}
              members={members}
              poolUids={poolUids}
              onTogglePoolMember={togglePoolMember}
              loserCount={loserCount}
              maxLoserCount={maxLoserCount}
              onStepLoserCount={stepLoserCount}
              stepperDirection={stepperDirection}
              countHint={
                setupMode === "tournament" && poolUids.length >= 3
                  ? t("expenses.tournamentCountHint")
                  : t("expenses.duelCountHint")
              }
              countIcon={config.emoji}
            />
            {setupMode === "tournament" && poolUids.length >= 3 && (
              <TournamentPlanCard poolSize={poolUids.length} loserCount={loserCount} />
            )}
            {setupPlace === "online" && (
              <p className="text-muted-foreground bg-muted/40 rounded-xl border p-3 text-xs leading-relaxed">
                {t("expenses.duelOnlineHowItWorks")}
                {placeholderNames.length > 0 && (
                  <>
                    {" "}
                    {t("expenses.duelOnlinePlaceholders", { names: placeholderNames.join(", ") })}
                  </>
                )}
              </p>
            )}
            {tournamentStartError && (
              <p className="text-destructive text-sm">{tournamentStartError}</p>
            )}
          </div>
        ) : mode === "tournament" ? (
          <div className="flex min-w-0 flex-col gap-3">
            {tournamentErrorCode ? (
              <p className="text-destructive text-sm">
                {t("errors.dataLoadFailed")} ({tournamentErrorCode})
              </p>
            ) : !tournament ? (
              <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
            ) : (
              <TournamentView
                groupId={groupId!}
                tournament={tournament}
                members={members}
                currentUid={currentUid!}
                canManage={currentUid === tournament.createdBy}
                config={config}
                onApply={applyTournamentResult}
              />
            )}
          </div>
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {liveAnnouncement}
            </p>

            {showVerdict ? (
              <GameResultBanner loserUids={ladder.losers} members={members} />
            ) : (
              ladder.current && (
                <>
                  <DuelLadderStrip
                    matchNumber={ladder.current.matchNumber}
                    targetLoserCount={ladder.targetLoserCount}
                    losers={ladder.losers}
                    members={members}
                  />
                  {ladder.targetLoserCount > 1 && (
                    <GameProgressPips
                      revealedCount={ladder.decidedCount}
                      target={ladder.targetLoserCount}
                      progressLabel={t("expenses.duelProgress", {
                        found: ladder.decidedCount,
                        target: ladder.targetLoserCount,
                      })}
                    />
                  )}
                  {matchPhase === "handoff" && !decided && (
                    <DuelHandoffCard players={ladder.current.players} members={members} />
                  )}
                  {drawNotice && <DuelDrawNotice />}
                  {showBoard && (
                    <Board
                      key={ladder.current.key}
                      players={ladder.current.players}
                      members={members}
                      attempt={ladder.current.attempt}
                      locked={!!decided || !!drawNotice}
                      onWin={(winnerUid) => handleBoardWin(ladder.current!.key, winnerUid)}
                      onDraw={() => handleBoardDraw(ladder.current!.key)}
                    />
                  )}
                </>
              )
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.duelLostStamp")}
                  finale={ladder.gameOver}
                  caption={
                    decided && (
                      <span className="text-muted-foreground text-sm font-medium">
                        {t("expenses.duelLostCaption", {
                          name: members[decided.winnerUid].displayName,
                        })}
                      </span>
                    )
                  }
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {!(step === "playing" && mode === "tournament") && (
          <DialogFooter>
            {step === "setup" ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={poolUids.length < 2 || tournamentStarting}
                onClick={() => void startGame()}
              >
                {tournamentStarting
                  ? t("common.loading")
                  : setupPlace === "online"
                    ? t("expenses.duelOnlineStart")
                    : setupMode === "tournament"
                      ? t("expenses.tournamentStart")
                      : t("expenses.gameStart")}
              </Button>
            ) : showVerdict ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={resetAll}
                >
                  {t("expenses.duelRestart")}
                </Button>
                <Button type="button" size="lg" className="flex-1" onClick={applyResult}>
                  {t("expenses.gameApply")}
                </Button>
              </>
            ) : matchPhase === "handoff" && !decided ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={resetAll}
                >
                  {t("expenses.duelRestart")}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  onClick={() => setMatchPhase("live")}
                >
                  {t("expenses.duelHandoffStart")}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={resetAll}
              >
                {t("expenses.duelRestart")}
              </Button>
            )}
          </DialogFooter>
        )}
      </GameDialogContent>
    </Dialog>
  );
}
