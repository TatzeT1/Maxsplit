"use client";

import { ListOrdered, Smartphone, Trophy, Wifi, type LucideIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { planBracket } from "@/lib/games/tournament-bracket";
import { cn } from "@/lib/utils";

export type DuelMode = "ladder" | "tournament";
export type DuelPlace = "device" | "online";

interface ChoiceOption<T extends string> {
  value: T;
  title: string;
  hint: string;
  icon: LucideIcon;
  disabled?: boolean;
}

/**
 * Two selectable cards (same selected look as the member checklist) — used
 * for both setup questions, "wo?" and "wie?", so they read as one family.
 * A disabled option stays visible with its reason as the hint, so choices
 * don't appear and vanish as people are ticked on and off.
 */
function ChoiceCards<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ChoiceOption<T>[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label id={id}>{label}</Label>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const selected = value === option.value && !option.disabled;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "ease-spring active:shadow-pressed focus-visible:ring-ring/50 relative flex min-h-24 touch-manipulation flex-col items-start gap-2 rounded-xl border p-3 text-left transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) outline-none select-none focus-visible:ring-3 active:scale-[0.99] disabled:opacity-50",
                selected
                  ? "border-primary/40 bg-primary/5 shadow-e1"
                  : "border-border bg-background",
              )}
            >
              <Icon
                aria-hidden="true"
                strokeWidth={1.75}
                className={cn(
                  "size-5.5 shrink-0 transition-colors duration-(--duration-fast)",
                  selected ? "text-primary" : "text-muted-foreground",
                )}
              />
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

/** "Wo spielt ihr?" — one phone passed around, or everyone on their own phone, live. */
export function DuelPlacePicker({
  place,
  onPlaceChange,
  onlineUnavailableHint,
}: {
  place: DuelPlace;
  onPlaceChange: (place: DuelPlace) => void;
  /** Why online can't be picked right now, or `null` when it can. */
  onlineUnavailableHint: string | null;
}) {
  const t = useT();
  return (
    <ChoiceCards
      id="duel-place-label"
      label={t("expenses.duelPlaceLabel")}
      value={onlineUnavailableHint ? "device" : place}
      onChange={onPlaceChange}
      options={[
        {
          value: "device",
          title: t("expenses.duelPlaceDevice"),
          hint: t("expenses.duelPlaceDeviceHint"),
          icon: Smartphone,
        },
        {
          value: "online",
          title: t("expenses.duelPlaceOnline"),
          hint: onlineUnavailableHint ?? t("expenses.duelPlaceOnlineHint"),
          icon: Wifi,
          disabled: onlineUnavailableHint !== null,
        },
      ]}
    />
  );
}

/** "Format" for a same-device round of three or more: the one-at-a-time ladder, or a bracket several pairs can play in parallel. */
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
  return (
    <ChoiceCards
      id="duel-mode-label"
      label={t("expenses.tournamentModeLabel")}
      value={tournamentAvailable ? mode : "ladder"}
      onChange={onModeChange}
      options={[
        {
          value: "ladder",
          title: t("expenses.tournamentModeLadder"),
          hint: t("expenses.tournamentModeLadderHint"),
          icon: ListOrdered,
        },
        {
          value: "tournament",
          title: t("expenses.tournamentModeTournament"),
          hint: tournamentAvailable
            ? t("expenses.tournamentModeTournamentHint")
            : t("expenses.tournamentModeMinHint"),
          icon: Trophy,
          disabled: !tournamentAvailable,
        },
      ]}
    />
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
