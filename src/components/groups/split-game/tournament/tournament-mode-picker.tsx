"use client";

import { Smartphone } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { planBracket } from "@/lib/games/tournament-bracket";
import { cn } from "@/lib/utils";

export type DuelMode = "ladder" | "tournament";

/** One phone vs. several — the whole practical difference between the two modes, drawn rather than explained. */
function PhoneCount({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 items-end gap-0.5 transition-colors duration-(--duration-fast)",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <Smartphone
          key={i}
          strokeWidth={1.75}
          className={cn("shrink-0", count > 1 && i !== 1 ? "size-4.5" : "size-6")}
        />
      ))}
    </span>
  );
}

/**
 * The setup step's "K.-o.-Modus vs. Turnier" choice, as two selectable cards
 * (same selected look as the member checklist) instead of a small segmented
 * toggle with the difference buried in a paragraph below it. The tournament
 * card stays visible but disabled under three players, so the option doesn't
 * appear and vanish as people are ticked on and off.
 */
export function DuelModePicker({
  mode,
  onModeChange,
  tournamentAvailable,
}: {
  mode: DuelMode;
  onModeChange: (mode: DuelMode) => void;
  tournamentAvailable: boolean;
}) {
  const t = useT();
  const options: { value: DuelMode; title: string; hint: string; phones: number }[] = [
    {
      value: "ladder",
      title: t("expenses.tournamentModeLadder"),
      hint: t("expenses.tournamentModeLadderHint"),
      phones: 1,
    },
    {
      value: "tournament",
      title: t("expenses.tournamentModeTournament"),
      hint: tournamentAvailable
        ? t("expenses.tournamentModeTournamentHint")
        : t("expenses.tournamentModeMinHint"),
      phones: 3,
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <Label id="duel-mode-label">{t("expenses.tournamentModeLabel")}</Label>
      <div role="radiogroup" aria-labelledby="duel-mode-label" className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const disabled = option.value === "tournament" && !tournamentAvailable;
          const selected = mode === option.value && !disabled;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onModeChange(option.value)}
              className={cn(
                "ease-spring active:shadow-pressed focus-visible:ring-ring/50 relative flex min-h-28 touch-manipulation flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) outline-none select-none focus-visible:ring-3 active:scale-[0.99] disabled:opacity-50",
                selected
                  ? "border-primary/40 bg-primary/5 shadow-e1"
                  : "border-border bg-background",
              )}
            >
              <PhoneCount count={option.phones} active={selected} />
              <span className="flex flex-col gap-0.5 pr-4">
                <span className="text-sm font-semibold">{option.title}</span>
                <span className="text-muted-foreground text-xs leading-snug">{option.hint}</span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-3 right-3 flex size-4 items-center justify-center rounded-full border transition-colors duration-(--duration-fast)",
                  selected ? "border-primary bg-primary" : "border-border",
                )}
              >
                {selected && <span className="bg-primary-foreground size-1.5 rounded-full" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Live preview of the bracket the current pool and "how many pay" would produce, plus the rule it plays by. */
export function TournamentPlanCard({
  poolSize,
  loserCount,
}: {
  poolSize: number;
  loserCount: number;
}) {
  const t = useT();
  const plan = planBracket(poolSize, loserCount);
  const stats = [
    {
      value: plan.roundCount,
      label:
        plan.roundCount === 1
          ? t("expenses.tournamentPlanRoundsOne")
          : t("expenses.tournamentPlanRounds"),
    },
    {
      value: plan.matchCount,
      label:
        plan.matchCount === 1
          ? t("expenses.tournamentPlanMatchesOne")
          : t("expenses.tournamentPlanMatches"),
    },
    { value: plan.maxParallel, label: t("expenses.tournamentPlanParallel") },
  ];

  return (
    <div className="bg-muted/40 animate-rise flex flex-col gap-3 rounded-xl border p-3">
      <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
        {t("expenses.tournamentPlanTitle")}
      </span>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-background/60 flex flex-col-reverse items-center gap-1 rounded-lg py-2"
          >
            <dt className="text-muted-foreground text-[11px]">{stat.label}</dt>
            <dd className="font-heading tabular-money text-xl leading-none font-medium">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-muted-foreground text-xs">
        {plan.advance === "loser"
          ? t("expenses.tournamentRuleLoser")
          : t("expenses.tournamentRuleWinner")}
      </p>
    </div>
  );
}
