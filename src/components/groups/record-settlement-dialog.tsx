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
import { SaveCelebration } from "@/components/ui/save-celebration";
import { useT } from "@/components/locale-provider";
import { editSettlement, recordSettlement } from "@/lib/actions/settlements";
import { parseMoneyInput } from "@/lib/format/money";
import type { GroupMember, Settlement } from "@/lib/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function moneyToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}

/** Turns a server ActionResult error code into a message that says what to fix. */
function settlementErrorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "invalid-parties":
      return t("settlements.errorInvalidParties");
    case "invalid-amount":
      return t("settlements.errorInvalidAmount");
    case "not-owner":
      return t("settlements.errorNotOwner");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("settlements.saveError");
  }
}

export function RecordSettlementDialog({
  groupId,
  members,
  currency,
  currentUid,
  settlementToEdit,
  prefillFromUid,
  prefillToUid,
  prefillAmountMinor,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
  settlementToEdit?: Settlement;
  /** Seeds the form for a specific debt (e.g. a "you owe" line's "Bezahlt" button) — ignored once settlementToEdit is set. */
  prefillFromUid?: string;
  prefillToUid?: string;
  prefillAmountMinor?: number;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const memberUids = Object.keys(members);
  const otherUids = memberUids.filter((uid) => uid !== currentUid);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [fromUid, setFromUid] = useState(settlementToEdit?.fromUid ?? prefillFromUid ?? currentUid);
  const [toUid, setToUid] = useState(
    settlementToEdit?.toUid ?? prefillToUid ?? otherUids[0] ?? currentUid,
  );
  const [amountInput, setAmountInput] = useState(
    settlementToEdit
      ? moneyToInput(settlementToEdit.amountMinor)
      : prefillAmountMinor
        ? moneyToInput(prefillAmountMinor)
        : "",
  );
  const [date, setDate] = useState(settlementToEdit?.date ?? todayIsoDate());
  const [note, setNote] = useState(settlementToEdit?.note ?? "");
  const [loading, setLoading] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amountInput);
    if (amountMinor === null || amountMinor <= 0) {
      setError(t("settlements.errorInvalidAmount"));
      return;
    }
    if (fromUid === toUid) {
      setError(t("settlements.errorInvalidParties"));
      return;
    }

    setLoading(true);
    setError(null);
    const payload = { groupId, fromUid, toUid, amountMinor, currency, date, note };
    const result = settlementToEdit
      ? await editSettlement({ ...payload, settlementId: settlementToEdit.id })
      : await recordSettlement(payload);
    setLoading(false);

    if (!result.ok) {
      setError(settlementErrorMessage(result.error, t));
      return;
    }

    setCelebrating(true);
    // Long enough for the sequence to finish rather than get cut off partway:
    // ring and checkmark land by ~700ms and the amount finishes counting at
    // ~880ms, so the result is legible and still on screen for a beat before
    // the dialog dismisses itself.
    setTimeout(() => {
      setCelebrating(false);
      setOpen(false);
      if (!settlementToEdit) {
        setAmountInput("");
        setDate(todayIsoDate());
        setNote("");
      }
    }, 1600);
  }

  return (
    <Dialog open={open} onOpenChange={celebrating ? undefined : setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent showCloseButton={!celebrating}>
        {celebrating ? (
          <SaveCelebration
            label={t("settlements.celebrateTitle")}
            amountMinor={parseMoneyInput(amountInput) ?? 0}
            currency={currency}
          />
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>
                {settlementToEdit ? t("settlements.editTitle") : t("settlements.recordTitle")}
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="settlement-from">{t("settlements.fromLabel")}</Label>
                <Select
                  id="settlement-from"
                  value={fromUid}
                  onChange={(event) => setFromUid(event.target.value)}
                >
                  {memberUids.map((uid) => (
                    <option key={uid} value={uid}>
                      {members[uid].displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settlement-to">{t("settlements.toLabel")}</Label>
                <Select
                  id="settlement-to"
                  value={toUid}
                  onChange={(event) => setToUid(event.target.value)}
                >
                  {memberUids.map((uid) => (
                    <option key={uid} value={uid}>
                      {members[uid].displayName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settlement-amount">{t("settlements.amountLabel")}</Label>
                <Input
                  id="settlement-amount"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  placeholder={`0,00 ${currency}`}
                  inputMode="decimal"
                  autoFocus
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settlement-date">{t("settlements.dateLabel")}</Label>
                <Input
                  id="settlement-date"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="settlement-note">{t("settlements.noteLabel")}</Label>
                <Input
                  id="settlement-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t("settlements.notePlaceholder")}
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
        )}
      </DialogContent>
    </Dialog>
  );
}
