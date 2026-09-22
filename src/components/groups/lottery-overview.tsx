"use client";

import { useMemo } from "react";
import { useT } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import { computeLotteryTotals } from "@/lib/money/lottery-totals";
import { computeMemberTotals } from "@/lib/money/balances";
import { avatarGradient, cn } from "@/lib/utils";
import type { Expense, GroupMember } from "@/lib/types";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function MemberChip({ name }: { name: string }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-[10px] font-semibold text-white",
        avatarGradient(name),
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Read-only leaderboard: who has lost the most money to the 🎲 Split Lottery
 * game, ranked, alongside their general share of all group expenses for
 * context. Purely derived from expenses already held in memory by the
 * caller — no extra Firestore reads, nothing written back (ADR-001).
 *
 * Only expenses flagged `viaLottery` count toward the lottery figures — that
 * flag only exists going forward (see Expense.viaLottery), so rounds played
 * before this feature shipped aren't reflected.
 */
export function LotteryOverview({
  expenses,
  members,
  currency,
}: {
  expenses: Expense[];
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();

  const lotteryTotals = useMemo(() => computeLotteryTotals(expenses), [expenses]);
  const memberTotals = useMemo(
    () =>
      computeMemberTotals(
        expenses.map((expense) => ({
          paidBy: expense.paidBy,
          splits: Object.fromEntries(
            Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
          ),
        })),
      ),
    [expenses],
  );

  const ranked = useMemo(
    () =>
      Object.entries(members)
        .map(([uid, member]) => ({
          uid,
          name: member.displayName,
          amountMinor: lotteryTotals[uid]?.amountMinor ?? 0,
          roundsLost: lotteryTotals[uid]?.roundsLost ?? 0,
          shareMinor: memberTotals[uid]?.shareMinor ?? 0,
        }))
        .filter((entry) => entry.amountMinor > 0 || entry.shareMinor > 0)
        .sort((a, b) => b.amountMinor - a.amountMinor || b.shareMinor - a.shareMinor),
    [members, lotteryTotals, memberTotals],
  );

  if (expenses.length === 0 || ranked.length === 0) return null;

  const hasLotteryRounds = ranked.some((entry) => entry.roundsLost > 0);

  return (
    <div className="shadow-e1 bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <span aria-hidden="true">🎲</span>
        {t("expenses.lotteryOverviewTitle")}
      </h2>

      {!hasLotteryRounds && (
        <p className="text-muted-foreground text-sm">{t("expenses.lotteryOverviewEmpty")}</p>
      )}

      <ul className="flex flex-col gap-2.5">
        {ranked.map((entry, index) => (
          <li key={entry.uid} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs" aria-hidden="true">
                {RANK_MEDALS[index] ?? `#${index + 1}`}
              </span>
              <MemberChip name={entry.name} />
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="tabular-money font-medium">
                {formatMoney(entry.amountMinor, currency)}
              </span>
              <span className="text-muted-foreground text-xs">
                {entry.roundsLost === 0
                  ? t("expenses.lotteryRoundsNone")
                  : entry.roundsLost === 1
                    ? t("expenses.lotteryRoundsLostOne")
                    : t("expenses.lotteryRoundsLost", { count: entry.roundsLost })}
                {" · "}
                {t("analytics.share")} {formatMoney(entry.shareMinor, currency)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
