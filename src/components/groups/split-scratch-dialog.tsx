"use client";

import { useState } from "react";
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
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { useT } from "@/components/locale-provider";
import { maxPayerCount, stakeShares, type GameStake } from "@/lib/games/payers";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import { useSequentialDraw } from "@/lib/games/use-sequential-draw";
import { playAppliedSound, playMissSound } from "@/lib/sound/game-sounds";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { ScratchCard } from "@/components/groups/split-game/scratch-card";
import {
  DuelPlacePicker,
  type DuelPlace,
} from "@/components/groups/split-game/tournament/tournament-mode-picker";
import { createLuckRound } from "@/lib/actions/luck-rounds";
import { callAction } from "@/lib/call-action";
import { useOnline } from "@/lib/use-online";
import type { GameExpenseDraft, GroupMember } from "@/lib/types";

type Step = "setup" | "playing";

/**
 * Rubbellos ("who pays" scratch cards): unlike the wheel and slot machine,
 * every pool member gets their own card rather than taking turns on a
 * shared board, so the round isn't "done" until everyone has checked
 * theirs — not just until the losers are found. That's why this game
 * tracks its own `scratchedUids` instead of `useSequentialDraw`'s
 * reveal-count; it only borrows the hook for the fixed, crypto-random set
 * of who's a loser this round.
 */
export function SplitScratchDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  groupId,
  stake,
  onResolve,
  expenseDraft,
  onRoundStarted,
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
  /**
   * The bill an online round books by itself once every card is scratched.
   * `undefined` = this form can't (editing an expense): online isn't offered.
   * `null` = it could, but the form isn't complete yet.
   */
  expenseDraft?: GameExpenseDraft | null;
  /** An online round started — the caller closes the form and opens its page. */
  onRoundStarted?: (roundId: string) => void;
}) {
  const t = useT();
  const { startRound } = useGameRound();
  const [step, setStep] = useState<Step>("setup");
  // Everyone but one at most — on one phone and online alike: a round where
  // every card is a Niete has nothing to scratch for.
  const setup = useGamePoolSetup(memberUids, maxPayerCount, groupId);
  const { poolUids, loserCount } = setup;
  const [scratchedUids, setScratchedUids] = useState<string[]>([]);
  const [stageRef, catches] = useCatchFlashes();
  const draw = useSequentialDraw();
  const online = useOnline();
  // Online: everyone scratches their own card on their own phone (ADR-005).
  const [place, setPlace] = useState<DuelPlace>("device");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const canOfferOnline = !!groupId && expenseDraft !== undefined && !!onRoundStarted;

  // Two people with an account are needed to scratch anywhere but here.
  const playersWithPhone = poolUids.filter((uid) => members[uid]?.isPlaceholder !== true);
  const onlineUnavailableHint =
    expenseDraft === undefined
      ? t("expenses.duelPlaceOnlineEditHint")
      : playersWithPhone.length < 2
        ? t("expenses.duelPlaceOnlineMinHint")
        : null;
  const setupPlace: DuelPlace = canOfferOnline && onlineUnavailableHint === null ? place : "device";

  async function startOnline() {
    // The round books the bill by itself at the end — it has to be complete now.
    if (!expenseDraft || !groupId || !onRoundStarted) {
      setStartError(t("expenses.duelNeedsExpense"));
      return;
    }
    setStarting(true);
    setStartError(null);
    const result = await callAction(() =>
      createLuckRound({
        groupId,
        gameId: "scratch",
        poolUids,
        targetLoserCount: loserCount,
        autoBook: expenseDraft,
      }),
    );
    setStarting(false);
    if (!result.ok) {
      setStartError(
        result.error === "round-running"
          ? t("expenses.luckRoundRunning")
          : result.error === "network"
            ? t("errors.notSaved")
            : t("expenses.luckStartError"),
      );
      return;
    }
    setup.remember();
    onRoundStarted(result.data.roundId);
  }

  function startGame() {
    if (setupPlace === "online") {
      void startOnline();
      return;
    }
    startRound();
    setup.remember();
    draw.start(poolUids, loserCount);
    setScratchedUids([]);
    setStep("playing");
  }

  function goToSetup() {
    draw.reset();
    setScratchedUids([]);
    catches.cancel();
    setStep("setup");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setStep("setup");
      draw.reset();
      setScratchedUids([]);
      catches.cancel();
    }
    onOpenChange(nextOpen);
  }

  function revealCard(uid: string) {
    if (scratchedUids.includes(uid)) return;
    setScratchedUids((current) => [...current, uid]);
    if (!draw.losers.includes(uid)) {
      playMissSound();
      return;
    }
    // Presentation only: is this the last losing card still under foil?
    const losersFound = scratchedUids.filter((id) => draw.losers.includes(id)).length + 1;
    catches.catchOne(uid, { finale: losersFound >= draw.losers.length });
  }

  function applyResult() {
    playAppliedSound();
    onResolve(draw.losers, poolUids);
    handleOpenChange(false);
  }

  const allScratched = poolUids.length > 0 && scratchedUids.length >= poolUids.length;
  // The verdict waits for the last catch's takeover to clear, as the
  // lottery's does — otherwise its bloom and rise play out hidden behind it.
  const showVerdict = allScratched && !catches.active;
  const flash = catches.flash;
  // The losing cards are fixed at the start, so every slip's share is final.
  const shares = stakeShares(stake, draw.losers);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        x-clipped: the impact shake jolts the play area sideways, and without
        this the scrim and cards would briefly overhang the scroll box and
        flash a horizontal scrollbar.
      */}
      <GameDialogContent>
        {/*
          Over the whole dialog rather than just the cards, like the
          lottery's takeover: with two or three players the card grid is
          shorter than the till slip.
        */}
        <AnimatePresence>
          {flash && (
            <CatchFlash
              key={flash.id}
              seed={flash.id}
              name={members[flash.uid].displayName}
              stampLabel={t("expenses.gameCaughtStamp")}
              finale={flash.finale}
              className="inset-0 z-50 rounded-xl"
              caption={
                <CatchCaption
                  share={shares?.[flash.uid]}
                  stake={stake}
                  // "Du zahlst!" says the same as the amount line, minus the amount.
                  detail={shares ? undefined : t("expenses.scratchResultPay")}
                />
              }
            />
          )}
        </AnimatePresence>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎫</span>
            {t("expenses.scratchTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.scratchIntro")}</DialogDescription>}
        </DialogHeader>

        {step === "setup" ? (
          <div className="flex flex-col gap-4">
            {canOfferOnline && (
              <DuelPlacePicker
                place={setupPlace}
                onPlaceChange={setPlace}
                onlineUnavailableHint={onlineUnavailableHint}
                onlineHint={t("expenses.luckPlaceOnlineHint")}
              />
            )}
            <GamePoolSetupStep
              memberUids={memberUids}
              members={members}
              poolUids={poolUids}
              onTogglePoolMember={setup.togglePoolMember}
              loserCount={loserCount}
              maxLoserCount={setup.maxLoserCount}
              onStepLoserCount={setup.stepLoserCount}
              stepperDirection={setup.stepperDirection}
              countHint={t("expenses.scratchCountHint")}
              countIcon="🎫"
            />
            {setupPlace === "online" && !online && (
              <p role="alert" className="text-destructive text-sm">
                {t("offline.gameNeedsConnection")}
              </p>
            )}
            {startError && (
              <p role="alert" className="text-destructive text-sm">
                {startError}
              </p>
            )}
          </div>
        ) : (
          <div ref={stageRef} className="flex flex-col gap-3">
            {showVerdict ? (
              <GameResultBanner loserUids={draw.losers} members={members} stake={stake} />
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {t("expenses.scratchCardRevealHint")}
              </p>
            )}

            <GameProgressPips
              revealedCount={scratchedUids.length}
              target={poolUids.length}
              progressLabel={t("expenses.scratchProgress", {
                found: scratchedUids.length,
                target: poolUids.length,
              })}
            />

            <div className="mx-auto grid w-full max-w-lg grid-cols-3 gap-2">
              {poolUids.map((uid) => (
                <ScratchCard
                  key={uid}
                  name={members[uid].displayName}
                  isLoser={draw.losers.includes(uid)}
                  scratched={scratchedUids.includes(uid)}
                  onReveal={() => revealCard(uid)}
                />
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "setup" ? (
            <Button
              type="button"
              size="lg"
              className="flex-1"
              disabled={poolUids.length < 2 || starting || (setupPlace === "online" && !online)}
              onClick={startGame}
            >
              {starting
                ? t("common.loading")
                : setupPlace === "online"
                  ? t("expenses.luckOnlineStart")
                  : t("expenses.gameStart")}
            </Button>
          ) : allScratched ? (
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
              {/* Waits for the last slip, like the verdict: it's the same moment. */}
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
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={goToSetup}
            >
              {t("expenses.gamePlayAgain")}
            </Button>
          )}
        </DialogFooter>
      </GameDialogContent>
    </Dialog>
  );
}
