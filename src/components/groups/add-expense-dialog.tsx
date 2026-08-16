"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { QueuedForSync } from "@/components/ui/queued-for-sync";
import { SaveCelebration } from "@/components/ui/save-celebration";
import { useT } from "@/components/locale-provider";
import { EmojiPicker } from "@/components/groups/emoji-picker";
import { editExpense, type ExpenseInput } from "@/lib/actions/expenses";
import {
  CATEGORY_IDS,
  categoryColorClasses,
  categoryIconElement,
  categoryLabel,
} from "@/lib/categories";
import { EXPENSE_EMOJIS } from "@/lib/emoji";
import { formatMoney, parseMoneyInput } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { splitEqual } from "@/lib/money/split";
import { submitCreateAction } from "@/lib/offline/action-queue";
import { TIMEOUT } from "@/lib/offline/with-timeout";
import { cn } from "@/lib/utils";
import type { CategoryId, Expense, GroupMember, SplitMode } from "@/lib/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function moneyToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}

function parseNumberInput(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function parseIntInput(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

/** Turns a server ActionResult error code into a message that says what to fix. */
function expenseErrorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "invalid-description":
      return t("expenses.errorInvalidDescription");
    case "invalid-amount":
      return t("expenses.errorInvalidAmount");
    case "invalid-payer":
      return t("expenses.errorInvalidPayer");
    case "invalid-participants":
      return t("expenses.errorInvalidParticipants");
    case "invalid-split":
      return t("expenses.amountMismatch");
    case "not-owner":
      return t("expenses.errorNotOwner");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("expenses.saveError");
  }
}

function sumMoneyInputs(map: Record<string, string>): number {
  return Object.values(map).reduce((total, raw) => total + (parseMoneyInput(raw) ?? 0), 0);
}

function sumNumberInputs(map: Record<string, string>): number {
  return Object.values(map).reduce((total, raw) => total + (parseNumberInput(raw) ?? 0), 0);
}

const SPLIT_MODES: { mode: SplitMode; labelKey: TranslationKey }[] = [
  { mode: "equal", labelKey: "expenses.splitEqual" },
  { mode: "shares", labelKey: "expenses.splitShares" },
  { mode: "percent", labelKey: "expenses.splitPercent" },
  { mode: "exact", labelKey: "expenses.splitExact" },
];

/** Shows how far a running total is from the target, or nothing once it matches. */
function MoneyBalanceHint({
  targetMinor,
  currentMinor,
  currency,
}: {
  targetMinor: number;
  currentMinor: number;
  currency: string;
}) {
  const t = useT();
  const diff = targetMinor - currentMinor;
  if (diff === 0) return null;
  return (
    <p className="text-muted-foreground text-sm">
      {diff > 0
        ? t("expenses.remaining", { amount: formatMoney(diff, currency) })
        : t("expenses.overBy", { amount: formatMoney(-diff, currency) })}
    </p>
  );
}

const percentFormatter = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function PercentBalanceHint({ current }: { current: number }) {
  const t = useT();
  const diff = 100 - current;
  if (Math.abs(diff) < 0.01) return null;
  return (
    <p className="text-muted-foreground text-sm">
      {diff > 0
        ? t("expenses.percentRemaining", { percent: percentFormatter.format(diff) })
        : t("expenses.percentOverBy", { percent: percentFormatter.format(-diff) })}
    </p>
  );
}

export function AddExpenseDialog({
  groupId,
  members,
  currency,
  currentUid,
  expenseToEdit,
  duplicateFrom,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
  expenseToEdit?: Expense;
  /** Pre-fills the form like expenseToEdit, but stays in "add" mode — a new expense, not a revision. */
  duplicateFrom?: Expense;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const memberUids = Object.keys(members);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  // Prefills form fields for both edit and duplicate; `date` is deliberately
  // excluded below so a duplicated expense defaults to today, not the
  // original's date.
  const prefill = expenseToEdit ?? duplicateFrom;

  const [description, setDescription] = useState(prefill?.description ?? "");
  const [amountInput, setAmountInput] = useState(prefill ? moneyToInput(prefill.amountMinor) : "");
  const [date, setDate] = useState(expenseToEdit?.date ?? todayIsoDate());
  const [category, setCategory] = useState<CategoryId | null>(prefill?.category ?? null);
  const [emoji, setEmoji] = useState<string | null>(prefill?.emoji ?? null);

  const initialPayerUids = prefill ? Object.keys(prefill.paidBy) : [currentUid];
  const [multiplePayers, setMultiplePayers] = useState(initialPayerUids.length > 1);
  const [payerUid, setPayerUid] = useState(initialPayerUids[0] ?? currentUid);
  const [payerAmounts, setPayerAmounts] = useState<Record<string, string>>(() =>
    prefill && initialPayerUids.length > 1
      ? Object.fromEntries(
          Object.entries(prefill.paidBy).map(([uid, amount]) => [uid, moneyToInput(amount)]),
        )
      : {},
  );

  const [splitMode, setSplitMode] = useState<SplitMode>(prefill?.splitMode ?? "equal");
  const [participantUids, setParticipantUids] = useState<string[]>(
    !prefill || prefill.splitMode === "equal"
      ? prefill
        ? Object.keys(prefill.splits)
        : memberUids
      : memberUids,
  );
  const [shareInputs, setShareInputs] = useState<Record<string, string>>(() =>
    prefill?.splitMode === "shares"
      ? Object.fromEntries(
          Object.entries(prefill.splits).map(([uid, s]) => [uid, String(s.rawValue)]),
        )
      : {},
  );
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>(() =>
    prefill?.splitMode === "percent"
      ? Object.fromEntries(
          Object.entries(prefill.splits).map(([uid, s]) => [uid, String(s.rawValue)]),
        )
      : {},
  );
  const [exactInputs, setExactInputs] = useState<Record<string, string>>(() =>
    prefill?.splitMode === "exact"
      ? Object.fromEntries(
          Object.entries(prefill.splits).map(([uid, s]) => [uid, moneyToInput(s.amountMinor)]),
        )
      : {},
  );

  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const amountMinor = parseMoneyInput(amountInput) ?? 0;

  function toggleParticipant(uid: string) {
    setParticipantUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  function handleSelectSplitMode(mode: SplitMode) {
    setSplitMode(mode);
    if (mode === "shares" && Object.keys(shareInputs).length === 0) {
      setShareInputs(Object.fromEntries(memberUids.map((uid) => [uid, "1"])));
    }
    if (mode === "exact" && Object.keys(exactInputs).length === 0 && amountMinor > 0) {
      const equalAmounts = splitEqual(amountMinor, memberUids);
      setExactInputs(
        Object.fromEntries(memberUids.map((uid) => [uid, moneyToInput(equalAmounts[uid])])),
      );
    }
  }

  function buildPaidBy(): Record<string, number> {
    if (!multiplePayers) return { [payerUid]: amountMinor };
    const result: Record<string, number> = {};
    for (const [uid, raw] of Object.entries(payerAmounts)) {
      const parsed = parseMoneyInput(raw);
      if (parsed !== null && parsed > 0) result[uid] = parsed;
    }
    return result;
  }

  function buildSplitInputs(): Record<string, number> {
    if (splitMode === "shares") {
      const result: Record<string, number> = {};
      for (const [uid, raw] of Object.entries(shareInputs)) {
        const parsed = parseIntInput(raw);
        if (parsed !== null && parsed > 0) result[uid] = parsed;
      }
      return result;
    }
    if (splitMode === "percent") {
      const result: Record<string, number> = {};
      for (const [uid, raw] of Object.entries(percentInputs)) {
        const parsed = parseNumberInput(raw);
        if (parsed !== null && parsed > 0) result[uid] = parsed;
      }
      return result;
    }
    if (splitMode === "exact") {
      const result: Record<string, number> = {};
      for (const [uid, raw] of Object.entries(exactInputs)) {
        const parsed = parseMoneyInput(raw);
        if (parsed !== null && parsed > 0) result[uid] = parsed;
      }
      return result;
    }
    return {};
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const paidBy = buildPaidBy();
    const splitInputs = buildSplitInputs();
    const hasParticipants =
      splitMode === "equal" ? participantUids.length > 0 : Object.keys(splitInputs).length > 0;

    if (amountMinor <= 0) {
      setError(t("expenses.errorInvalidAmount"));
      return;
    }
    if (Object.keys(paidBy).length === 0) {
      setError(t("expenses.errorInvalidPayer"));
      return;
    }
    if (!hasParticipants) {
      setError(t("expenses.errorInvalidParticipants"));
      return;
    }

    setLoading(true);
    setError(null);

    const payload: ExpenseInput = {
      groupId,
      description,
      amountMinor,
      currency,
      date,
      category,
      emoji,
      paidBy,
      splitMode,
      participantUids,
      splitInputs,
    };

    if (expenseToEdit) {
      const result = await editExpense({ ...payload, expenseId: expenseToEdit.id });
      setLoading(false);
      if (!result.ok) {
        setError(expenseErrorMessage(result.error, t));
        return;
      }
      setQueued(false);
    } else {
      // A client-generated id, not a server round trip: if this submission
      // gets retried — by Next's offline retry, or by the outbox once the
      // app reopens — addExpense reuses the same expense id instead of
      // creating a second one. See ExpenseInput.clientMutationId.
      const createPayload = { ...payload, clientMutationId: crypto.randomUUID() };
      const outcome = await submitCreateAction("add-expense", createPayload);
      setLoading(false);
      if (outcome === TIMEOUT) {
        setQueued(true);
      } else if (outcome.ok) {
        setQueued(false);
      } else {
        setError(expenseErrorMessage(outcome.error, t));
        return;
      }
    }

    setCelebrating(true);
    // Long enough for the sequence to finish rather than get cut off partway:
    // ring and checkmark land by ~700ms and the amount finishes counting at
    // ~880ms, so the result is legible and still on screen for a beat before
    // the dialog dismisses itself.
    setTimeout(() => {
      setCelebrating(false);
      setQueued(false);
      setOpen(false);
      if (!expenseToEdit) {
        setDescription("");
        setAmountInput("");
        setCategory(null);
        setEmoji(null);
        setSplitMode("equal");
        setParticipantUids(memberUids);
        setMultiplePayers(false);
        setPayerUid(currentUid);
        setPayerAmounts({});
        setShareInputs({});
        setPercentInputs({});
        setExactInputs({});
      }
    }, 1600);
  }

  return (
    <Dialog open={open} onOpenChange={celebrating ? undefined : setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent showCloseButton={!celebrating}>
        {celebrating ? (
          queued ? (
            <QueuedForSync
              label={t("common.savedOfflineTitle")}
              caption={t("common.savedOfflineCaption")}
              amountMinor={amountMinor}
              currency={currency}
            />
          ) : (
            <SaveCelebration
              label={t("expenses.celebrateTitle")}
              amountMinor={amountMinor}
              currency={currency}
            />
          )
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {expenseToEdit ? t("expenses.editTitle") : t("expenses.addTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-description">{t("expenses.descriptionLabel")}</Label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t("expenses.descriptionPlaceholder")}
                  autoFocus
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-amount">{t("expenses.amountLabel")}</Label>
                <Input
                  id="expense-amount"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  placeholder={`0,00 ${currency}`}
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-date">{t("expenses.dateLabel")}</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="expense-category">{t("expenses.categoryLabel")}</Label>
                <div className="flex items-center gap-2">
                  <EmojiPicker
                    value={emoji}
                    onChange={setEmoji}
                    emojis={EXPENSE_EMOJIS}
                    fallback={categoryIconElement(category, "h-4 w-4")}
                    colorClassName={categoryColorClasses(category)}
                    ariaLabel={t("expenses.emojiPickerLabel")}
                    resetLabel={t("expenses.emojiReset")}
                  />
                  <div className="flex-1">
                    <Select
                      id="expense-category"
                      value={category ?? ""}
                      onChange={(event) =>
                        setCategory((event.target.value || null) as CategoryId | null)
                      }
                    >
                      <option value="">{t("expenses.categoryPlaceholder")}</option>
                      {CATEGORY_IDS.map((id) => (
                        <option key={id} value={id}>
                          {categoryLabel(id, t)}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t("expenses.paidByLabel")}</Label>
                  <label className="text-muted-foreground flex cursor-pointer items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={multiplePayers}
                      onChange={(event) => setMultiplePayers(event.target.checked)}
                      className="accent-primary size-4"
                    />
                    {t("expenses.multiplePayers")}
                  </label>
                </div>
                {multiplePayers ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">
                      {t("expenses.payerAmountsHint")}
                    </p>
                    {memberUids.map((uid) => (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 truncate text-sm sm:w-24">
                          {members[uid].displayName}
                        </span>
                        <Input
                          value={payerAmounts[uid] ?? ""}
                          onChange={(event) =>
                            setPayerAmounts((current) => ({
                              ...current,
                              [uid]: event.target.value,
                            }))
                          }
                          placeholder={`0,00 ${currency}`}
                          inputMode="decimal"
                        />
                      </div>
                    ))}
                    <MoneyBalanceHint
                      targetMinor={amountMinor}
                      currentMinor={sumMoneyInputs(payerAmounts)}
                      currency={currency}
                    />
                  </div>
                ) : (
                  <Select
                    id="expense-paid-by"
                    value={payerUid}
                    onChange={(event) => setPayerUid(event.target.value)}
                  >
                    {memberUids.map((uid) => (
                      <option key={uid} value={uid}>
                        {members[uid].displayName}
                      </option>
                    ))}
                  </Select>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>{t("expenses.splitModeLabel")}</Label>
                <div className="flex gap-1 rounded-lg border p-1">
                  {SPLIT_MODES.map(({ mode, labelKey }) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSelectSplitMode(mode)}
                      className={cn(
                        "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
                        splitMode === mode
                          ? "bg-primary text-primary-foreground shadow-primary/30 shadow-e1"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>

                {splitMode === "equal" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">{t("expenses.splitEqualHint")}</p>
                    {memberUids.map((uid) => (
                      <label
                        key={uid}
                        className="flex cursor-pointer items-center gap-2 py-1 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={participantUids.includes(uid)}
                          onChange={() => toggleParticipant(uid)}
                          className="accent-primary size-4"
                        />
                        {members[uid].displayName}
                      </label>
                    ))}
                  </div>
                )}

                {splitMode === "shares" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">{t("expenses.splitSharesHint")}</p>
                    {memberUids.map((uid) => (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 truncate text-sm sm:w-24">
                          {members[uid].displayName}
                        </span>
                        <Input
                          value={shareInputs[uid] ?? ""}
                          onChange={(event) =>
                            setShareInputs((current) => ({ ...current, [uid]: event.target.value }))
                          }
                          placeholder="0"
                          inputMode="numeric"
                        />
                        <span className="text-muted-foreground shrink-0 text-sm">
                          {t("expenses.sharesUnit")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {splitMode === "percent" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">
                      {t("expenses.splitPercentHint")}
                    </p>
                    {memberUids.map((uid) => (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 truncate text-sm sm:w-24">
                          {members[uid].displayName}
                        </span>
                        <Input
                          value={percentInputs[uid] ?? ""}
                          onChange={(event) =>
                            setPercentInputs((current) => ({
                              ...current,
                              [uid]: event.target.value,
                            }))
                          }
                          placeholder="0"
                          inputMode="decimal"
                        />
                        <span className="text-muted-foreground shrink-0 text-sm">%</span>
                      </div>
                    ))}
                    <PercentBalanceHint current={sumNumberInputs(percentInputs)} />
                  </div>
                )}

                {splitMode === "exact" && (
                  <div className="flex flex-col gap-2">
                    <p className="text-muted-foreground text-sm">{t("expenses.splitExactHint")}</p>
                    {memberUids.map((uid) => (
                      <div key={uid} className="flex items-center gap-2">
                        <span className="w-20 shrink-0 truncate text-sm sm:w-24">
                          {members[uid].displayName}
                        </span>
                        <Input
                          value={exactInputs[uid] ?? ""}
                          onChange={(event) =>
                            setExactInputs((current) => ({ ...current, [uid]: event.target.value }))
                          }
                          placeholder={`0,00 ${currency}`}
                          inputMode="decimal"
                        />
                      </div>
                    ))}
                    <MoneyBalanceHint
                      targetMinor={amountMinor}
                      currentMinor={sumMoneyInputs(exactInputs)}
                      currency={currency}
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
