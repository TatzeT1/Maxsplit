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
import { recordSettlement } from "@/lib/actions/settlements";
import { parseMoneyInput } from "@/lib/format/money";
import { t } from "@/lib/i18n/de";
import type { GroupMember } from "@/lib/types";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function RecordSettlementDialog({
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
  const otherUids = memberUids.filter((uid) => uid !== currentUid);

  const [open, setOpen] = useState(false);
  const [fromUid, setFromUid] = useState(currentUid);
  const [toUid, setToUid] = useState(otherUids[0] ?? currentUid);
  const [amountInput, setAmountInput] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amountMinor = parseMoneyInput(amountInput);
    if (amountMinor === null || amountMinor <= 0 || fromUid === toUid) {
      setError(true);
      return;
    }

    setLoading(true);
    setError(false);
    const result = await recordSettlement({
      groupId,
      fromUid,
      toUid,
      amountMinor,
      currency,
      date,
      note,
    });
    setLoading(false);

    if (!result.ok) {
      setError(true);
      return;
    }

    setOpen(false);
    setAmountInput("");
    setDate(todayIsoDate());
    setNote("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" className="w-full">
          {t("settlements.record")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("settlements.recordTitle")}</DialogTitle>
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
            {error && <p className="text-destructive text-sm">{t("settlements.saveError")}</p>}
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
