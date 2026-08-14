"use client";

import { type FormEvent, useState } from "react";
import { AnimatedMoney } from "@/components/ui/animated-money";
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
import { parseMoneyInput } from "@/lib/format/money";
import type { GroupMember, Settlement } from "@/lib/types";

/**
 * The one orchestrated moment in the app: a payment landing.
 *
 * Ten falling confetti particles and a party-popper glyph used to live here.
 * They were replaced rather than removed, because the beat itself is right —
 * settling a debt is the payoff the whole screen exists for and deserves to be
 * marked. What changed is the register. Confetti is a birthday; a debt being
 * cleared is a receipt being stamped, and the second one is what this app is
 * about.
 *
 * Four things run on one shared clock, in sequence rather than at once:
 * a glow blooms out from behind the disc, a single hairline ring expands and
 * fades, the checkmark draws itself stroke-first the way a pen would, and the
 * amount counts up. Sequencing is the whole trick — the same four effects fired
 * simultaneously read as a burst of noise, while staged over ~700ms they read
 * as one deliberate gesture with a beginning and an end.
 *
 * The checkmark's `pathLength="1"` normalises the stroke to a length of 1
 * regardless of the path's real geometry, so the dash offset that draws it does
 * not have to be recomputed if the path is ever edited.
 */
function SettlementCelebration({
  label,
  amountMinor,
  currency,
}: {
  label: string;
  amountMinor: number;
  currency: string;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="relative flex size-20 items-center justify-center">
        <span
          className="bg-success/25 animate-bloom absolute inset-0 rounded-full blur-xl"
          aria-hidden="true"
        />
        <span
          className="border-success/50 animate-settle-ring absolute inset-0 rounded-full border"
          aria-hidden="true"
          style={{ animationDelay: "120ms" }}
        />
        <span className="bg-success text-success-foreground shadow-e2 animate-rise relative flex size-16 items-center justify-center rounded-full">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-7"
            aria-hidden="true"
          >
            <path
              d="M5 13l4 4L19 7"
              pathLength={1}
              className="animate-draw-stroke [--stroke-length:1]"
              style={{ animationDelay: "180ms" }}
            />
          </svg>
        </span>
      </div>
      <p className="font-heading animate-rise text-center text-lg font-medium [--stagger:6]">
        {label} <AnimatedMoney amountMinor={amountMinor} currency={currency} countOnMount />
      </p>
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
          <SettlementCelebration
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
