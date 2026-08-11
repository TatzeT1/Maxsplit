"use client";

import { PartyPopper } from "lucide-react";
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
import { editSettlement, recordSettlement } from "@/lib/actions/settlements";
import { formatMoney, parseMoneyInput } from "@/lib/format/money";
import type { GroupMember, Settlement } from "@/lib/types";

const CONFETTI_PIECES = [
  { left: "8%", color: "bg-orange-400", delay: "0ms", rotate: "-15deg" },
  { left: "20%", color: "bg-teal-400", delay: "80ms", rotate: "10deg" },
  { left: "32%", color: "bg-rose-400", delay: "40ms", rotate: "25deg" },
  { left: "44%", color: "bg-amber-400", delay: "120ms", rotate: "-20deg" },
  { left: "56%", color: "bg-violet-400", delay: "20ms", rotate: "15deg" },
  { left: "68%", color: "bg-emerald-400", delay: "100ms", rotate: "-10deg" },
  { left: "80%", color: "bg-sky-400", delay: "60ms", rotate: "20deg" },
  { left: "92%", color: "bg-fuchsia-400", delay: "140ms", rotate: "-25deg" },
  { left: "14%", color: "bg-amber-400", delay: "160ms", rotate: "30deg" },
  { left: "62%", color: "bg-rose-400", delay: "180ms", rotate: "-30deg" },
];

function SettlementCelebration({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <div className="relative flex size-20 items-center justify-center">
        <span className="border-success/60 animate-ring-burst absolute inset-0 rounded-full border-2" />
        <span className="bg-success text-success-foreground animate-celebrate-pop relative flex size-16 items-center justify-center rounded-full shadow-lg">
          <PartyPopper className="size-7" />
        </span>
        {CONFETTI_PIECES.map((piece, index) => (
          <span
            key={index}
            className={`animate-confetti-fall absolute top-2 size-1.5 rounded-sm ${piece.color}`}
            style={{ left: piece.left, animationDelay: piece.delay, rotate: piece.rotate }}
          />
        ))}
      </div>
      <p className="font-heading animate-pop-in text-center text-lg font-medium">{text}</p>
    </div>
  );
}

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
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
  settlementToEdit?: Settlement;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const memberUids = Object.keys(members);
  const otherUids = memberUids.filter((uid) => uid !== currentUid);

  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [fromUid, setFromUid] = useState(settlementToEdit?.fromUid ?? currentUid);
  const [toUid, setToUid] = useState(settlementToEdit?.toUid ?? otherUids[0] ?? currentUid);
  const [amountInput, setAmountInput] = useState(
    settlementToEdit ? moneyToInput(settlementToEdit.amountMinor) : "",
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
    setTimeout(() => {
      setCelebrating(false);
      setOpen(false);
      if (!settlementToEdit) {
        setAmountInput("");
        setDate(todayIsoDate());
        setNote("");
      }
    }, 1100);
  }

  return (
    <Dialog open={open} onOpenChange={celebrating ? undefined : setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent showCloseButton={!celebrating}>
        {celebrating ? (
          <SettlementCelebration
            text={`${t("settlements.celebrateTitle")} ${formatMoney(parseMoneyInput(amountInput) ?? 0, currency)}`}
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
