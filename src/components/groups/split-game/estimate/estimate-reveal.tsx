"use client";

import { AnimatePresence } from "motion/react";
import { useReducedMotion } from "motion/react";
import { useEffect, useEffectEvent, useState } from "react";
import { useLocale, useT } from "@/components/locale-provider";
import { CatchCaption } from "@/components/groups/split-game/catch-caption";
import { CatchFlash } from "@/components/groups/split-game/celebration";
import {
  DiceStechenTakeover,
  STECHEN_HOLD_MS,
  STECHEN_IMPACT_S,
  STECHEN_STAMP_S,
} from "@/components/groups/split-game/dice-stechen-takeover";
import {
  estimateErrorLabel,
  formatAnswerTime,
} from "@/components/groups/split-game/estimate/estimate-format";
import {
  EstimateNumberLine,
  pinDropGapMs,
  type EstimateLineStep,
} from "@/components/groups/split-game/estimate/estimate-number-line";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { GameResultBanner } from "@/components/groups/split-game/game-result-banner";
import type {
  CatchFlashState,
  useCatchFlashes,
} from "@/components/groups/split-game/use-catch-flashes";
import {
  describeEstimateDistances,
  formatEstimateWithUnit,
  roundPayers,
  type EstimateLocale,
} from "@/lib/games/estimate-input";
import { stakeShareAt, type GameStake } from "@/lib/games/payers";
import { playDrumrollSound, playStampSound, playSwordSound } from "@/lib/sound/game-sounds";
import { cn } from "@/lib/utils";
import type { EstimateReveal, EstimateRound, EstimateStage, GroupMember } from "@/lib/types";

/** What `catches` is: the second element of `useCatchFlashes()`'s tuple (the first is the shake ref). */
export type EstimateCatches = ReturnType<typeof useCatchFlashes>[1];

/** The fields of a round the reveal reads (G.1). */
export type EstimateRevealRound = Pick<
  EstimateRound,
  "id" | "order" | "targetLoserCount" | "stages" | "loserUids" | "resolvedBy" | "entrants" | "mode"
>;

/** Pins have landed this long after the last one starts, then the truth comes. */
const PIN_SETTLE_MS = 450;
/** The truth pin after the last pin (spec: +700 ms). */
const TRUTH_DELAY_MS = 700;
/** The ranking stays on screen alone for a beat before the slips start. */
const RANKING_BEAT_MS = 900;
/** The impact shake of the Stechfrage takeover, like the dice game's. */
const STECHEN_SHAKE = 0.75;

type Phase = "pins" | "truth" | "all" | "slips" | "lot" | "stechen" | "end";

const PHASE_ORDER: readonly Phase[] = ["pins", "truth", "all", "slips", "lot", "stechen", "end"];
const atLeast = (phase: Phase, other: Phase) =>
  PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(other);

/** A uid's name: the round's name snapshot first (what the table played under), then the live member, never "?"-crashes. */
function nameFor(
  uid: string,
  round: Pick<EstimateRound, "entrants">,
  members: Record<string, GroupMember>,
): string {
  if (Object.hasOwn(round.entrants, uid)) return round.entrants[uid].displayName;
  if (Object.hasOwn(members, uid)) return members[uid].displayName;
  return "?";
}

/** `members` completed with the round's snapshots, for components that index `members[uid].displayName`. */
function withEntrants(
  round: Pick<EstimateRound, "entrants">,
  members: Record<string, GroupMember>,
): Record<string, GroupMember> {
  const merged: Record<string, GroupMember> = { ...members };
  for (const [uid, entrant] of Object.entries(round.entrants)) {
    if (Object.hasOwn(merged, uid)) continue;
    merged[uid] = {
      displayName: entrant.displayName,
      photoURL: "",
      joinedAt: "",
      role: "member",
      isPlaceholder: entrant.isPlaceholder,
    };
  }
  return merged;
}

function errorTexts(stage: EstimateStage, reveal: EstimateReveal, locale: EstimateLocale) {
  return describeEstimateDistances(
    reveal.results.map((row) => ({ uid: row.uid, distance: row.distance })),
    stage.question,
    locale,
  );
}

/**
 * The slip of one payer of a stage — the piece the DIALOG / PAGE renders as a
 * direct child of its stage frame (`<AnimatePresence>{flash && <EstimateCatchFlash
 * key={flash.id} … />}</AnimatePresence>`), so the slip's containing block is the
 * fixed frame and covers the whole screen. `EstimateRevealView` only calls
 * `catches.catchEach`; this component turns `flash.uid` into the stamp
 * ("Daneben!" / "Kein Tipp!" / "Das Los!") and the caption (the share, the
 * error text). The share is final the moment it shows: payers are booked
 * furthest first, stage by stage, and later stages only append.
 */
export function EstimateCatchFlash({
  flash,
  round,
  stageIndex,
  members,
  stake,
  className = "inset-0 z-50 rounded-xl",
}: {
  flash: CatchFlashState;
  round: EstimateRevealRound;
  stageIndex: number;
  members: Record<string, GroupMember>;
  stake?: GameStake | null;
  className?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const stage = round.stages[stageIndex];
  const reveal = stage?.reveal ?? null;
  if (!stage || !reveal) return null;

  const row = reveal.results.find((result) => result.uid === flash.uid);
  const byLot = reveal.lotPayers?.includes(flash.uid) ?? false;
  const noGuess = !row || row.guessMilli === null;
  const texts = errorTexts(stage, reveal, locale);
  const errorText = texts[flash.uid] ?? null;
  const detail = byLot
    ? t("expenses.estimateCatchDetailLot")
    : noGuess
      ? t("expenses.estimateNoGuess")
      : errorText
        ? estimateErrorLabel(t, errorText)
        : undefined;
  const payerIndex = roundPayers(round.stages).indexOf(flash.uid);
  const share = payerIndex === -1 ? null : stakeShareAt(stake, round.targetLoserCount, payerIndex);

  return (
    <CatchFlash
      seed={flash.id}
      name={nameFor(flash.uid, round, members)}
      stampLabel={
        byLot
          ? t("expenses.estimateCatchStampLot")
          : noGuess
            ? t("expenses.estimateCatchStampNoGuess")
            : t("expenses.estimateCatchStamp")
      }
      finale={flash.finale}
      className={className}
      caption={<CatchCaption share={share} stake={stake} detail={detail} />}
    />
  );
}

/**
 * One revealed stage: number line, then the truth (last, with source and year),
 * the ranking, the catch slips for the stage's payers and — per `reveal.next` —
 * the verdict banner, the Stechfrage takeover or the lot.
 *
 * Renders nothing for a stage that is not revealed: a guessing stage holds no
 * truth, and this view never reads one from anywhere else. `animate: false` (a
 * finished round opened later, a history entry) shows everything at once with no
 * slips, confetti or sound; `animate: true` plays pins -> truth -> ranking ->
 * slips -> banner, and under reduced motion collapses every delay to 0 but keeps
 * that order and the slips' own hold times (`useCatchFlashes`).
 *
 * `catches` is the SECOND element of `useCatchFlashes()`; the slips themselves
 * are rendered by the dialog / page with `EstimateCatchFlash`. `onSettled` fires
 * once everything has played (at once in static mode); it must be idempotent.
 * Remount with a new `key` per stage.
 */
export function EstimateRevealView(props: {
  round: EstimateRevealRound;
  stageIndex: number;
  members: Record<string, GroupMember>;
  stake?: GameStake | null;
  animate: boolean;
  inDialog: boolean;
  currentUid?: string;
  catches: EstimateCatches;
  onSettled?: () => void;
}) {
  const stage = props.round.stages[props.stageIndex];
  if (!stage || stage.status !== "revealed" || !stage.reveal) return null;
  return <RevealBody {...props} stage={stage} reveal={stage.reveal} />;
}

function RevealBody({
  round,
  stage,
  reveal,
  members,
  stake,
  animate,
  inDialog,
  currentUid,
  catches,
  onSettled,
}: Parameters<typeof EstimateRevealView>[0] & { stage: EstimateStage; reveal: EstimateReveal }) {
  const t = useT();
  const { locale } = useLocale();
  const reduceMotion = useReducedMotion();
  const { question } = stage;

  const [phase, setPhase] = useState<Phase>(() =>
    !animate ? "end" : reduceMotion ? "slips" : "pins",
  );

  const pinCount = reveal.results.filter((row) => row.guessMilli !== null).length;
  const lineStep: EstimateLineStep =
    phase === "pins" ? "pins" : phase === "truth" ? "truth" : "all";
  const showTruth = atLeast(phase, "truth");
  const showRanking = atLeast(phase, "all");
  const lookup = withEntrants(round, members);
  const texts = errorTexts(stage, reveal, locale);

  // Seat order, so the pins drop the way the phone went round.
  const seatOrder = round.order.filter((uid) => stage.contenders.includes(uid));
  const names: Record<string, string> = {};
  for (const uid of [...seatOrder, ...stage.contenders]) names[uid] = nameFor(uid, round, members);

  const runSlips = useEffectEvent(() => {
    const next = reveal.next;
    catches.catchEach([...reveal.payers].reverse(), {
      delayMs: RANKING_BEAT_MS / 2,
      finale: next === "decided",
      onDone: () => setPhase(next === "shuffle" ? "lot" : next === "stechen" ? "stechen" : "end"),
    });
  });
  const runLot = useEffectEvent(() => {
    catches.catchEach(reveal.lotPayers ?? [], {
      delayMs: RANKING_BEAT_MS / 2,
      finale: true,
      onDone: () => setPhase("end"),
    });
  });
  const runStechen = useEffectEvent(() => {
    // The dice game's staging: drum roll into a clash, the stamp a beat later, the area jolts.
    playDrumrollSound(STECHEN_IMPACT_S);
    playSwordSound(STECHEN_IMPACT_S);
    playStampSound(STECHEN_STAMP_S);
    catches.shake(STECHEN_SHAKE, STECHEN_IMPACT_S);
  });
  const settle = useEffectEvent(() => onSettled?.());

  useEffect(() => {
    const later = (ms: number, next: Phase) => {
      const id = setTimeout(() => setPhase(next), ms);
      return () => clearTimeout(id);
    };
    switch (phase) {
      case "pins":
        return later(pinCount * pinDropGapMs(pinCount) + PIN_SETTLE_MS, "truth");
      case "truth":
        return later(TRUTH_DELAY_MS, "all");
      case "all":
        return later(RANKING_BEAT_MS, "slips");
      case "slips":
        runSlips();
        return;
      case "lot":
        runLot();
        return;
      case "stechen":
        runStechen();
        return later(reduceMotion ? 0 : STECHEN_HOLD_MS, "end");
      case "end":
        settle();
        return;
    }
  }, [phase, pinCount, reduceMotion]);

  const certain = new Set(reveal.payers);
  const lot = new Set(reveal.lotPayers ?? []);
  const absentLot =
    reveal.next === "shuffle" &&
    reveal.contested.every((uid) => {
      const row = reveal.results.find((result) => result.uid === uid);
      return !row || row.guessMilli === null;
    });
  const contestedCount = reveal.slotsLeft;

  function fateLabel(
    uid: string,
    fate: "pays" | "safe" | "contested",
  ): { text: string; tone: "pays" | "safe" | "contested" } {
    if (certain.has(uid) || lot.has(uid)) return { text: t("expenses.estimatePays"), tone: "pays" };
    if (fate === "contested" && reveal.next === "shuffle")
      return { text: t("expenses.estimateSafe"), tone: "safe" };
    if (fate === "pays") return { text: t("expenses.estimatePays"), tone: "pays" };
    if (fate === "safe") return { text: t("expenses.estimateSafe"), tone: "safe" };
    return { text: t("expenses.estimateContested"), tone: "contested" };
  }

  const showVerdict =
    phase === "end" && (reveal.next === "decided" || reveal.next === "shuffle") && round.loserUids;

  return (
    <section
      data-slot="estimate-reveal"
      data-animated={animate ? "true" : "false"}
      className="relative flex flex-col gap-4"
    >
      <p className="text-muted-foreground text-center text-sm text-balance">
        {question.text[locale]}
      </p>

      <div className="bg-card ring-foreground/10 rounded-xl p-3 pt-4 ring-1">
        <EstimateNumberLine
          question={question}
          reveal={reveal}
          names={names}
          currentUid={currentUid}
          step={lineStep}
        />
      </div>

      {showTruth && (
        <div
          data-slot="estimate-truth"
          className={cn(
            "flex flex-col items-center gap-0.5 text-center",
            !reduceMotion && "animate-rise",
          )}
        >
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t("expenses.estimateTruthLabel")}
          </span>
          <span className="font-heading tabular-money text-3xl leading-tight font-semibold">
            {formatEstimateWithUnit(reveal.truthMilli, question, locale)}
          </span>
          <span className="text-muted-foreground text-xs">
            {t("expenses.estimateTruthSource", { source: reveal.source.label, year: reveal.asOf })}
          </span>
        </div>
      )}

      {showRanking && (
        <>
          <ol
            aria-label={t("expenses.estimateResultTitle")}
            className={cn("flex flex-col gap-1.5", !reduceMotion && "animate-rise")}
          >
            {reveal.results.map((row) => {
              const name = nameFor(row.uid, round, members);
              const text = texts[row.uid] ?? null;
              const fate = fateLabel(row.uid, row.fate);
              const you = row.uid === currentUid;
              const typedBy = row.enteredBy ? nameFor(row.enteredBy, round, members) : null;
              const details = [
                row.guessMilli === null
                  ? t("expenses.estimateNoGuess")
                  : formatEstimateWithUnit(row.guessMilli, question, locale),
                text ? estimateErrorLabel(t, text) : null,
                row.answeredAfterMs !== null
                  ? t("expenses.estimateAnsweredAfter", {
                      time: formatAnswerTime(row.answeredAfterMs),
                    })
                  : null,
                typedBy ? t("expenses.estimateEnteredBy", { name: typedBy }) : null,
              ].filter((part): part is string => part !== null);
              return (
                <li
                  key={row.uid}
                  data-uid={row.uid}
                  data-fate={fate.tone}
                  className="bg-card ring-foreground/10 flex items-center gap-2.5 rounded-xl px-3 py-2 ring-1"
                >
                  <span className="text-muted-foreground tabular-money w-5 shrink-0 text-center text-xs">
                    {row.rank}
                  </span>
                  <GameAvatar name={name} className="size-8 text-sm" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{name}</span>
                      {you && (
                        <span className="bg-muted text-muted-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                          {t("expenses.estimateYouTag")}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-money text-xs">
                      {details.join(" · ")}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                      fate.tone === "pays" && "bg-destructive/10 text-destructive",
                      fate.tone === "safe" && "bg-muted text-muted-foreground",
                      fate.tone === "contested" && "bg-primary/10 text-primary",
                    )}
                  >
                    {fate.text}
                  </span>
                </li>
              );
            })}
          </ol>
          {reveal.bandTie && (
            <p className="text-muted-foreground text-center text-xs text-balance">
              {t("expenses.estimateToleranceNote")}
            </p>
          )}
        </>
      )}

      {reveal.next === "shuffle" && atLeast(phase, "lot") && (
        <p className="text-muted-foreground text-center text-sm text-balance">
          {absentLot ? t("expenses.estimateShuffleNoteAbsent") : t("expenses.estimateShuffleNote")}
        </p>
      )}

      {reveal.next === "stechen" && phase === "end" && (
        <p className="text-muted-foreground text-center text-sm text-balance">
          {contestedCount === 1
            ? t("expenses.estimateStechenOne")
            : t("expenses.estimateStechenMany", { count: contestedCount })}
        </p>
      )}

      {showVerdict && (
        <GameResultBanner
          loserUids={round.loserUids ?? []}
          members={lookup}
          stake={stake}
          inDialog={inDialog}
        />
      )}

      <AnimatePresence>
        {phase === "stechen" && (
          <DiceStechenTakeover
            key="stechen"
            uids={reveal.contested}
            slots={reveal.slotsLeft}
            members={lookup}
            stamp={t("expenses.estimateStechenStamp")}
            caption={
              reveal.slotsLeft === 1
                ? t("expenses.estimateStechenOne")
                : t("expenses.estimateStechenMany", { count: reveal.slotsLeft })
            }
          />
        )}
      </AnimatePresence>
    </section>
  );
}
