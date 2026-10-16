"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GameRecordSummary } from "@/components/groups/split-game/game-record";
import { useT } from "@/components/locale-provider";
import { categoryTileClasses, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import { receiptItemsTotal } from "@/lib/receipt/receipt";
import type { Expense, GroupMember, ReceiptItem, SplitMode } from "@/lib/types";
import { monogramVars } from "@/components/ui/monogram";

function MemberChip({ name }: { name: string }) {
  return (
    <span
      style={monogramVars(name)}
      className={cn(
        "monogram flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/**
 * Who had a receipt line, units with the same people folded together:
 * "Anna ×2 · Ben · Anna + Ben" for four Spätzle, the last one shared.
 */
function describeUnits(item: ReceiptItem, nameOf: (uid: string) => string): string {
  const counts = new Map<string, { names: string; count: number }>();
  for (const unit of item.units) {
    const key = [...unit.uids].sort().join("|");
    const entry = counts.get(key) ?? { names: unit.uids.map(nameOf).join(" + "), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .map(({ names, count }) => (count > 1 ? `${names} ×${count}` : names))
    .join(" · ");
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
  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";
  const receiptAdjustment = expense.receipt
    ? expense.amountMinor - receiptItemsTotal(expense.receipt.items)
    : 0;

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
                categoryTileClasses(expense.category),
              )}
            >
              {expense.emoji ? (
                <span className="text-xl leading-none">{expense.emoji}</span>
              ) : (
                categoryIconElement(expense.category, "h-5 w-5")
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading tabular-money text-2xl font-medium">
                {formatMoney(expense.amountMinor, expense.currency)}
              </span>
              <span className="text-muted-foreground text-sm">
                {formatDate(new Date(expense.date))}
                {expense.category && ` · ${categoryLabel(expense.category, t)}`}
              </span>
            </div>
          </div>

          {expense.viaLottery && (
            <GameRecordSummary game={expense.game} showPlayers expense={expense} />
          )}

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

          {expense.receipt && (
            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                🧾 {t("receipt.detailTitle")}
              </h3>
              <ul className="flex flex-col gap-2">
                {expense.receipt.items.map((item, index) => (
                  <li key={index} className="flex flex-col text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {item.quantity > 1 && `${item.quantity}× `}
                        {item.name}
                      </span>
                      <span className="tabular-money shrink-0">
                        {formatMoney(item.totalMinor, expense.currency)}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {describeUnits(item, nameOf)}
                    </span>
                  </li>
                ))}
                {receiptAdjustment !== 0 && (
                  <li className="text-muted-foreground flex items-baseline justify-between gap-2 text-sm">
                    <span>
                      {receiptAdjustment > 0 ? t("receipt.detailTip") : t("receipt.detailDiscount")}
                    </span>
                    <span className="tabular-money">
                      {formatMoney(receiptAdjustment, expense.currency)}
                    </span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
