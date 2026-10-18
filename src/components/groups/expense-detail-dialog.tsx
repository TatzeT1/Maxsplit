"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProductChip, ProductClassFields } from "@/components/groups/product-class-fields";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GameRecordSummary } from "@/components/groups/split-game/game-record";
import { useT } from "@/components/locale-provider";
import { categoryTileClasses, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import { receiptItemsTotal } from "@/lib/receipt/receipt";
import { setExpenseProduct } from "@/lib/actions/products";
import { callAction } from "@/lib/call-action";
import { normalizeProductKind, productFamilyEmoji } from "@/lib/products/products";
import { useOnline } from "@/lib/use-online";
import type {
  Expense,
  GroupMember,
  ProductClass,
  ProductFamilyId,
  ReceiptItem,
  SplitMode,
} from "@/lib/types";
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

/**
 * What an expense without a receipt is (📊), and the one place to correct
 * it: any member may, it moves no money. Saved on its own, through
 * setExpenseProduct — not a reason to open the whole edit form.
 */
function ExpenseProductSection({ groupId, expense }: { groupId: string; expense: Expense }) {
  const t = useT();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [family, setFamily] = useState<ProductFamilyId | null>(expense.product?.family ?? null);
  const [kind, setKind] = useState(expense.product?.kind ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftKind = normalizeProductKind(kind);

  function toggle() {
    // Opening starts from what is stored now, which may have arrived since.
    if (!open) {
      setFamily(expense.product?.family ?? null);
      setKind(expense.product?.kind ?? "");
      setError(null);
    }
    setOpen(!open);
  }

  async function save() {
    if (!family || !draftKind) {
      setError(t("products.invalid"));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await callAction(() =>
      setExpenseProduct({ groupId, expenseId: expense.id, family, kind: draftKind }),
    );
    setSaving(false);
    if (result.ok) setOpen(false);
    else
      setError(result.error === "network" ? t("errors.notSaved") : t("common.somethingWentWrong"));
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        📊 {t("products.detailTitle")}
      </h3>
      <ProductChip
        product={expense.product ?? null}
        pendingLabel={t("products.detailPending")}
        expanded={open}
        onClick={toggle}
      />
      {open && (
        <div className="flex flex-col gap-2">
          <ProductClassFields
            idPrefix={`expense-product-${expense.id}`}
            family={family}
            kind={kind}
            disabled={saving}
            onChange={(next) => {
              setFamily(next.family);
              setKind(next.kind);
            }}
          />
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            className="self-end"
            disabled={!online || saving || !family || !draftKind}
            onClick={save}
          >
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}

function LineProduct({ product }: { product: ProductClass | undefined }) {
  if (!product) return null;
  return (
    <span className="text-muted-foreground shrink-0 text-xs">
      <span aria-hidden="true">{productFamilyEmoji(product.family)}</span> {product.kind}
    </span>
  );
}

/** Read-only breakdown opened by tapping an expense row — the only place the app shows who paid what and who owes what without entering the edit form. */
export function ExpenseDetailDialog({
  groupId,
  expense,
  members,
  open,
  onOpenChange,
}: {
  groupId: string;
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
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-muted-foreground min-w-0 text-xs">
                        {describeUnits(item, nameOf)}
                      </span>
                      <LineProduct product={item.product} />
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

          {!expense.receipt?.items?.length && (
            <ExpenseProductSection key={expense.id} groupId={groupId} expense={expense} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
