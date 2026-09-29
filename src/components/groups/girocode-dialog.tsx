"use client";

import { ImageDown, QrCode as QrCodeIcon, ScanLine } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/locale-provider";
import { QrCode, qrCodePngFile } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { saveBlob } from "@/lib/export/save-blob";
import { formatMoney } from "@/lib/format/money";
import { buildEpcPayload } from "@/lib/payment/epc-qr";
import { formatIban } from "@/lib/payment/validate";
import { isIosDevice } from "@/lib/platform";
import { cn } from "@/lib/utils";

/**
 * A GiroCode (EPC QR, see lib/payment/epc-qr.ts) for one balance line, with
 * the transfer spelled out beside it. It works in two directions, because a
 * phone can't scan its own screen:
 *
 * - `pay` — on a "you owe" line: the code for paying them, to scan from a
 *   second screen (the app open on a laptop) or to save as a picture.
 * - `show` — on an "owes you" line: your own code, to hold out to the person
 *   sitting across the table, who scans it with their banking app.
 *
 * Only a banking app can do anything with the code: a GiroCode is plain text,
 * not a link, so a phone's camera app offers a web search for it. The dialog
 * says so up front, because that's the first thing everyone tries.
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
  const label = t("balances.giroCodeQrLabel", { amount, name: recipientName });

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
        <p className="bg-muted flex gap-2 rounded-lg p-3 text-xs leading-relaxed">
          <ScanLine aria-hidden="true" className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">{t("balances.giroCodeScanLead")}</strong>{" "}
            {mode === "pay"
              ? t("balances.giroCodeScanPay")
              : t("balances.giroCodeScanShow", { name: payerName ?? "" })}
          </span>
        </p>
        <QrCode
          value={payload}
          label={label}
          className="mx-auto aspect-square w-full max-w-64 rounded-lg"
        />
        {mode === "pay" && <SaveImageButton payload={payload} caption={[label, reference]} />}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {details.map((detail) => (
            <div key={detail.label} className="contents">
              <dt className="text-muted-foreground">{detail.label}</dt>
              {/* IBANs wrap between their groups of four, never inside one. */}
              <dd className={cn("break-words", detail.mono && "font-mono text-[0.8rem]")}>
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

/**
 * iOS gets the share sheet: its "Bild sichern" is how a web app's picture
 * reaches Photos, where banking apps look — a download would land in Files.
 * Everywhere else a plain download is the direct route.
 */
function savesViaShareSheet(file: File): boolean {
  return (
    isIosDevice() &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

/**
 * For paying with only one phone: the code as a picture in the photo
 * library, where some banking apps can import it from. Lives inside the
 * dialog's content, so a failure message is gone the next time it opens.
 */
function SaveImageButton({ payload, caption }: { payload: string; caption: string[] }) {
  const t = useT();
  const [failed, setFailed] = useState(false);

  function handleSave() {
    setFailed(false);
    try {
      const file = qrCodePngFile(payload, caption, "girocode.png");
      if (!savesViaShareSheet(file)) {
        saveBlob(file, file.name);
        return;
      }
      // Only the file, no text: the point is a picture to save, not a message.
      navigator.share({ files: [file] }).catch((error: unknown) => {
        // Closing the sheet without picking anything isn't a failure.
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <Button type="button" variant="outline" size="sm" className="h-10" onClick={handleSave}>
        <ImageDown />
        {t("balances.giroCodeSaveImage")}
      </Button>
      {failed ? (
        <p role="alert" className="text-destructive text-xs">
          {t("balances.giroCodeSaveImageFailed")}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">{t("balances.giroCodeSaveImageHint")}</p>
      )}
    </div>
  );
}
