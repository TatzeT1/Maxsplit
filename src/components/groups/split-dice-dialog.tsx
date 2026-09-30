"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import {
  diceKind,
  diceNumber,
  isDiceGameOver,
  maxDiceLoserCount,
  nextRoller,
  recordDiceRoll,
  startDiceGame,
  type DiceGame,
  type DicePair,
} from "@/lib/games/dice-cup";
import { randomInt } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import {
  playAppliedSound,
  playDiceLandSound,
  playDiceRattleSound,
  playLaughSound,
  playStampSound,
} from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import {
  CATCH_FLASH_HOLD_MS,
  CatchFlash,
  STAMP_IMPACT_S,
  useImpactShake,
} from "@/components/groups/split-game/celebration";
import { DiceCupFigure, DiceFace } from "@/components/groups/split-game/dice-figure";
import { DuelDrawNotice } from "@/components/groups/split-game/duel-ladder";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** How long the cup rattles before the dice come out. */
const SHAKE_MS = 850;
/** How long the dice sit on the table, readable, before the roll is written down. */
const SETTLE_MS = 1000;
/** A beat between the last roll and the "caught" takeover. */
const VERDICT_BEAT_MS = 450;

function rollDie(): number {
  return randomInt(1, 6);
}

/** A roll as the people at the table say it: "54", "66 · Pasch", "21 · Mäxchen!". */
function RollTag({ pair, showKind = true }: { pair: DicePair; showKind?: boolean }) {
  const t = useT();
  const kind = diceKind(pair);
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="font-heading tabular-money text-lg leading-none font-medium">
        {diceNumber(pair)}
      </span>
      {showKind && kind !== "plain" && (
        <span className="text-muted-foreground text-xs font-medium">
          {kind === "maexchen" ? t("expenses.diceMaexchen") : t("expenses.dicePasch")}
        </span>
      )}
    </span>
  );
}

/** The latest roll of `uid` in this game: the current round's, else the most recent finished one. */
function latestRoll(game: DiceGame, uid: string): DicePair | null {
  const current = game.rolls[uid];
  if (current) return current;
  for (let index = game.rounds.length - 1; index >= 0; index--) {
    const past = game.rounds[index].rolls[uid];
    if (past) return past;
  }
  return null;
}

/**
 * Würfelbecher: everyone shakes the cup once and rolls two dice, and the
 * lowest roll pays. Rolls rank like the pub game Mäxchen (21 beats everything,
 * then the doubles, then the rest by the bigger die first); people level on the
 * line roll again — "Stechen" — and only they do. The rules live in
 * `lib/games/dice-cup.ts`; every die is a crypto-random draw made the instant
 * the cup is shaken, the rattle and tumble are only for show.
 */
export function SplitDiceDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  onResolve: (loserUids: string[]) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const setup = useGamePoolSetup(memberUids, maxDiceLoserCount);
  const [game, setGame] = useState<DiceGame | null>(null);
  // Mirrors `game` so a quick double tap can't roll twice for the same person.
  const gameRef = useRef<DiceGame | null>(null);
  const [rolling, setRolling] = useState<{
    uid: string;
    pair: DicePair;
    stage: "shaking" | "landed";
  } | null>(null);
  const [flash, setFlash] = useState<{ id: number; uid: string } | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const idRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, shakeStage] = useImpactShake<HTMLDivElement>();

  useEffect(() => {
    // The same array for the component's whole lifetime — only ever pushed to.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function later(ms: number, action: () => void) {
    timersRef.current.push(setTimeout(action, ms));
  }

  function update(next: DiceGame | null) {
    gameRef.current = next;
    setGame(next);
  }

  function resetStage() {
    clearTimers();
    setRolling(null);
    setFlash(null);
    setCelebrated(false);
  }

  function startGame() {
    resetStage();
    update(startDiceGame(setup.poolUids, setup.loserCount));
    setStep("playing");
  }

  function goToSetup() {
    resetStage();
    update(null);
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetStage();
      update(null);
      setStep("setup");
    }
    onOpenChange(nextOpen);
  }

  function celebrate(finished: DiceGame) {
    const loserUid = finished.losers[0];
    later(VERDICT_BEAT_MS, () => {
      playStampSound(STAMP_IMPACT_S);
      playLaughSound(STAMP_IMPACT_S + 0.1);
      shakeStage();
      idRef.current += 1;
      setFlash({ id: idRef.current, uid: loserUid });
      later(CATCH_FLASH_HOLD_MS, () => {
        setFlash(null);
        setCelebrated(true);
      });
    });
  }

  function commit(uid: string, pair: DicePair) {
    const current = gameRef.current;
    if (!current) return;
    const next = recordDiceRoll(current, uid, pair);
    update(next);
    setRolling(null);
    if (isDiceGameOver(next)) celebrate(next);
  }

  function roll() {
    const current = gameRef.current;
    if (!current || rolling) return;
    const uid = nextRoller(current);
    if (!uid) return;
    // Decided now, before anything moves; the rest is staging.
    const pair: DicePair = [rollDie(), rollDie()];
    if (reduceMotion) {
      setRolling({ uid, pair, stage: "landed" });
      later(SETTLE_MS, () => commit(uid, pair));
      return;
    }
    setRolling({ uid, pair, stage: "shaking" });
    playDiceRattleSound(SHAKE_MS / 1000);
    later(SHAKE_MS, () => {
      setRolling({ uid, pair, stage: "landed" });
      playDiceLandSound();
    });
    later(SHAKE_MS + SETTLE_MS, () => commit(uid, pair));
  }

  function applyResult() {
    if (!game) return;
    playAppliedSound();
    onResolve(game.losers);
    handleOpenChange(false);
  }

  const over = game !== null && isDiceGameOver(game);
  const showVerdict = over && celebrated;
  const rollerUid = game && !over ? nextRoller(game) : null;
  const stageUid = rolling?.uid ?? rollerUid;
  const tieBreak = game !== null && !over && game.rounds.length > 0;
  const worstUid = game?.losers[0];
  const worstRoll = game && worstUid ? latestRoll(game, worstUid) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🥃</span>
            {t("expenses.diceTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.diceIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" || !game ? (
          <GamePoolSetupStep
            memberUids={memberUids}
            members={members}
            poolUids={setup.poolUids}
            onTogglePoolMember={setup.togglePoolMember}
            loserCount={setup.loserCount}
            maxLoserCount={setup.maxLoserCount}
            onStepLoserCount={setup.stepLoserCount}
            stepperDirection={setup.stepperDirection}
            countHint={t("expenses.diceCountHint")}
            countIcon="🥃"
          />
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {rolling?.stage === "landed"
                ? t("expenses.diceRolledLabel", {
                    name: members[rolling.uid].displayName,
                    number: diceNumber(rolling.pair),
                  })
                : ""}
            </p>

            {showVerdict ? (
              <GameResultBanner loserUids={game.losers} members={members} />
            ) : (
              rollerUid && (
                <DuelTurnBanner uid={rollerUid} members={members} hint={t("expenses.diceHint")} />
              )
            )}

            {tieBreak && !showVerdict && (
              <>
                <DuelDrawNotice />
                <p className="text-muted-foreground text-center text-xs">
                  {t("expenses.diceTieBreak", {
                    names: game.contenders.map((uid) => members[uid].displayName).join(", "),
                  })}
                </p>
              </>
            )}

            <div className="relative flex min-h-[170px] items-center justify-center overflow-hidden rounded-xl border border-black/20 bg-[#1f5a4b] shadow-[inset_0_2px_10px_rgb(0_0_0/0.45)]">
              <AnimatePresence mode="wait" initial={false}>
                {rolling?.stage === "landed" ? (
                  <motion.div
                    key="dice"
                    className="flex items-center gap-4"
                    initial={reduceMotion ? false : { opacity: 0, y: -50, rotate: -40 }}
                    animate={{ opacity: 1, y: 0, rotate: 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 13 }
                    }
                  >
                    <DiceFace value={rolling.pair[0]} size={78} className="-rotate-6" />
                    <DiceFace value={rolling.pair[1]} size={78} className="rotate-6" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="cup"
                    initial={false}
                    animate={
                      rolling && !reduceMotion
                        ? {
                            rotate: [-16, 16, -12, 12, -8, 8, 0],
                            x: [0, -7, 7, -5, 5, -2, 0],
                          }
                        : { rotate: -8, x: 0 }
                    }
                    transition={
                      rolling && !reduceMotion
                        ? { duration: SHAKE_MS / 1000, ease: "easeInOut" }
                        : { duration: 0.2 }
                    }
                  >
                    <DiceCupFigure size={96} />
                  </motion.div>
                )}
              </AnimatePresence>
              {rolling?.stage === "landed" && (
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <span className="bg-card/90 shadow-e1 rounded-full border px-3 py-1">
                    <RollTag pair={rolling.pair} />
                  </span>
                </div>
              )}
              {stageUid && !rolling && (
                <p className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-white/80">
                  {t("expenses.diceShakeHint", { name: members[stageUid].displayName })}
                </p>
              )}
            </div>

            <ul className="flex flex-col gap-1.5">
              {setup.poolUids.map((uid) => {
                const name = members[uid].displayName;
                const pair = latestRoll(game, uid);
                const kind = pair ? diceKind(pair) : "plain";
                const pays = game.losers.includes(uid);
                const safe = game.safe.includes(uid);
                const tied = !over && game.rounds.length > 0 && game.contenders.includes(uid);
                return (
                  <li
                    key={uid}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-2",
                      pays && "border-destructive/40 bg-destructive/5",
                      !pays && "bg-background",
                    )}
                  >
                    <GameAvatar name={name} className="size-8 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{name}</span>
                      {kind !== "plain" && (
                        <span className="text-muted-foreground block text-xs font-medium">
                          {kind === "maexchen"
                            ? t("expenses.diceMaexchen")
                            : t("expenses.dicePasch")}
                        </span>
                      )}
                    </span>
                    {/* A fixed-width column, so the dice line up from row to row. */}
                    {pair ? (
                      <span className="flex w-[5.5rem] shrink-0 items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden="true">
                          <DiceFace value={pair[0]} size={24} />
                          <DiceFace value={pair[1]} size={24} />
                        </span>
                        <RollTag pair={pair} showKind={false} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground w-[5.5rem] shrink-0 text-xs">
                        {t("expenses.diceWaiting")}
                      </span>
                    )}
                    <span className="flex w-16 shrink-0 justify-end text-xs font-semibold">
                      {pays ? (
                        <span className="text-destructive">{t("expenses.dicePays")}</span>
                      ) : safe ? (
                        <span className="text-success">{t("expenses.diceSafe")}</span>
                      ) : tied ? (
                        <span className="text-primary">{t("expenses.diceTiedTag")}</span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.diceLowestStamp")}
                  finale
                  caption={
                    worstRoll && (
                      <span className="text-muted-foreground text-sm font-medium">
                        {t("expenses.diceLowestCaption", { number: diceNumber(worstRoll) })}
                      </span>
                    )
                  }
                />
              )}
            </AnimatePresence>
          </div>
        )}

        <DialogFooter>
          {step === "setup" || !game ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={setup.poolUids.length < 2}
              onClick={startGame}
            >
              {t("expenses.gameStart")}
            </Button>
          ) : over ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={goToSetup}
              >
                {t("expenses.gamePlayAgain")}
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={!showVerdict}
                onClick={applyResult}
              >
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={rolling !== null}
              onClick={roll}
            >
              {t("expenses.diceRoll")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
