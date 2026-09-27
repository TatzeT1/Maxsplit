"use client";

import { ArrowRight, Receipt, ShieldCheck, type LucideIcon } from "lucide-react";
import { useT } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translate";
import { matchFates, type MatchFate } from "@/lib/games/tournament-status";
import { cn } from "@/lib/utils";
import type { TournamentAdvance, TournamentMatch } from "@/lib/types";

/**
 * One visual vocabulary for "what a result means", shared by the bracket's
 * player rows, its legend, the standings and the match runner — so "safe",
 * "pays" and "plays on" always carry the same icon and color wherever they
 * appear, and the legend explains every one of them. Safe is green, not the
 * brand orange: orange already means "ready to play" on a bracket card, and
 * orange-for-safe next to red-for-pays was too close to tell apart at a glance.
 */
export const FATE_ICON: Record<MatchFate, LucideIcon> = {
  safe: ShieldCheck,
  pays: Receipt,
  advances: ArrowRight,
};

export const FATE_TEXT_CLASS: Record<MatchFate, string> = {
  safe: "text-success",
  pays: "text-destructive",
  advances: "text-muted-foreground",
};

const FATE_BADGE_CLASS: Record<MatchFate, string> = {
  safe: "bg-success/15 text-success",
  pays: "bg-destructive/15 text-destructive",
  advances: "bg-muted text-muted-foreground",
};

export const FATE_LABEL_KEY: Record<MatchFate, TranslationKey> = {
  safe: "expenses.tournamentSafe",
  pays: "expenses.tournamentPays",
  advances: "expenses.tournamentAdvances",
};

export function FateBadge({ fate, className }: { fate: MatchFate; className?: string }) {
  const t = useT();
  const Icon = FATE_ICON[fate];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap",
        FATE_BADGE_CLASS[fate],
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {t(FATE_LABEL_KEY[fate])}
    </span>
  );
}

/** "Gewinnen [sicher] · Verlieren [spielt weiter]" — what's riding on one match, before it's played. */
export function MatchStakes({
  advance,
  match,
  className,
}: {
  advance: TournamentAdvance;
  match: Pick<TournamentMatch, "next">;
  className?: string;
}) {
  const t = useT();
  const fates = matchFates(advance, match);
  return (
    <div
      className={cn(
        "text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        {t("expenses.tournamentStakeWin")}
        <FateBadge fate={fates.win} />
      </span>
      <span className="flex items-center gap-1.5">
        {t("expenses.tournamentStakeLoss")}
        <FateBadge fate={fates.loss} />
      </span>
    </div>
  );
}
