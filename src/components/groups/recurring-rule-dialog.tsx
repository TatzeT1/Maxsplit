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
import { useT } from "@/components/locale-provider";
import { createRecurringRule } from "@/lib/actions/recurring";
import { CATEGORY_IDS, categoryLabel } from "@/lib/categories";
import { parseMoneyInput } from "@/lib/format/money";
import type { CategoryId, GroupMember, RecurringFrequency } from "@/lib/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Turns a server ActionResult error code into a message that says what to fix. */
function recurringErrorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "invalid-description":
      return t("expenses.errorInvalidDescription");
    case "invalid-amount":
      return t("expenses.errorInvalidAmount");
    case "invalid-participants":
      return t("expenses.errorInvalidParticipants");
    case "invalid-split":
      return t("expenses.amountMismatch");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("recurring.saveError");
  }
}

export function RecurringRuleDialog({
  groupId,
  members,
  currency,
  currentUid,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
}) {
  const memberUids = Object.keys(members);

  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [payerUid, setPayerUid] = useState(currentUid);
  const [participantUids, setParticipantUids] = useState<string[]>(memberUids);
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [startDate, setStartDate] = useState(todayIsoDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  function toggleParticipant(uid: string) {
    setParticipantUids((current) =>
      current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amountInput);
    if (amountMinor === null || amountMinor <= 0) {
      setError(t("expenses.errorInvalidAmount"));
      return;
    }
    if (participantUids.length === 0) {
      setError(t("expenses.errorInvalidParticipants"));
      return;
    }

    setLoading(true);
    setError(null);
    const result = await createRecurringRule({
      groupId,
      description,
      amountMinor,
      currency,
      category,
      payerUid,
      participantUids,
      frequency,
      startDate,
    });
    setLoading(false);

    if (!result.ok) {
      setError(recurringErrorMessage(result.error, t));
      return;
    }

    setOpen(false);
    setDescription("");
    setAmountInput("");
    setCategory(null);
    setPayerUid(currentUid);
    setParticipantUids(memberUids);
    setFrequency("monthly");
    setStartDate(todayIsoDate());
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t("recurring.add")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("recurring.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-description">{t("expenses.descriptionLabel")}</Label>
              <Input
                id="recurring-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("expenses.descriptionPlaceholder")}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-amount">{t("expenses.amountLabel")}</Label>
              <Input
                id="recurring-amount"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                placeholder={`0,00 ${currency}`}
                inputMode="decimal"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-category">{t("expenses.categoryLabel")}</Label>
              <Select
                id="recurring-category"
                value={category ?? ""}
                onChange={(event) => setCategory((event.target.value || null) as CategoryId | null)}
              >
                <option value="">{t("expenses.categoryPlaceholder")}</option>
                {CATEGORY_IDS.map((id) => (
                  <option key={id} value={id}>
                    {categoryLabel(id, t)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-payer">{t("expenses.paidByLabel")}</Label>
              <Select
                id="recurring-payer"
                value={payerUid}
                onChange={(event) => setPayerUid(event.target.value)}
              >
                {memberUids.map((uid) => (
                  <option key={uid} value={uid}>
                    {members[uid].displayName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("recurring.participantsLabel")}</Label>
              {memberUids.map((uid) => (
                <label key={uid} className="flex cursor-pointer items-center gap-2 py-1 text-sm">
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
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-frequency">{t("recurring.frequencyLabel")}</Label>
              <Select
                id="recurring-frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as RecurringFrequency)}
              >
                <option value="weekly">{t("recurring.frequencyWeekly")}</option>
                <option value="monthly">{t("recurring.frequencyMonthly")}</option>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="recurring-start-date">{t("recurring.startDateLabel")}</Label>
              <Input
                id="recurring-start-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" size="lg" className="w-full" disabled={loading}>
              {loading ? t("common.loading") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
