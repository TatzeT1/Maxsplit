"use client";

import { type CSSProperties, useMemo } from "react";
import { SectionHeading } from "@/components/groups/section-heading";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import { categoryColorClasses, categoryIconElement } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { computeLotteryTotals } from "@/lib/money/lottery-totals";
import { cn } from "@/lib/utils";
import type { Expense, Group } from "@/lib/types";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const RECENT_ROUNDS = 5;
const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

interface RankedLoser {
  uid: string;
  name: string;
  amountMinor: number;
  roundsLost: number;
}

/** Podium steps encode rank only — the amounts are printed, never read off the heights. */
const PODIUM_STEP = ["h-20", "h-14", "h-10"];
/**
 * Classic podium order — second, first, third — applied with CSS `order`, so
 * the DOM (and a screen reader) still goes first, second, third.
 */
const PODIUM_PLACE = ["order-2", "order-1", "order-3"];

function Podium({ top, currency }: { top: RankedLoser[]; currency: string }) {
  const t = useT();

  return (
    // Flex with fixed thirds rather than a grid, so one or two losers still
    // stand centered on the podium instead of hugging its left edge.
    <ol className="flex items-end justify-center gap-2">
      {top.map((entry, rank) => {
        return (
          <li
            key={entry.uid}
            className={cn(
              "animate-rise flex w-1/3 min-w-0 flex-col items-center gap-1.5 text-center",
              PODIUM_PLACE[rank],
            )}
            style={{ "--stagger": rank === 0 ? 2 : rank === 1 ? 1 : 3 } as CSSProperties}
          >
            <span aria-hidden="true" className="text-xl leading-none">
              {RANK_MEDALS[rank]}
            </span>
            <GameAvatar
              name={entry.name}
              className={cn(
                "ring-card shadow-e1 ring-2",
                rank === 0 ? "size-14 text-xl" : "size-11 text-base",
              )}
            />
            <span className="w-full truncate text-sm font-medium">{entry.name}</span>
            <span
              className={cn(
                "font-heading tabular-money leading-none font-semibold",
                rank === 0 ? "text-xl" : "text-base",
              )}
            >
              {formatMoney(entry.amountMinor, currency)}
            </span>
            <span className="text-muted-foreground text-[11px] leading-tight">
              {entry.roundsLost === 1
                ? t("expenses.lotteryRoundsLostOne")
                : t("expenses.lotteryRoundsLost", { count: entry.roundsLost })}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "bg-muted ring-foreground/10 font-heading text-muted-foreground mt-1 flex w-full items-start justify-center rounded-t-lg pt-1.5 text-lg font-semibold ring-1",
                PODIUM_STEP[rank],
              )}
            >
              {rank + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * "Wer hat wie viel vergambelt?" as its own tab. The group told us the games
 * are something they come back to, so the leaderboard gets a podium and the
 * room to breathe rather than being the last card under the statistics.
 *
 * Counts every split mini-game, not just the lottery: they all set
 * `viaLottery` (see Split Games in the brain vault), and only expenses
 * flagged going forward count — rounds before the flag existed aren't here.
 */
export function GamesTab({
  expenses,
  group,
  currentUid,
}: {
  expenses: Expense[];
  group: Group;
  currentUid: string;
}) {
  const t = useT();
  const currency = group.currency;

  const rounds = useMemo(() => expenses.filter((expense) => expense.viaLottery), [expenses]);
  const ranked = useMemo(() => {
    const totals = computeLotteryTotals(expenses);
    return Object.entries(group.members)
      .map(([uid, member]) => ({
        uid,
        name: member.displayName,
        amountMinor: totals[uid]?.amountMinor ?? 0,
        roundsLost: totals[uid]?.roundsLost ?? 0,
      }))
      .sort((a, b) => b.amountMinor - a.amountMinor || b.roundsLost - a.roundsLost);
  }, [expenses, group.members]);
  const losers = ranked.filter((entry) => entry.roundsLost > 0);
  const spared = ranked.filter((entry) => entry.roundsLost === 0);
  const totalLostMinor = losers.reduce((sum, entry) => sum + entry.amountMinor, 0);

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
        <span aria-hidden="true" className="text-4xl">
          🎲
        </span>
        <p className="font-heading text-lg font-medium">{t("expenses.gamesEmptyTitle")}</p>
        <p className="text-muted-foreground max-w-xs text-sm text-pretty">
          {t("expenses.gamesEmptyBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>{t("expenses.lotteryOverviewTitle")}</SectionHeading>
          <p className="text-muted-foreground text-xs">
            {rounds.length === 1
              ? t("expenses.gamesSummaryOne", { amount: formatMoney(totalLostMinor, currency) })
              : t("expenses.gamesSummary", {
                  count: rounds.length,
                  amount: formatMoney(totalLostMinor, currency),
                })}
          </p>
        </div>

        <div className="bg-card ring-foreground/10 shadow-e1 flex flex-col gap-4 rounded-2xl px-4 pt-5 ring-1">
          <Podium top={losers.slice(0, 3)} currency={currency} />
        </div>

        {losers.length > 3 && (
          <ol className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
            {losers.slice(3).map((entry, index) => (
              <li key={entry.uid} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                  #{index + 4}
                </span>
                <GameAvatar name={entry.name} className="size-6 text-[11px]" />
                <span className="min-w-0 flex-1 truncate">
                  {entry.name}
                  {entry.uid === currentUid && t("groups.selfSuffix")}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tabular-money font-medium">
                    {formatMoney(entry.amountMinor, currency)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {entry.roundsLost === 1
                      ? t("expenses.lotteryRoundsLostOne")
                      : t("expenses.lotteryRoundsLost", { count: entry.roundsLost })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {spared.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-xs">
            <span className="text-muted-foreground">{t("expenses.gamesSpared")}</span>
            {spared.map((entry) => (
              <span key={entry.uid} className="flex items-center gap-1.5">
                <GameAvatar name={entry.name} className="size-5 text-[10px]" />
                {entry.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>{t("expenses.gamesRecentTitle")}</SectionHeading>
        <ul className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
          {rounds.slice(0, RECENT_ROUNDS).map((expense) => {
            const loserNames = Object.entries(expense.splits)
              .filter(([, split]) => split.amountMinor > 0)
              .map(([uid]) => group.members[uid]?.displayName ?? "?");
            return (
              <li key={expense.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    categoryColorClasses(expense.category),
                  )}
                >
                  {expense.emoji ? (
                    <span className="text-base leading-none">{expense.emoji}</span>
                  ) : (
                    categoryIconElement(expense.category, "h-4 w-4")
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{expense.description}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {loserNames.length === 1
                      ? t("expenses.gamesRoundLostOne", { name: loserNames[0] })
                      : t("expenses.gamesRoundLostMany", {
                          names: listFormatter.format(loserNames),
                        })}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="tabular-money text-sm font-semibold">
                    {formatMoney(expense.amountMinor, expense.currency)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {formatDate(new Date(expense.date))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
