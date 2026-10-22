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
import { ProductChip, ProductClassFields } from "@/components/groups/product-class-fields";
import { useT } from "@/components/locale-provider";
import { formatMoney, moneyToInput, parseMoneyInput, takeLeadingMinus } from "@/lib/format/money";
import {
  allocateReceipt,
  MAX_ITEM_NAME_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_RECEIPT_ITEMS,
  receiptItemsTotal,
} from "@/lib/receipt/receipt";
import { normalizeProductKind } from "@/lib/products/products";
import type {
  ExpenseReceipt,
  GroupMember,
  ProductClass,
  ProductFamilyId,
  ReceiptItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

/** What the editor opens with: a scan's result, a stored receipt, or nothing (typed by hand). */
export interface ReceiptDraft {
  items: {
    name: string;
    quantity: number;
    totalMinor: number;
    units?: { uids: string[] }[];
    /** What the scan (or a member, earlier) said the line is. */
    product?: ProductClass | null;
  }[];
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
  /** The line's amount without its sign — see `credit`. */
  total: string;
  /** A deposit return or other credit line: the amount counts negative. */
  credit: boolean;
  /** One list of uids per unit; resized when the quantity changes. */
  units: string[][];
  /**
   * Whether each unit is assigned on its own row. Off, one row of names
   * stands for every unit — "6x Joghurt" for the whole flat is one tap, not six.
   */
  perUnit: boolean;
  /** What the line is (📊), as typed: a class only once both are set. */
  family: ProductFamilyId | null;
  kind: string;
  productOpen: boolean;
}

function parseQuantity(input: string): number | null {
  if (!/^\d+$/.test(input.trim())) return null;
  const value = Number.parseInt(input, 10);
  return value >= 1 && value <= MAX_ITEM_QUANTITY ? value : null;
}

/** New units copy `fill` — everyone, or what the item's one shared row says. */
function resizeUnits(units: string[][], quantity: number, fill: string[] = []): string[][] {
  return Array.from({ length: quantity }, (_, index) => units[index] ?? [...fill]);
}

function sameUnits(units: string[][]): boolean {
  const key = (uids: string[]) => [...uids].sort().join("|");
  return units.every((uids) => key(uids) === key(units[0] ?? []));
}

/**
 * The next selection after tapping `uid` on a unit. While everyone shares it
 * (the default), a tap means "only this person" — the common correction, one
 * tap instead of deselecting everybody else; from there taps add and remove.
 */
export function nextSelection(current: string[], uid: string, memberUids: string[]): string[] {
  const everyone = memberUids.length > 1 && memberUids.every((id) => current.includes(id));
  if (everyone) return [uid];
  return current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid];
}

let nextKey = 0;

/** A scanned or typed line starts shared by everyone; a stored one keeps who had what. */
function toDraftItem(item: ReceiptDraft["items"][number], memberUids: string[]): DraftItem {
  const units = resizeUnits(
    item.units?.map((unit) => [...unit.uids]) ?? [],
    item.quantity,
    memberUids,
  );
  return {
    key: nextKey++,
    name: item.name,
    quantity: String(item.quantity),
    total: moneyToInput(Math.abs(item.totalMinor)),
    credit: item.totalMinor < 0,
    units,
    perUnit: !sameUnits(units),
    family: item.product?.family ?? null,
    kind: item.product?.kind ?? "",
    productOpen: false,
  };
}

function emptyItem(memberUids: string[]): DraftItem {
  return {
    key: nextKey++,
    name: "",
    quantity: "1",
    total: "",
    credit: false,
    units: [[...memberUids]],
    perUnit: false,
    family: null,
    kind: "",
    productOpen: false,
  };
}

/** The line's class, or `null` while it has none (the server classifies it after saving). */
function draftProduct(item: Pick<DraftItem, "family" | "kind">): ProductClass | null {
  const kind = normalizeProductKind(item.kind);
  return item.family && kind ? { family: item.family, kind } : null;
}

/** A line's validated form, or `null` while something in it is still missing or malformed. */
function toReceiptItem(item: DraftItem): ReceiptItem | null {
  const name = item.name.trim();
  const quantity = parseQuantity(item.quantity);
  const amount = parseMoneyInput(item.total);
  if (!name || quantity === null || amount === null) return null;
  const product = draftProduct(item);
  return {
    name,
    quantity,
    totalMinor: item.credit ? -amount : amount,
    units: resizeUnits(item.units, quantity, item.units[0] ?? []).map((uids) => ({ uids })),
    ...(product ? { product } : {}),
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
    initial.items.length > 0
      ? initial.items.map((item) => toDraftItem(item, memberUids))
      : [emptyItem(memberUids)],
  );
  // The total without its sign: it takes the items' side of zero, so a
  // deposit slip (only credit lines) has a negative total.
  const [totalInput, setTotalInput] = useState(() =>
    initial.totalMinor !== null ? moneyToInput(Math.abs(initial.totalMinor)) : "",
  );

  const parsedItems = items.map(toReceiptItem);
  const completeItems = parsedItems.filter((item): item is ReceiptItem => item !== null);
  const allParsed = completeItems.length === items.length && items.length > 0;
  const itemsTotal = receiptItemsTotal(completeItems);
  const direction = itemsTotal < 0 ? -1 : 1;
  // An empty total field means "what the items add up to".
  const typedTotal = parseMoneyInput(totalInput);
  const totalMinor = !totalInput.trim()
    ? itemsTotal
    : typedTotal !== null
      ? direction * typedTotal
      : null;
  // How much the total is beyond the items (a tip) or short of them (a discount).
  const adjustment = totalMinor !== null ? direction * (totalMinor - itemsTotal) : 0;
  const unassigned = completeItems.reduce(
    (count, item) => count + item.units.filter((unit) => unit.uids.length === 0).length,
    0,
  );

  const allocation = (() => {
    if (!allParsed || unassigned > 0 || !totalMinor) return null;
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
        // New units follow the shared row, or start with everyone when split per unit.
        units: quantity
          ? resizeUnits(item.units, quantity, item.perUnit ? memberUids : item.units[0])
          : item.units,
      };
    });
  }

  /** Sets who had unit `unitIndex` — or every unit, while the item isn't split per unit. */
  function assign(key: number, unitIndex: number, change: (uids: string[]) => string[]) {
    updateItem(key, (item) => {
      if (!item.perUnit) {
        const next = change(item.units[0] ?? []);
        return { ...item, units: item.units.map(() => [...next]) };
      }
      return {
        ...item,
        units: item.units.map((uids, index) => (index === unitIndex ? change(uids) : uids)),
      };
    });
  }

  function setPerUnit(key: number, perUnit: boolean) {
    updateItem(key, (item) => ({
      ...item,
      perUnit,
      // Back to one row: every unit takes the first one's people.
      units: perUnit ? item.units : item.units.map(() => [...(item.units[0] ?? [])]),
    }));
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
                      onChange={(event) => {
                        const typed = takeLeadingMinus(event.target.value);
                        updateItem(item.key, (current) => ({
                          ...current,
                          total: typed.input,
                          credit: current.credit || typed.negative,
                        }));
                      }}
                    />
                  </div>
                  <div className="flex shrink-0 flex-col justify-end">
                    {/* Phone keypads have no minus: a deposit return is a toggle. */}
                    <button
                      type="button"
                      aria-pressed={item.credit}
                      onClick={() =>
                        updateItem(item.key, (current) => ({ ...current, credit: !current.credit }))
                      }
                      className={cn(
                        "h-9 rounded-md border px-2.5 text-sm transition-colors active:scale-95",
                        item.credit
                          ? "bg-primary text-primary-foreground border-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t("receipt.itemCredit")}
                    </button>
                  </div>
                </div>
                <ProductChip
                  product={draftProduct(item)}
                  pendingLabel={t("products.pending")}
                  expanded={item.productOpen}
                  onClick={() =>
                    updateItem(item.key, (current) => ({
                      ...current,
                      productOpen: !current.productOpen,
                    }))
                  }
                />
                {item.productOpen && (
                  <ProductClassFields
                    idPrefix={`receipt-product-${item.key}`}
                    family={item.family}
                    kind={item.kind}
                    onChange={(next) =>
                      updateItem(item.key, (current) => ({ ...current, ...next }))
                    }
                  />
                )}
                {(item.perUnit ? units : units.slice(0, 1)).map((uids, unitIndex) => (
                  <div key={unitIndex} className="flex flex-col gap-1">
                    {item.perUnit && (
                      <span className="text-muted-foreground text-xs">
                        {t("receipt.unitLabel", { index: unitIndex + 1, count: units.length })}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {memberUids.length > 2 && (
                        <MemberToggle
                          label={t("receipt.assignAll")}
                          selected={uids.length === memberUids.length}
                          onToggle={() => assign(item.key, unitIndex, () => [...memberUids])}
                        />
                      )}
                      {memberUids.map((uid) => (
                        <MemberToggle
                          key={uid}
                          label={nameOf(uid)}
                          selected={uids.includes(uid)}
                          onToggle={() =>
                            assign(item.key, unitIndex, (current) =>
                              nextSelection(current, uid, memberUids),
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {units.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPerUnit(item.key, !item.perUnit)}
                    className="text-primary self-start text-xs font-medium underline-offset-2 hover:underline"
                  >
                    {item.perUnit ? t("receipt.sameForAll") : t("receipt.splitPerUnit")}
                  </button>
                )}
              </div>
            );
          })}
          {items.length < MAX_RECEIPT_ITEMS && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((current) => [...current, emptyItem(memberUids)])}
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
                placeholder={moneyToInput(Math.abs(itemsTotal))}
                onChange={(event) => setTotalInput(takeLeadingMinus(event.target.value).input)}
              />
            </div>
            {totalMinor !== null && adjustment !== 0 && (
              <p className="text-muted-foreground text-sm">
                {totalMinor === 0
                  ? t("receipt.discountTooLarge")
                  : adjustment > 0
                    ? t("receipt.tip", { amount: formatMoney(adjustment, currency) })
                    : t("receipt.discount", { amount: formatMoney(-adjustment, currency) })}
              </p>
            )}
            {itemsTotal < 0 && (
              <p className="text-muted-foreground text-sm">{t("receipt.creditTotal")}</p>
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
              {memberUids
                .filter((uid) => allocation[uid] !== undefined)
                .map((uid) => [uid, allocation[uid]] as const)
                .map(([uid, amount]) => (
                  <div key={uid} className="flex items-center justify-between text-sm">
                    <span>{nameOf(uid)}</span>
                    <span className="tabular-money font-medium">
                      {formatMoney(amount, currency)}
                    </span>
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
