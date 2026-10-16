"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { formatMoney, moneyToInput, parseMoneyInput } from "@/lib/format/money";
import {
  allocateReceipt,
  MAX_ITEM_NAME_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_RECEIPT_ITEMS,
  receiptItemsTotal,
} from "@/lib/receipt/receipt";
import type { ExpenseReceipt, GroupMember, ReceiptItem } from "@/lib/types";
import { cn } from "@/lib/utils";

/** What the editor opens with: a scan's result, a stored receipt, or nothing (typed by hand). */
export interface ReceiptDraft {
  items: { name: string; quantity: number; totalMinor: number; units?: { uids: string[] }[] }[];
  /** The receipt's total; `null` starts it at the items' sum. */
  totalMinor: number | null;
}

export interface AppliedReceipt {
  receipt: ExpenseReceipt;
  amountMinor: number;
  /** Per person, from `allocateReceipt` — the exact split to book. */
  allocation: Record<string, number>;
}

interface DraftItem {
  key: number;
  name: string;
  quantity: string;
  total: string;
  /** One list of uids per unit; resized when the quantity changes. */
  units: string[][];
}

function parseQuantity(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const value = Number.parseInt(input, 10);
  return value >= 1 && value <= MAX_ITEM_QUANTITY ? value : null;
}

function resizeUnits(units: string[][], quantity: number): string[][] {
  return Array.from({ length: quantity }, (_, index) => units[index] ?? []);
}

let nextKey = 0;

function toDraftItem(item: ReceiptDraft["items"][number]): DraftItem {
  return {
    key: nextKey++,
    name: item.name,
    quantity: String(item.quantity),
    total: moneyToInput(item.totalMinor),
    units: resizeUnits(item.units?.map((unit) => [...unit.uids]) ?? [], item.quantity),
  };
}

function emptyItem(): DraftItem {
  return { key: nextKey++, name: "", quantity: "1", total: "", units: [[]] };
}

/** A line's validated form, or `null` while something in it is still missing or malformed. */
function toReceiptItem(item: DraftItem): ReceiptItem | null {
  const name = item.name.trim();
  const quantity = parseQuantity(item.quantity);
  const totalMinor = parseMoneyInput(item.total);
  if (!name || quantity === null || totalMinor === null || totalMinor < 0) return null;
  return {
    name,
    quantity,
    totalMinor,
    units: resizeUnits(item.units, quantity).map((uids) => ({ uids })),
  };
}

function MemberToggle({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "h-8 max-w-[9rem] truncate rounded-full border px-3 text-sm transition-colors active:scale-95",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/**
 * The receipt editor: the scanned (or typed) line items, corrected where the
 * model misread, and every unit handed to whoever had it — tap several people
 * to share one. Shows each person's amount as it goes, tip or discount spread
 * in proportion, and hands back an exact split that adds up to the total.
 *
 * The parent remounts it (a fresh `key`) for each new draft, so its state
 * always starts from `initial`.
 */
export function ReceiptSplitDialog({
  open,
  onOpenChange,
  members,
  memberUids,
  currency,
  initial,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Record<string, GroupMember>;
  memberUids: string[];
  currency: string;
  initial: ReceiptDraft;
  onApply: (result: AppliedReceipt) => void;
}) {
  const t = useT();
  const [items, setItems] = useState<DraftItem[]>(() =>
    initial.items.length > 0 ? initial.items.map(toDraftItem) : [emptyItem()],
  );
  const [totalInput, setTotalInput] = useState(() =>
    initial.totalMinor !== null ? moneyToInput(initial.totalMinor) : "",
  );

  const parsedItems = items.map(toReceiptItem);
  const completeItems = parsedItems.filter((item): item is ReceiptItem => item !== null);
  const allParsed = completeItems.length === items.length && items.length > 0;
  const itemsTotal = receiptItemsTotal(completeItems);
  // An empty total field means "what the items add up to".
  const totalMinor = totalInput.trim() ? parseMoneyInput(totalInput) : itemsTotal;
  const adjustment = totalMinor !== null ? totalMinor - itemsTotal : 0;
  const unassigned = completeItems.reduce(
    (count, item) => count + item.units.filter((unit) => unit.uids.length === 0).length,
    0,
  );

  const allocation = (() => {
    if (!allParsed || unassigned > 0 || totalMinor === null || totalMinor <= 0) return null;
    try {
      return allocateReceipt(totalMinor, completeItems);
    } catch {
      return null;
    }
  })();

  function updateItem(key: number, change: (item: DraftItem) => DraftItem) {
    setItems((current) => current.map((item) => (item.key === key ? change(item) : item)));
  }

  function setQuantity(key: number, value: string) {
    updateItem(key, (item) => {
      const quantity = parseQuantity(value);
      return {
        ...item,
        quantity: value,
        units: quantity ? resizeUnits(item.units, quantity) : item.units,
      };
    });
  }

  function toggleUnit(key: number, unitIndex: number, uid: string) {
    updateItem(key, (item) => ({
      ...item,
      units: item.units.map((uids, index) =>
        index !== unitIndex
          ? uids
          : uids.includes(uid)
            ? uids.filter((id) => id !== uid)
            : [...uids, uid],
      ),
    }));
  }

  function toggleUnitAll(key: number, unitIndex: number) {
    updateItem(key, (item) => ({
      ...item,
      units: item.units.map((uids, index) =>
        index !== unitIndex ? uids : uids.length === memberUids.length ? [] : [...memberUids],
      ),
    }));
  }

  function copyFirstUnit(key: number) {
    updateItem(key, (item) => ({ ...item, units: item.units.map(() => [...item.units[0]]) }));
  }

  function handleApply() {
    if (!allocation || totalMinor === null) return;
    onApply({ receipt: { items: completeItems }, amountMinor: totalMinor, allocation });
  }

  const nameOf = (uid: string) => members[uid]?.displayName ?? "?";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* No focus on open: a focused field would put the phone keyboard over
          the receipt before anyone has looked at it. */}
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t("receipt.editorTitle")}</DialogTitle>
          <DialogDescription>{t("receipt.editorIntro")}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto py-2">
          {items.map((item, itemIndex) => {
            const quantity = parseQuantity(item.quantity);
            const units = quantity ? resizeUnits(item.units, quantity) : item.units;
            return (
              <div
                key={item.key}
                data-testid="receipt-item"
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-end gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={`receipt-name-${item.key}`} className="text-xs">
                      {t("receipt.itemName")}
                    </Label>
                    <Input
                      id={`receipt-name-${item.key}`}
                      value={item.name}
                      maxLength={MAX_ITEM_NAME_LENGTH}
                      placeholder={t("receipt.itemNamePlaceholder")}
                      onChange={(event) =>
                        updateItem(item.key, (current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("receipt.removeItem")}
                    onClick={() => setItems((current) => current.filter((i) => i.key !== item.key))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="flex w-20 shrink-0 flex-col gap-1">
                    <Label htmlFor={`receipt-qty-${item.key}`} className="text-xs">
                      {t("receipt.itemQuantity")}
                    </Label>
                    <Input
                      id={`receipt-qty-${item.key}`}
                      value={item.quantity}
                      inputMode="numeric"
                      aria-invalid={quantity === null}
                      onChange={(event) => setQuantity(item.key, event.target.value)}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Label htmlFor={`receipt-total-${item.key}`} className="text-xs">
                      {t("receipt.itemTotal")}
                    </Label>
                    <Input
                      id={`receipt-total-${item.key}`}
                      value={item.total}
                      inputMode="decimal"
                      placeholder="0,00"
                      aria-invalid={item.total !== "" && parsedItems[itemIndex] === null}
                      onChange={(event) =>
                        updateItem(item.key, (current) => ({
                          ...current,
                          total: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                {units.map((uids, unitIndex) => (
                  <div key={unitIndex} className="flex flex-col gap-1">
                    {units.length > 1 && (
                      <span className="text-muted-foreground text-xs">
                        {t("receipt.unitLabel", { index: unitIndex + 1, count: units.length })}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {memberUids.length > 2 && (
                        <MemberToggle
                          label={t("receipt.assignAll")}
                          selected={uids.length === memberUids.length}
                          onToggle={() => toggleUnitAll(item.key, unitIndex)}
                        />
                      )}
                      {memberUids.map((uid) => (
                        <MemberToggle
                          key={uid}
                          label={nameOf(uid)}
                          selected={uids.includes(uid)}
                          onToggle={() => toggleUnit(item.key, unitIndex, uid)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {units.length > 1 && units[0].length > 0 && (
                  <button
                    type="button"
                    onClick={() => copyFirstUnit(item.key)}
                    className="text-primary self-start text-xs font-medium underline-offset-2 hover:underline"
                  >
                    {t("receipt.sameForAll")}
                  </button>
                )}
              </div>
            );
          })}
          {items.length < MAX_RECEIPT_ITEMS && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((current) => [...current, emptyItem()])}
            >
              {t("receipt.addItem")}
            </Button>
          )}

          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t("receipt.itemsTotal")}</span>
              <span className="tabular-money">{formatMoney(itemsTotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="receipt-total" className="text-sm">
                {t("receipt.totalLabel")}
              </Label>
              <Input
                id="receipt-total"
                className="w-28"
                value={totalInput}
                inputMode="decimal"
                placeholder={moneyToInput(itemsTotal)}
                onChange={(event) => setTotalInput(event.target.value)}
              />
            </div>
            {totalMinor !== null && adjustment !== 0 && (
              <p className="text-muted-foreground text-sm">
                {totalMinor <= 0
                  ? t("receipt.discountTooLarge")
                  : adjustment > 0
                    ? t("receipt.tip", { amount: formatMoney(adjustment, currency) })
                    : t("receipt.discount", { amount: formatMoney(-adjustment, currency) })}
              </p>
            )}
          </div>

          {unassigned > 0 && (
            <p className="text-destructive text-sm" role="status">
              {t("receipt.unassigned", { count: unassigned })}
            </p>
          )}
          {completeItems.length === 0 && (
            <p className="text-muted-foreground text-sm">{t("receipt.noItems")}</p>
          )}
          {allocation && (
            <div className="flex flex-col gap-1.5" data-testid="receipt-allocation">
              <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t("receipt.perPerson")}
              </h3>
              {Object.entries(allocation).map(([uid, amount]) => (
                <div key={uid} className="flex items-center justify-between text-sm">
                  <span>{nameOf(uid)}</span>
                  <span className="tabular-money font-medium">{formatMoney(amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!allocation}
            onClick={handleApply}
          >
            {t("receipt.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
