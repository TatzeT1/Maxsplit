"use client";

import { useId, useState, type FunctionComponent } from "react";
import { AnimatePresence } from "motion/react";
import { useGameRound } from "@/components/groups/split-game/game-round";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { GameDialogContent } from "@/components/groups/split-game/game-stage";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GamePoolSetupStep } from "@/components/groups/split-game/game-pool-setup-step";
import { GameProgressPips } from "@/components/groups/split-game/game-progress-pips";
import { useCatchFlashes } from "@/components/groups/split-game/use-catch-flashes";
import { EstimateGuessPanel } from "@/components/groups/split-game/estimate/estimate-guess-input";
import { EstimateHandOver } from "@/components/groups/split-game/estimate/estimate-hand-over";
import { EstimateQuestionCard } from "@/components/groups/split-game/estimate/estimate-question-card";
import {
  EstimateCatchFlash,
  EstimateRevealView,
} from "@/components/groups/split-game/estimate/estimate-reveal";
import {
  DuelPlacePicker,
  type DuelPlace,
} from "@/components/groups/split-game/tournament/tournament-mode-picker";
import { useLocale, useT } from "@/components/locale-provider";
import {
  cancelEstimateRound,
  createEstimateRound,
  createLocalEstimateRound,
  submitLocalEstimateGuesses,
} from "@/lib/actions/estimate-rounds";
import { callAction } from "@/lib/call-action";
import {
  ESTIMATE_ANSWER_WINDOWS_MS,
  ESTIMATE_DEFAULT_WINDOW_MS,
  ESTIMATE_MAX_PLAYERS,
  formatEstimateWithUnit,
  maxEstimateLoserCount,
} from "@/lib/games/estimate-input";
import type { GameStake } from "@/lib/games/payers";
import {
  localEstimateErrorKey,
  useLocalEstimateFlow,
  type LocalEstimateActions,
} from "@/lib/games/use-local-estimate-flow";
import { useGamePoolSetup } from "@/lib/games/use-game-pool-setup";
import type { TranslationKey } from "@/lib/i18n/translate";
import { playAppliedSound } from "@/lib/sound/game-sounds";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { GameExpenseDraft, GroupMember } from "@/lib/types";

export interface SplitEstimateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  /** Required: both places to play (one phone, online) talk to the server, and the setup is remembered per group. */
  groupId: string;
  /** The bill being played for — each payer's share goes on their slip and in the verdict. Display only. */
  stake?: GameStake | null;
  /**
   * Who pays, and everyone who played (stored on the expense). `meta` carries
   * the round that decided it, so the expense can claim it (`claimRoundId`).
   */
  onResolve: (
    loserUids: string[],
    playerUids: string[],
    meta?: { estimateRoundId: string },
  ) => void;
  /**
   * The bill an online round books by itself once it is decided.
   * `undefined` = this form can't (editing an expense): online isn't offered.
   * `null` = it could, but the form isn't complete yet.
   */
  expenseDraft?: GameExpenseDraft | null;
  /** An online round started — the caller closes the form and opens its page. */
  onRoundStarted?: (roundId: string) => void;
}

/** The three Server Actions of a one-phone round, handed to the flow hook (it never imports a `"use server"` module itself). */
const LOCAL_ACTIONS: LocalEstimateActions = {
  create: createLocalEstimateRound,
  submit: submitLocalEstimateGuesses,
  cancel: cancelEstimateRound,
};

const WINDOW_LABELS: Record<(typeof ESTIMATE_ANSWER_WINDOWS_MS)[number], TranslationKey> = {
  300_000: "expenses.estimateWindow5",
  900_000: "expenses.estimateWindow15",
  3_600_000: "expenses.estimateWindow60",
};

/** "Auch freche Fun Facts": a labelled switch row with a 44 px target. */
function FunToggle({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const t = useT();
  const id = useId();
  return (
    <div className="bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-xl p-3 ring-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id}>{t("expenses.estimateFunLabel")}</Label>
        <span id={`${id}-hint`} className="text-muted-foreground text-xs">
          {t("expenses.estimateFunHint")}
        </span>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        className="focus-visible:ring-ring/50 flex h-11 w-14 shrink-0 touch-manipulation items-center justify-center rounded-full outline-none focus-visible:ring-3"
      >
        <span
          aria-hidden="true"
          className={cn(
            "relative h-7 w-12 rounded-full border transition-colors duration-(--duration-fast)",
            checked ? "border-primary bg-primary" : "border-border bg-muted",
          )}
        >
          <span
            className={cn(
              "bg-background absolute top-0.5 size-5.5 rounded-full shadow-sm transition-[left] duration-(--duration-fast)",
              checked ? "left-[calc(100%-1.5rem)]" : "left-0.5",
            )}
          />
        </span>
      </button>
    </div>
  );
}

/** Online only: how long everyone has to guess. */
function WindowPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (windowMs: number) => void;
}) {
  const t = useT();
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label id={`${id}-label`}>{t("expenses.estimateWindowLabel")}</Label>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-3 gap-2">
        {ESTIMATE_ANSWER_WINDOWS_MS.map((windowMs) => {
          const selected = value === windowMs;
          return (
            <button
              key={windowMs}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(windowMs)}
              className={cn(
                "focus-visible:ring-ring/50 min-h-11 touch-manipulation rounded-xl border px-3 text-sm font-medium transition-colors duration-(--duration-fast) outline-none select-none focus-visible:ring-3",
                selected
                  ? "border-primary/40 bg-primary/5 shadow-e1"
                  : "border-border bg-background",
              )}
            >
              {t(WINDOW_LABELS[windowMs])}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">{t("expenses.estimateWindowHint")}</p>
    </div>
  );
}

/**
 * Schätzfragen: one question, one number, everyone guesses in secret — on one
 * phone or online. The dialog owns the setup (pool, payer count, the fun
 * toggle, where to play) and the one-phone flow; the state machine lives in
 * `useLocalEstimateFlow`, the screens in `split-game/estimate/`.
 *
 * The question comes from the server-only bank, so starting needs a
 * connection (every control that saves is disabled offline and goes through
 * `callAction`). The hidden guesses live in memory only until the one call
 * that scores them; nothing a guess says is ever rendered before the reveal.
 */
export const SplitEstimateDialog: FunctionComponent<SplitEstimateDialogProps> = ({
  open,
  onOpenChange,
  members,
  memberUids,
  groupId,
  stake,
  onResolve,
  expenseDraft,
  onRoundStarted,
}) => {
  const t = useT();
  const { locale } = useLocale();
  const online = useOnline();
  const { startRound } = useGameRound();
  const setup = useGamePoolSetup(memberUids, maxEstimateLoserCount, groupId);
  const { poolUids, loserCount } = setup;
  const [stageRef, catches] = useCatchFlashes();

  // Lives in the dialog, survives "Neu starten", and is forgotten when the dialog closes.
  const [includeFun, setIncludeFun] = useState(false);
  const [place, setPlace] = useState<DuelPlace>("device");
  const [windowMs, setWindowMs] = useState<number>(ESTIMATE_DEFAULT_WINDOW_MS);
  const [onlineStarting, setOnlineStarting] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** The sr-only status: the reveal (and a Stechfrage) once per stage, never before. */
  const [announcement, setAnnouncement] = useState("");

  const flow = useLocalEstimateFlow({
    groupId,
    poolUids,
    targetLoserCount: loserCount,
    includeFun,
    actions: LOCAL_ACTIONS,
    onRoundStarted: () => {
      // Every round counts, "Neu starten" included (the "n. Versuch" notice and `Expense.game.attempt`).
      startRound();
      setup.remember();
    },
  });

  const hasPlaceholder = poolUids.some((uid) => members[uid]?.isPlaceholder === true);
  const playersWithPhone = poolUids.filter((uid) => members[uid]?.isPlaceholder !== true);
  const onlineUnavailableHint =
    expenseDraft === undefined || !onRoundStarted
      ? t("expenses.duelPlaceOnlineEditHint")
      : hasPlaceholder
        ? t("expenses.estimatePlaceOnlinePlaceholderHint")
        : playersWithPhone.length < 2
          ? t("expenses.duelPlaceOnlineMinHint")
          : null;
  const setupPlace: DuelPlace = onlineUnavailableHint === null ? place : "device";

  // The server refuses a bigger pool (`invalid-pool`); say so before it has to.
  const tooManyPlayers = poolUids.length > ESTIMATE_MAX_PLAYERS;
  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";
  const starting = flow.busy || onlineStarting;
  const startErrorText =
    setupPlace === "online"
      ? onlineError
      : flow.errorCode !== null && flow.step === "setup"
        ? t(localEstimateErrorKey(flow.errorCode, "start"))
        : null;

  async function startOnline() {
    // The round books the bill by itself at the end — it has to be complete now.
    if (!expenseDraft || !onRoundStarted) {
      setOnlineError(t("expenses.duelNeedsExpense"));
      return;
    }
    setOnlineStarting(true);
    setOnlineError(null);
    const result = await callAction(() =>
      createEstimateRound({
        groupId,
        poolUids,
        targetLoserCount: loserCount,
        includeFun,
        answerWindowMs: windowMs,
        autoBook: expenseDraft,
      }),
    );
    setOnlineStarting(false);
    if (!result.ok) {
      setOnlineError(t(localEstimateErrorKey(result.error, "start")));
      return;
    }
    setup.remember();
    onRoundStarted(result.data.roundId);
  }

  function startGame() {
    if (tooManyPlayers) return;
    if (setupPlace === "online") {
      void startOnline();
      return;
    }
    void flow.start();
  }

  /** Everything a closed dialog forgets (the fun toggle included). */
  function forget() {
    catches.cancel();
    setIncludeFun(false);
    setOnlineError(null);
    setAnnouncement("");
    setDiscardOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      // Locked guesses that were never scored: ask first (the retry is safe, a closed dialog is not).
      if (flow.needsDiscardConfirm) {
        setDiscardOpen(true);
        return;
      }
      flow.reset();
      forget();
    }
    onOpenChange(nextOpen);
  }

  function discardAndClose() {
    forget();
    // A failed cancel is reported by the hook (console.error) and never blocks the close.
    void flow.discard();
    onOpenChange(false);
  }

  function restart() {
    flow.reset();
    catches.cancel();
    setAnnouncement("");
  }

  function applyResult() {
    const { resolution } = flow;
    if (!resolution) return;
    playAppliedSound();
    onResolve(resolution.loserUids, resolution.playerUids, {
      estimateRoundId: resolution.estimateRoundId,
    });
    flow.reset();
    forget();
    onOpenChange(false);
  }

  /** The reveal has played out: say it once for screen readers, then move on (a Stechfrage or the verdict). */
  function handleSettled() {
    const { round, revealStageIndex } = flow;
    const stage = round?.stages[revealStageIndex];
    const reveal = stage?.reveal;
    if (round && stage && reveal) {
      const parts = [
        t("expenses.estimateAnnounceReveal", {
          truth: formatEstimateWithUnit(reveal.truthMilli, stage.question, locale),
        }),
      ];
      if (reveal.next === "stechen") {
        parts.push(
          t("expenses.estimateAnnounceStechen", {
            names: reveal.contested
              .map((uid) => round.entrants[uid]?.displayName ?? nameOf(uid))
              .join(", "),
          }),
        );
      }
      setAnnouncement(parts.join(" "));
    }
    flow.continueFromReveal();
  }

  const { step, stage, round } = flow;
  const flash = catches.flash;
  const showFooter = step === "setup" || step === "done";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <GameDialogContent>
        {/*
          Over the whole dialog, a direct child of the stage frame (like the
          scratch card's slip): no ancestor may set `position`, `transform` or
          `overflow`, or the slip would be clipped and aimed at the wrong box.
        */}
        <AnimatePresence>
          {flash && round && (
            <EstimateCatchFlash
              key={flash.id}
              flash={flash}
              round={round}
              stageIndex={flow.revealStageIndex}
              members={members}
              stake={stake}
            />
          )}
        </AnimatePresence>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">🎯</span>
            {t("expenses.estimateTitle")}
          </DialogTitle>
          {step === "setup" && <DialogDescription>{t("expenses.estimateIntro")}</DialogDescription>}
        </DialogHeader>

        <p role="status" className="sr-only">
          {announcement}
        </p>

        {step === "setup" && (
          <div className="flex flex-col gap-4">
            <DuelPlacePicker
              place={setupPlace}
              onPlaceChange={setPlace}
              onlineUnavailableHint={onlineUnavailableHint}
              onlineHint={t("expenses.estimatePlaceOnlineHint")}
            />
            <GamePoolSetupStep
              memberUids={memberUids}
              members={members}
              poolUids={poolUids}
              onTogglePoolMember={setup.togglePoolMember}
              loserCount={loserCount}
              maxLoserCount={setup.maxLoserCount}
              onStepLoserCount={setup.stepLoserCount}
              stepperDirection={setup.stepperDirection}
              countHint={t("expenses.estimateCountHint")}
              countIcon="🎯"
            />
            <FunToggle checked={includeFun} onChange={setIncludeFun} />
            {setupPlace === "online" && <WindowPicker value={windowMs} onChange={setWindowMs} />}
            {!online && (
              <p role="alert" className="text-destructive text-sm">
                {t("expenses.estimateNeedsConnection")}
              </p>
            )}
            {tooManyPlayers && (
              <p role="alert" className="text-destructive text-sm">
                {t("expenses.estimateTooManyPlayers", { max: ESTIMATE_MAX_PLAYERS })}
              </p>
            )}
            {startErrorText && (
              <p role="alert" className="text-destructive text-sm">
                {startErrorText}
              </p>
            )}
          </div>
        )}

        {step === "intro" && stage && (
          <div className="flex flex-col gap-4">
            <EstimateQuestionCard
              question={stage.question}
              stageIndex={stage.index}
              stageKind={stage.kind}
            />
            {stage.kind === "stechen" && (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex flex-wrap justify-center gap-3">
                  {flow.seats.map((uid) => (
                    <span key={uid} className="flex flex-col items-center gap-1 text-xs">
                      <GameAvatar name={nameOf(uid)} className="size-10 text-base" />
                      {nameOf(uid)}
                    </span>
                  ))}
                </div>
                <p className="text-muted-foreground text-sm text-balance">
                  {stage.slots === 1
                    ? t("expenses.estimateStechenOne")
                    : t("expenses.estimateStechenMany", { count: stage.slots })}
                </p>
              </div>
            )}
            <div className="flex flex-col items-center gap-3 text-center">
              <h2 className="font-heading text-xl leading-tight font-medium text-balance">
                {t("expenses.estimateIntroTitle")}
              </h2>
              <p className="text-muted-foreground text-sm text-balance">
                {t("expenses.estimateIntroBody")}
              </p>
              <Button type="button" size="lg" className="touch-manipulation" onClick={flow.begin}>
                {t("expenses.estimateIntroGo")}
              </Button>
            </div>
          </div>
        )}

        {step === "handover" && flow.seatUid && (
          <EstimateHandOver
            key={`${flow.roundId}:${stage?.index}:${flow.seatUid}`}
            name={nameOf(flow.seatUid)}
            position={flow.seatPosition}
            total={flow.seatCount}
            onReady={flow.ready}
          />
        )}

        {step === "guess" && stage && flow.seatUid && (
          <EstimateGuessPanel
            key={`${flow.roundId}:${stage.index}:${flow.seatUid}`}
            question={stage.question}
            stageIndex={stage.index}
            stageKind={stage.kind}
            heading={t("expenses.estimateGuessSeat", { name: nameOf(flow.seatUid) })}
            onLock={flow.lock}
          />
        )}

        {step === "allin" && (
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="font-heading text-xl leading-tight font-medium text-balance">
              {t("expenses.estimateAllIn")}
            </h2>
            <p className="text-muted-foreground text-sm text-balance">
              {t("expenses.estimateAllInBody")}
            </p>
            <GameProgressPips
              revealedCount={flow.lockedCount}
              target={flow.seatCount}
              progressLabel={t("expenses.estimateProgress", {
                done: flow.lockedCount,
                total: flow.seatCount,
              })}
            />
            {flow.errorCode !== null && (
              <p role="alert" className="text-destructive text-sm">
                {t(localEstimateErrorKey(flow.errorCode, "submit"))}
              </p>
            )}
            {/* As soon as the connection is gone — not only after a failed call. The guesses stay on this phone. */}
            {!online ? (
              <p role="status" className="text-muted-foreground text-sm text-balance">
                {t("expenses.estimateKeepOpen")}
              </p>
            ) : (
              flow.errorCode !== null && (
                <p className="text-muted-foreground text-sm text-balance">
                  {t("expenses.estimateKeepOpen")}
                </p>
              )
            )}
            <Button
              type="button"
              size="lg"
              className="touch-manipulation"
              disabled={!online || flow.busy}
              onClick={() => void flow.submit()}
            >
              {flow.busy
                ? t("expenses.estimateEvaluating")
                : flow.errorCode !== null
                  ? t("expenses.estimateRetry")
                  : t("expenses.estimateReveal")}
            </Button>
          </div>
        )}

        {(step === "reveal" || step === "done") && round && flow.revealStageIndex >= 0 && (
          <div ref={stageRef} className="flex flex-col gap-3">
            <EstimateRevealView
              key={`${round.id}:${flow.revealStageIndex}`}
              round={round}
              stageIndex={flow.revealStageIndex}
              members={members}
              stake={stake}
              animate
              inDialog
              catches={catches}
              onSettled={handleSettled}
            />
          </div>
        )}

        {showFooter && (
          <DialogFooter>
            {step === "setup" ? (
              <Button
                type="button"
                size="lg"
                className="flex-1"
                disabled={poolUids.length < 2 || tooManyPlayers || starting || !online}
                onClick={startGame}
              >
                {starting
                  ? t("common.loading")
                  : setupPlace === "online"
                    ? t("expenses.estimateOnlineStart")
                    : t("expenses.estimateStart")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={restart}
                >
                  {t("expenses.duelRestart")}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="flex-1"
                  disabled={!flow.resolution}
                  onClick={applyResult}
                >
                  {t("expenses.gameApply")}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </GameDialogContent>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("expenses.estimateDiscardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("expenses.estimateDiscardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("expenses.estimateKeepPlaying")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardAndClose}>
              {t("expenses.estimateDiscard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
