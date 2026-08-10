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
import { addExpense, editExpense } from "@/lib/actions/expenses";
import { parseMoneyInput } from "@/lib/format/money";
import { t } from "@/lib/i18n/de";
import type { Expense, GroupMember } from "@/lib/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddExpenseDialog({
  groupId,
  members,
  currency,
  currentUid,
  expenseToEdit,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
  expenseToEdit?: Expense;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const memberUids = Object.keys(members);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [description, setDescription] = useState(expenseToEdit?.description ?? "");
  const [amountInput, setAmountInput] = useState(
    expenseToEdit ? (expenseToEdit.amountMinor / 100).toFixed(2).replace(".", ",") : "",
  );
  const [date, setDate] = useState(expenseToEdit?.date ?? todayIsoDate());
  const [paidByUid, setPaidByUid] = useState(
    expenseToEdit ? Object.keys(expenseToEdit.paidBy)[0] : currentUid,
  );
  const [participantUids, setParticipantUids] = useState<string[]>(
    expenseToEdit ? Object.keys(expenseToEdit.splits) : memberUids,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  function toggleParticipant(uid: string) {
    setParticipantUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amountInput);
    if (amountMinor === null || amountMinor <= 0 || participantUids.length === 0) {
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);

    const result = expenseToEdit
      ? await editExpense({
          groupId,
          expenseId: expenseToEdit.id,
          description,
          amountMinor,
          currency,
          date,
          paidByUid,
          participantUids,
        })
      : await addExpense({ groupId, description, amountMinor, currency, date, paidByUid, participantUids });

    setLoading(false);
    if (!result.ok) {
      setError(true);
      return;
    }

    setOpen(false);
    if (!expenseToEdit) {
      setDescription("");
      setAmountInput("");
      setParticipantUids(memberUids);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{expenseToEdit ? t("expenses.editTitle") : t("expenses.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
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
              <Label htmlFor="expense-paid-by">{t("expenses.paidByLabel")}</Label>
              <select
                id="expense-paid-by"
                value={paidByUid}
                onChange={(event) => setPaidByUid(event.target.value)}
                className="border-input h-8 w-full rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none md:text-sm"
              >
                {memberUids.map((uid) => (
                  <option key={uid} value={uid}>
                    {members[uid].displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("expenses.splitEqual")}</Label>
              <p className="text-muted-foreground text-sm">{t("expenses.splitEqualHint")}</p>
              <div className="flex flex-col gap-2">
                {memberUids.map((uid) => (
                  <label key={uid} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={participantUids.includes(uid)}
                      onChange={() => toggleParticipant(uid)}
                      className="accent-primary"
                    />
                    {members[uid].displayName}
                  </label>
                ))}
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{t("expenses.saveError")}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
