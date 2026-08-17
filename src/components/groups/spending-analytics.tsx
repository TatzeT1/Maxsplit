"use client";

import { ChartColumn } from "lucide-react";
import { useMemo } from "react";
import { useT } from "@/components/locale-provider";
import {
  categoryBarColorClass,
  categoryColorClasses,
  categoryIconElement,
  categoryLabel,
} from "@/lib/categories";
import { formatMoney } from "@/lib/format/money";
import { computeCategoryTotals } from "@/lib/money/category-totals";
import { computeMemberTotals } from "@/lib/money/balances";
import { avatarGradient, cn } from "@/lib/utils";
import type { Expense, GroupMember } from "@/lib/types";

const percentFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

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
 * Read-only spending overview: category breakdown and paid-vs-share per
 * member. Purely derived from expenses already held in memory by the caller
 * (group-detail-client's live listener) — no extra Firestore reads, and
 * nothing computed here is ever written back (display only, per ADR-001).
 */
export function SpendingAnalytics({
  expenses,
  members,
  currency,
}: {
  expenses: Expense[];
  members: Record<string, GroupMember>;
  currency: string;
}) {
  const t = useT();

  const categoryTotals = useMemo(() => computeCategoryTotals(expenses), [expenses]);
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

  const totalMinor = expenses.reduce((sum, expense) => sum + expense.amountMinor, 0);

  if (expenses.length === 0) return null;

  return (
    <div className="shadow-e1 bg-card ring-foreground/10 flex flex-col gap-4 rounded-xl p-4 ring-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <ChartColumn className="h-4 w-4" />
          {t("analytics.title")}
        </h2>
        <span className="font-heading tabular-money text-sm font-semibold">
          {formatMoney(totalMinor, currency)}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("analytics.byCategory")}
        </h3>
        <ul className="flex flex-col gap-2.5">
          {categoryTotals.map(({ category, amountMinor }) => {
            const percent = totalMinor > 0 ? (amountMinor / totalMinor) * 100 : 0;
            return (
              <li key={category} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        categoryColorClasses(category),
                      )}
                    >
                      {categoryIconElement(category, "h-3 w-3")}
                    </span>
                    <span className="truncate">{categoryLabel(category, t)}</span>
                  </span>
                  <span className="text-muted-foreground tabular-money shrink-0 text-xs">
                    {formatMoney(amountMinor, currency)} · {percentFormatter.format(percent)}%
                  </span>
                </div>
                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className={cn("h-full rounded-full", categoryBarColorClass(category))}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-border/70 flex flex-col gap-2 border-t pt-3">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t("analytics.byMember")}
        </h3>
        <ul className="flex flex-col gap-1.5">
          {Object.entries(members).map(([uid, member]) => {
            const totals = memberTotals[uid];
            if (!totals || (totals.paidMinor === 0 && totals.shareMinor === 0)) return null;
            return (
              <li key={uid} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <MemberChip name={member.displayName} />
                  <span className="truncate">{member.displayName}</span>
                </span>
                <span className="text-muted-foreground tabular-money shrink-0 text-xs">
                  {t("analytics.paid")} {formatMoney(totals.paidMinor, currency)} ·{" "}
                  {t("analytics.share")} {formatMoney(totals.shareMinor, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
