"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { useGameRound } from "@/components/groups/split-game/game-round";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GameDialogContent, StageScale } from "@/components/groups/split-game/game-stage";
import { useT } from "@/components/locale-provider";
import {
  BALLOON_MAX_PUMPS_PER_TURN,
  balloonHolder,
  canPassBalloon,
  canPumpBalloon,
  isBalloonGameOver,
  maxBalloonLoserCount,
  passBalloon,
  pumpBalloon,
  startBalloonGame,
  type BalloonRandom,
  type BalloonState,
} from "@/lib/games/balloon";
import { memberColor } from "@/lib/games/member-colors";
import { stakeShareAt, type GameStake } from "@/lib/games/payers";
import { randomInt, secureShuffle } from "@/lib/games/random";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { playAppliedSound, playPopSound, playPumpSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { BalloonFigure, PopBurst } from "@/components/groups/split-game/balloon-figure";
import { DuelTurnBanner } from "@/components/groups/split-game/duel-turn-banner";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type { GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/** How long the bang and its flying rubber hold the stage before the "caught" takeover. */
const POP_BEAT_MS = 700;

/** The burst point and the seating are drawn from crypto randomness, like every other "who pays" decision. */
const BALLOON_RANDOM: BalloonRandom = { int: randomInt, shuffle: secureShuffle };

/**
 * Ballon ("pump until it bursts"): the phone goes round the table and each
 * person pumps the balloon once to three times. Nobody knows how much air it
 * takes, and whoever's pump makes it go off pays. The rules live in
 * `lib/games/balloon.ts`; this component is the stage, the pump and the bang.
 */
export function SplitBalloonDialog({
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
  const [step, setStep] = useState<Step>("setup");
  const setup = useGamePoolSetup(memberUids, maxBalloonLoserCount, groupId);
  const { startRound } = useGameRound();
  const [game, setGame] = useState<BalloonState | null>(null);
  // Mirrors `game` so two quick taps in one frame both see the newest state.
  const gameRef = useRef<BalloonState | null>(null);
  const [popping, setPopping] = useState<{ id: number; color: string } | null>(null);
  const idRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [stageRef, catches] = useCatchFlashes();

  useEffect(() => {
    // The same array for the component's whole lifetime — only ever pushed to.
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function clearTimers() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }

  function update(next: BalloonState | null) {
    gameRef.current = next;
    setGame(next);
  }

  function resetStage() {
    clearTimers();
    setPopping(null);
    catches.cancel();
  }

  function startGame() {
    startRound();
    setup.remember();
    update(startBalloonGame(setup.poolUids, setup.loserCount, BALLOON_RANDOM));
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

  function pump() {
    const current = gameRef.current;
    if (!current || popping || catches.isActive()) return;
    const result = pumpBalloon(current, BALLOON_RANDOM);
    if (!result) return;
    update(result.state);
    if (result.popped === null) {
      playPumpSound(result.state.pumps / result.state.maxPumps);
      return;
    }

    const popperUid = result.popped;
    const popId = ++idRef.current;
    playPopSound();
    catches.shake(1.2, 0);
    setPopping({ id: popId, color: memberColor(members[popperUid].displayName) });
    const beat = setTimeout(() => {
      setPopping(null);
      catches.catchOne(popperUid, { finale: isBalloonGameOver(result.state) });
    }, POP_BEAT_MS);
    timersRef.current.push(beat);
  }

  function pass() {
    const current = gameRef.current;
    if (!current || popping || catches.isActive()) return;
    const next = passBalloon(current);
    if (next) update(next);
  }

  function applyResult() {
    if (!game) return;
    playAppliedSound();
    onResolve([...game.losers], setup.poolUids);
    handleOpenChange(false);
  }

  const over = game !== null && isBalloonGameOver(game);
  const busy = popping !== null || catches.active;
  const flash = catches.flash;
  // The verdict waits for the last catch's takeover to clear, as the wheel's does.
  const showVerdict = over && !busy;
  const holderUid = game && !over ? balloonHolder(game) : null;
  const holderName = holderUid ? members[holderUid].displayName : "";
  const lastLoserUid = game?.losers[game.losers.length - 1];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎈</span>
            {t("expenses.balloonTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.balloonIntro")}</DialogDescription>}
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
            countHint={t("expenses.balloonCountHint")}
            countIcon="🎈"
          />
        ) : (
          <div ref={stageRef} className="relative flex flex-col gap-3">
            <p aria-live="polite" className="sr-only">
              {popping || (flash && lastLoserUid)
                ? t("expenses.balloonPoppedLabel", {
                    name: members[lastLoserUid ?? ""]?.displayName ?? "",
                  })
                : holderUid
                  ? t("expenses.balloonTurnLabel", { name: holderName })
                  : ""}
            </p>

            {showVerdict ? (
              <GameResultBanner loserUids={[...game.losers]} members={members} stake={stake} />
            ) : (
              holderUid && (
                <DuelTurnBanner
                  uid={holderUid}
                  members={members}
                  hint={t("expenses.balloonHint")}
                  aside={<PumpDots used={game.turnPumps} />}
                />
              )
            )}

            <GameProgressPips
              revealedCount={game.losers.length}
              target={game.targetLoserCount}
              progressLabel={t("expenses.balloonProgress", {
                found: game.losers.length,
                target: game.targetLoserCount,
              })}
            />

            {!showVerdict && (
              <div className="relative flex min-h-[260px] items-end justify-center overflow-hidden rounded-xl border bg-linear-to-b from-sky-200/40 to-transparent py-2">
                <StageScale width={192} height={250} className="self-end">
                  {/* A fresh balloon per payer: the key restarts it small. */}
                  {!over && !popping && (
                    <BalloonFigure
                      key={game.losers.length}
                      fullness={game.pumps / game.maxPumps}
                      color={memberColor(holderName)}
                    />
                  )}
                  {popping && <PopBurst key={popping.id} color={popping.color} />}
                </StageScale>
              </div>
            )}

            <AnimatePresence>
              {flash && (
                <CatchFlash
                  key={flash.id}
                  seed={flash.id}
                  name={members[flash.uid].displayName}
                  stampLabel={t("expenses.balloonPoppedStamp")}
                  finale={flash.finale}
                  caption={
                    <CatchCaption
                      // Booked in pop order and the payer count is set, so a
                      // popper's share is known the moment it bangs.
                      share={stakeShareAt(
                        stake,
                        game.targetLoserCount,
                        game.losers.indexOf(flash.uid),
                      )}
                      stake={stake}
                      detail={t("expenses.balloonProgress", {
                        found: game.losers.length,
                        target: game.targetLoserCount,
                      })}
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
                disabled={busy}
                onClick={applyResult}
              >
                {t("expenses.gameApply")}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                disabled={busy || !canPassBalloon(game)}
                onClick={pass}
              >
                {t("expenses.balloonPass")}
              </Button>
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={busy || !canPumpBalloon(game)}
                onClick={pump}
              >
                {t("expenses.balloonPump")}
              </Button>
            </>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}

/** Three little dots: the pumps the holder has used this turn, out of the three they may take. */
function PumpDots({ used }: { used: number }) {
  const t = useT();
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="sr-only">
        {t("expenses.balloonPumpsLabel", { used, max: BALLOON_MAX_PUMPS_PER_TURN })}
      </span>
      {Array.from({ length: BALLOON_MAX_PUMPS_PER_TURN }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "size-2.5 rounded-full border transition-colors duration-(--duration-fast)",
            index < used ? "bg-primary border-primary" : "border-foreground/30",
          )}
        />
      ))}
    </span>
  );
}
