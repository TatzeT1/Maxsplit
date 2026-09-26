"use client";

import { AnimatePresence } from "motion/react";
import { type ComponentType, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useKnockoutLadder } from "@/lib/games/use-knockout-ladder";
import { maxDuelLoserCount } from "@/lib/games/knockout-ladder";
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
import type { GroupMember } from "@/lib/types";

/** How long a finished match holds its winning position before the "caught" takeover covers it. */
const MATCH_END_BEAT_MS = 650;
/** How long the draw banner holds before the same match replays. */
const DRAW_HOLD_MS = 1400;

export interface SplitGameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  onResolve: (loserUids: string[]) => void;
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
  config,
}: SplitGameDialogProps & { config: DuelGameConfig }) {
  const t = useT();
  const [step, setStep] = useState<Step>("setup");
  const [poolUids, setPoolUids] = useState<string[]>(memberUids);
  const [loserCountInput, setLoserCountInput] = useState("1");
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

  function startGame() {
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

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetAll();
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
    onResolve(ladder.losers);
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
      <DialogContent className="overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">{config.emoji}</span>
            {t(config.titleKey)}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t(config.introKey)}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <GamePoolSetupStep
            memberUids={memberUids}
            members={members}
            poolUids={poolUids}
            onTogglePoolMember={togglePoolMember}
            loserCount={loserCount}
            maxLoserCount={maxLoserCount}
            onStepLoserCount={stepLoserCount}
            stepperDirection={stepperDirection}
            countHint={t("expenses.duelCountHint")}
            countIcon={config.emoji}
          />
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

        <DialogFooter>
          {step === "setup" ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.gameStart")}
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
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={resetAll}>
              {t("expenses.duelRestart")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
