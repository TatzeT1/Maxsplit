"use client";

import { QrCode as QrCodeIcon } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/format/money";
import { buildEpcPayload } from "@/lib/payment/epc-qr";
import { formatIban } from "@/lib/payment/validate";

/**
 * A GiroCode (EPC QR, see lib/payment/epc-qr.ts) for one balance line, with
 * the transfer spelled out beside it. It works in two directions, because a
 * phone can't scan its own screen:
 *
 * - `pay` — on a "you owe" line: the code for paying them, to scan from a
 *   second screen (the app open on a laptop) or from a screenshot.
 * - `show` — on an "owes you" line: your own code, to hold out to the person
 *   sitting across the table, who scans it with their banking app.
 *
 * Euro only (EPC QR codes are), and only when the recipient has an IBAN.
 */
export function GiroCodeDialog({
  mode,
  recipientName,
  iban,
  amountMinor,
  groupName,
  payerName,
}: {
  mode: "pay" | "show";
  /** The account holder name if they set one, else their display name. */
  recipientName: string;
  iban: string;
  amountMinor: number;
  groupName: string;
  /** Who pays — only named in `show` mode. */
  payerName?: string;
}) {
  const t = useT();
  const reference = t("balances.giroCodeReferenceText", { group: groupName });
  const amount = formatMoney(amountMinor, "EUR");
  const payload = buildEpcPayload({ name: recipientName, iban, amountMinor, reference });

  const details = [
    { label: t("balances.giroCodeRecipient"), value: recipientName },
    { label: t("balances.giroCodeIban"), value: formatIban(iban), mono: true },
    { label: t("balances.giroCodeAmount"), value: amount },
    { label: t("balances.giroCodeReference"), value: reference },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-10">
          <QrCodeIcon />
          {mode === "pay" ? t("balances.giroCode") : t("balances.giroCodeShow")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "pay"
              ? t("balances.giroCodePayTitle")
              : t("balances.giroCodeShowTitle", { name: payerName ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {mode === "pay"
              ? t("balances.giroCodePayBody")
              : t("balances.giroCodeShowBody", { name: payerName ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <QrCode
          value={payload}
          label={t("balances.giroCodeQrLabel", { amount, name: recipientName })}
          className="mx-auto aspect-square w-full max-w-64 rounded-lg"
        />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt className="text-muted-foreground">{detail.label}</dt>
              <dd className={detail.mono ? "font-mono text-[0.8rem] break-all" : "break-words"}>
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
        {mode === "pay" && (
          <p className="text-muted-foreground text-xs">{t("balances.giroCodeCheck")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
