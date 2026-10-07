"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import {
  diceNumber,
  diceStanding,
  diceZoneChanges,
  isDiceGameOver,
  latestDiceRoll,
  maxDiceLoserCount,
  nextRoller,
  recordDiceRoll,
  startDiceGame,
  type DiceGame,
  type DicePair,
  type DiceZoneChange,
} from "@/lib/games/dice-cup";
import { stakeShares, type GameStake } from "@/lib/games/payers";
import { randomInt } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import {
  playAppliedSound,
  playBuzzerSound,
  playDiceLandSound,
  playDiceRattleSound,
  playDrumrollSound,
  playStampSound,
  playSwordSound,
} from "@/lib/sound/game-sounds";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { DiceCupFigure, DiceFace } from "@/components/groups/split-game/dice-figure";
import {
  DiceStandings,
  DiceTurnBanner,
  RollTag,
} from "@/components/groups/split-game/dice-standings";
import {
  DiceStechenTakeover,
  STECHEN_HOLD_MS,
  STECHEN_IMPACT_S,
  STECHEN_STAMP_S,
} from "@/components/groups/split-game/dice-stechen-takeover";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** How long the cup rattles before the dice come out. */
const SHAKE_MS = 850;
/** How long the dice sit on the table, readable, before the roll is written down. */
const SETTLE_MS = 1000;
/** A beat between the last roll and the first "caught" takeover. */
const VERDICT_BEAT_MS = 450;
/** Sliding into the pay zone is a tease, not a penalty: the false-start buzzer, quieter. */
const ZONE_BUZZ_VOLUME = 0.55;
/** …and a small jolt of the play area, well below a stamp's. */
const ZONE_SHAKE = 0.4;
/** The faces clashing in a "Stechen" jolt the play area harder. */
const STECHEN_SHAKE = 0.75;

function rollDie(): number {
  return randomInt(1, 6);
}

/** What the last roll did to the zone, kept until the next one: the live region and the "Gerettet!" bubbles read it. */
interface ZoneNews extends DiceZoneChange {
  id: number;
}

/** A "Stechen" on screen: who rolls off, and how many of them pay. */
interface StechenShow {
  id: number;
  uids: string[];
  slots: number;
}

/**
 * Würfelbecher: everyone shakes the cup once and rolls two dice, and the
 * lowest roll pays. Rolls rank like the pub game Mäxchen (21 beats everything,
 * then the doubles, then the rest by the bigger die first); people level on the
 * line roll again — "Stechen" — and only they do. The rules live in
 * `lib/games/dice-cup.ts`; every die is a crypto-random draw made the instant
 * the cup is shaken, the rattle and tumble are only for show.
 *
 * Between rolls the table is live (`diceStanding`, `dice-standings.tsx`): who
 * would pay right now, the roll the next person has to beat, a buzzer for
 * whoever slides into the zone and "Gerettet!" for whoever it pushes out. A
 * tie on the line gets a "Stechen!" takeover before the roll-off. All of it
 * only reads the game state; who pays is still `recordDiceRoll`'s verdict.
 */
export function SplitDiceDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  groupId,
  stake,
  onResolve,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Keys the setup remembered on this device (`game-memory.ts`). */
  groupId?: string;
  /** The bill being played for — each payer's share goes on their slip and in the verdict. */
  stake?: GameStake | null;
  /** Who pays, and everyone who played (stored on the expense). */
  onResolve: (loserUids: string[], playerUids: string[]) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>("setup");
  const setup = useGamePoolSetup(memberUids, maxDiceLoserCount, groupId);
  const { startRound } = useGameRound();
  const [game, setGame] = useState<DiceGame | null>(null);
  // Mirrors `game` so a quick double tap can't roll twice for the same person.
  const gameRef = useRef<DiceGame | null>(null);
  const [rolling, setRolling] = useState<{
    uid: string;
    pair: DicePair;
    stage: "shaking" | "landed";
  } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, catches] = useCatchFlashes();
  const [zoneNews, setZoneNews] = useState<ZoneNews | null>(null);
  const [stechen, setStechen] = useState<StechenShow | null>(null);
  // Monotonic ids for the two above, so back-to-back events each start fresh.
  const eventIdRef = useRef(0);

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
    setZoneNews(null);
    setStechen(null);
    catches.cancel();
  }

  function startGame() {
    startRound();
    setup.remember();
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

  /**
   * Every payer gets a slip of their own. `losers` runs lowest roll first, so
   * it plays backwards: whoever only just missed first, the lowest roll last,
   * as the finale.
   */
  function celebrate(finished: DiceGame) {
    catches.catchEach([...finished.losers].reverse(), { delayMs: VERDICT_BEAT_MS });
  }

  /**
   * A tie on the line: the faces creep in under a drum roll and clash on
   * `STECHEN_IMPACT_S` — the sounds are scheduled on the audio clock from
   * here, like a catch's stamp, so they land on that frame — then the
   * roll-off starts once the takeover has cleared.
   */
  function announceStechen(next: DiceGame) {
    eventIdRef.current += 1;
    setStechen({ id: eventIdRef.current, uids: next.contenders, slots: next.slots });
    playDrumrollSound(STECHEN_IMPACT_S);
    playSwordSound(STECHEN_IMPACT_S);
    playStampSound(STECHEN_STAMP_S);
    catches.shake(STECHEN_SHAKE, STECHEN_IMPACT_S);
    later(STECHEN_HOLD_MS, () => setStechen(null));
  }

  function commit(uid: string, pair: DicePair) {
    const current = gameRef.current;
    if (!current) return;
    const next = recordDiceRoll(current, uid, pair);
    const change = diceZoneChanges(diceStanding(current), diceStanding(next));
    update(next);
    setRolling(null);
    eventIdRef.current += 1;
    setZoneNews({ id: eventIdRef.current, ...change });
    // The last roll's payoff is the catch, a tie's the takeover; the buzzer is for everything in between.
    if (isDiceGameOver(next)) celebrate(next);
    else if (next.rounds.length > current.rounds.length) announceStechen(next);
    else if (change.entered.length > 0) {
      playBuzzerSound(ZONE_BUZZ_VOLUME);
      catches.shake(ZONE_SHAKE, 0);
    }
  }

  function roll() {
    const current = gameRef.current;
    if (!current || rolling || stechen) return;
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
    onResolve(game.losers, setup.poolUids);
    handleOpenChange(false);
  }

  const over = game !== null && isDiceGameOver(game);
  // The verdict waits for the last payer's slip to clear.
  const showVerdict = over && !catches.active;
  const flash = catches.flash;
  const rollerUid = game && !over ? nextRoller(game) : null;
  const stageUid = rolling?.uid ?? rollerUid;
  const tieBreak = game !== null && !over && game.rounds.length > 0;
  const shares = over ? stakeShares(stake, game.losers) : null;
  const flashRoll = game && flash ? latestDiceRoll(game, flash.uid) : null;
  const standing = game ? diceStanding(game) : null;
  const nameList = (uids: readonly string[]) =>
    uids.map((uid) => members[uid].displayName).join(", ");
  const zoneAnnouncement =
    zoneNews && !over
      ? [
          zoneNews.entered.length > 0
            ? t("expenses.diceZoneEnteredLabel", { names: nameList(zoneNews.entered) })
            : "",
          zoneNews.saved.length > 0
            ? t("expenses.diceSavedLabel", { names: nameList(zoneNews.saved) })
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
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
                : flash
                  ? t("expenses.gameCaughtLabel", { name: members[flash.uid].displayName })
                  : stechen
                    ? t("expenses.diceTieBreak", { names: nameList(stechen.uids) })
                    : zoneAnnouncement}
            </p>

            {showVerdict ? (
              <GameResultBanner loserUids={game.losers} members={members} stake={stake} />
            ) : (
              rollerUid &&
              standing && (
                <DiceTurnBanner uid={rollerUid} game={game} standing={standing} members={members} />
              )
            )}

            {tieBreak && !showVerdict && (
              <div className="border-primary/40 bg-primary/5 flex items-center gap-2.5 rounded-xl border border-dashed px-3 py-2">
                <span className="text-primary font-heading shrink-0 text-sm font-black tracking-wide uppercase">
                  {t("expenses.diceTiedTag")}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("expenses.diceTieBreak", { names: nameList(game.contenders) })}
                </span>
              </div>
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

            {standing && (
              <DiceStandings
                game={game}
                standing={standing}
                members={members}
                activeUid={over ? null : stageUid}
                saved={zoneNews && { id: zoneNews.id, uids: zoneNews.saved }}
              />
            )}

            <AnimatePresence>
              {stechen && (
                <DiceStechenTakeover
                  key={stechen.id}
                  uids={stechen.uids}
                  slots={stechen.slots}
                  members={members}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={
                    flash.finale ? t("expenses.diceLowestStamp") : t("expenses.gameCaughtStamp")
                  }
                  finale={flash.finale}
                  caption={
                    <CatchCaption
                      share={shares?.[flash.uid]}
                      stake={stake}
                      detail={
                        flashRoll &&
                        (flash.finale
                          ? t("expenses.diceLowestCaption", { number: diceNumber(flashRoll) })
                          : t("expenses.diceRollCaption", { number: diceNumber(flashRoll) }))
                      }
                    />
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
              disabled={rolling !== null || stechen !== null}
              onClick={roll}
            >
              {t("expenses.diceRoll")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
