"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { categoryColorClasses, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { avatarGradient, cn } from "@/lib/utils";
import type { Expense, GroupMember, SplitMode } from "@/lib/types";

function MemberChip({ name }: { name: string }) {
  return (
    <span
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-[11px] font-semibold text-white",
        avatarGradient(name),
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

const SPLIT_MODE_LABEL_KEYS: Record<SplitMode, TranslationKey> = {
  equal: "expenses.splitEqual",
  shares: "expenses.splitShares",
  percent: "expenses.splitPercent",
  exact: "expenses.splitExact",
};

/** Read-only breakdown opened by tapping an expense row — the only place the app shows who paid what and who owes what without entering the edit form. */
export function ExpenseDetailDialog({
  expense,
  members,
  open,
  onOpenChange,
}: {
  expense: Expense;
  members: Record<string, GroupMember>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const payerEntries = Object.entries(expense.paidBy);
  const splitEntries = Object.entries(expense.splits);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense.description}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                categoryColorClasses(expense.category),
              )}
            >
              {expense.emoji ? (
                <span className="text-xl leading-none">{expense.emoji}</span>
              ) : (
                categoryIconElement(expense.category, "h-5 w-5")
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading tabular-money text-2xl font-semibold">
                {formatMoney(expense.amountMinor, expense.currency)}
              </span>
              <span className="text-muted-foreground text-sm">
                {formatDate(new Date(expense.date))}
                {expense.category && ` · ${categoryLabel(expense.category, t)}`}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("expenses.detailPaidBy")}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {payerEntries.map(([uid, amountMinor]) => (
                <li key={uid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <MemberChip name={members[uid]?.displayName ?? "?"} />
                    {members[uid]?.displayName ?? "?"}
                  </span>
                  <span className="tabular-money font-medium">
                    {formatMoney(amountMinor, expense.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {t("expenses.detailSplit")} · {t(SPLIT_MODE_LABEL_KEYS[expense.splitMode])}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {splitEntries.map(([uid, split]) => (
                <li key={uid} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    <MemberChip name={members[uid]?.displayName ?? "?"} />
                    {members[uid]?.displayName ?? "?"}
                  </span>
                  <span className="tabular-money font-medium">
                    {formatMoney(split.amountMinor, expense.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
