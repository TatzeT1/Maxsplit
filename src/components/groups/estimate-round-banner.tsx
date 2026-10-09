"use client";

import { ChevronRight, Target } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/locale-provider";
import {
  absentContenders,
  canGuess,
  isStageTimedOut,
  guessDeadlineMs,
} from "@/lib/games/estimate-input";
import { estimateRoundPath } from "@/lib/games/round-paths";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useDeadlineNow, useEstimateRound } from "@/lib/games/use-estimate-round";
import { cn } from "@/lib/utils";
import type { EstimateRound, Group } from "@/lib/types";

/** Banner clock: coarse, because it only decides which of five sentences to print. */
const BANNER_TICK_MS = 5000;

/**
 * Shows up on the group page while an online estimate round runs. The group
 * document says *that* one runs (`activeEstimateRound`), so a group without one
 * costs no extra listener; only while a round runs does the banner read it, to
 * say whether your own guess is still wanted.
 *
 * A failed listener is a visible error, never "nothing running" (AGENTS.md).
 * A pointer to a round that is gone, finished or cancelled draws nothing.
 * A round this device cannot read yet (still loading, or no cached copy while
 * offline) draws the title alone — the pointer is real, so the banner stays.
 */
export function EstimateRoundBanner({ group, currentUid }: { group: Group; currentUid: string }) {
  const t = useT();
  const active = group.activeEstimateRound ?? null;
  const { round, errorCode, missing } = useEstimateRound(group.id, active?.id ?? null);
  const running = !!round && round.status === "running";
  const stage = round ? round.stages[round.stages.length - 1] : undefined;
  const now = useDeadlineNow(
    stage && running && stage.status === "guessing" ? guessDeadlineMs(stage) : null,
    running,
    BANNER_TICK_MS,
  );

  if (!active) return null;

  if (errorCode) {
    return (
      <div className="border-destructive/50 text-destructive flex flex-col gap-0.5 rounded-xl border p-3">
        <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
        <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
      </div>
    );
  }

  // A stale pointer: the round is gone, or is over.
  if (missing || (round && round.status !== "running")) return null;

  const status = round && stage ? subtitleOf(round, currentUid, now) : null;
  const yourGuess = status?.kind === "yourGuess" || status?.kind === "lastCallYours";
  const meta = SPLIT_GAME_META.estimate;

  let subtitle = "";
  if (status) {
    switch (status.kind) {
      case "yourGuess":
        subtitle = t("expenses.estimateBannerYourGuess");
        break;
      case "lastCallYours":
        subtitle = t("expenses.estimateBannerLastCall");
        break;
      case "timeUp":
        subtitle = t("expenses.estimateBannerTimeUp");
        break;
      case "stechen":
        subtitle = t("expenses.estimateBannerStechen");
        break;
      case "progress":
        subtitle = t("expenses.estimateBannerProgress", {
          done: status.done,
          total: status.total,
        });
        break;
    }
  }

  return (
    <Link
      href={estimateRoundPath(group.id, active.id)}
      className={cn(
        "bg-card ring-foreground/10 hover:ring-primary/40 hover:shadow-e1 relative flex min-h-16 items-center gap-3 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]",
        yourGuess && "bg-primary/5 ring-primary/50",
      )}
    >
      <div className="from-primary/20 to-primary/5 text-primary relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br">
        <Target className="h-4.5 w-4.5" />
        {yourGuess && (
          <span className="absolute top-0 right-0 flex h-2.5 w-2.5">
            <span className="bg-primary/70 animate-breathe absolute inline-flex h-full w-full rounded-full" />
            <span className="bg-primary ring-card relative inline-flex h-2.5 w-2.5 rounded-full ring-2" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">
          {meta.emoji} {t("expenses.estimateBannerTitle")}
        </span>
        <p
          className={cn(
            "truncate text-xs",
            yourGuess ? "text-primary font-semibold" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </Link>
  );
}

type Subtitle =
  | { kind: "yourGuess" }
  | { kind: "lastCallYours" }
  | { kind: "timeUp" }
  | { kind: "stechen" }
  | { kind: "progress"; done: number; total: number };

/**
 * One sentence for the banner, by priority: the clock has run out (nobody can
 * guess any more); your own seat is open (told to you, with the last-call
 * wording when that is what is running); a Stechfrage; otherwise how many
 * have answered. A last call concerns only the players who are still missing,
 * and they have an open seat — everybody else just sees the progress.
 */
function subtitleOf(round: EstimateRound, uid: string, nowMs: number): Subtitle {
  const stage = round.stages[round.stages.length - 1];
  if (stage.status === "guessing" && isStageTimedOut(stage, nowMs)) return { kind: "timeUp" };
  const open = canGuess(round, uid) && !stage.submitted.includes(uid);
  if (open) return { kind: stage.lastCallAt !== null ? "lastCallYours" : "yourGuess" };
  if (stage.kind === "stechen") return { kind: "stechen" };
  return {
    kind: "progress",
    done: stage.contenders.length - absentContenders(stage).length,
    total: stage.contenders.length,
  };
}
