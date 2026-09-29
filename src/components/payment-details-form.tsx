"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { updatePaymentDetails } from "@/lib/actions/profile";
import { EPC_MAX_NAME_CHARS } from "@/lib/payment/epc-qr";
import { callAction } from "@/lib/call-action";
import { useOnline } from "@/lib/use-online";

export function PaymentDetailsForm({
  paypalEmail,
  iban,
  paypalMeHandle,
  accountHolderName,
  submitLabel,
  onSaved,
}: {
  paypalEmail: string;
  iban: string;
  paypalMeHandle: string;
  accountHolderName: string;
  /** Overrides the submit button's label, e.g. "Fertig" when embedded in the onboarding flow. Defaults to "profile.save". */
  submitLabel?: string;
  /** Called after a successful save, in addition to the usual `router.refresh()` — lets the onboarding flow advance to the next step. */
  onSaved?: () => void;
}) {
  const [email, setEmail] = useState(paypalEmail);
  const [ibanValue, setIbanValue] = useState(iban);
  const [handle, setHandle] = useState(paypalMeHandle);
  const [holder, setHolder] = useState(accountHolderName);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    | "idle"
    | "success"
    | "error"
    | "invalid-paypal-email"
    | "invalid-iban"
    | "invalid-paypal-me-handle"
    | "invalid-account-holder"
  >("idle");
  const router = useRouter();
  const t = useT();
  const online = useOnline();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus("idle");
    const result = await callAction(() =>
      updatePaymentDetails({
        paypalEmail: email,
        iban: ibanValue,
        paypalMeHandle: handle,
        accountHolderName: holder,
      }),
    );
    setLoading(false);
    if (!result.ok) {
      setStatus(
        result.error === "invalid-paypal-email" ||
          result.error === "invalid-iban" ||
          result.error === "invalid-paypal-me-handle" ||
          result.error === "invalid-account-holder"
          ? result.error
          : "error",
      );
      return;
    }
    setStatus("success");
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-paypal-email">{t("profile.paypalEmailLabel")}</Label>
        <Input
          id="profile-paypal-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setStatus("idle");
          }}
          placeholder={t("profile.paypalEmailPlaceholder")}
          autoComplete="email"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-paypal-me-handle">{t("profile.paypalMeHandleLabel")}</Label>
        <Input
          id="profile-paypal-me-handle"
          value={handle}
          onChange={(event) => {
            // No live character filtering here — the field accepts a
            // pasted full link (https://paypal.me/…), which the server
            // action normalizes down to the bare username on save.
            setHandle(event.target.value);
            setStatus("idle");
          }}
          placeholder={t("profile.paypalMeHandlePlaceholder")}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-iban">{t("profile.ibanLabel")}</Label>
        <Input
          id="profile-iban"
          value={ibanValue}
          onChange={(event) => {
            setIbanValue(event.target.value);
            setStatus("idle");
          }}
          placeholder={t("profile.ibanPlaceholder")}
          autoComplete="off"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-account-holder">{t("profile.accountHolderLabel")}</Label>
        <Input
          id="profile-account-holder"
          value={holder}
          maxLength={EPC_MAX_NAME_CHARS}
          onChange={(event) => {
            setHolder(event.target.value);
            setStatus("idle");
          }}
          placeholder={t("profile.accountHolderPlaceholder")}
          autoComplete="name"
          aria-describedby="profile-account-holder-hint"
        />
        <p id="profile-account-holder-hint" className="text-muted-foreground text-xs">
          {t("profile.accountHolderHint")}
        </p>
      </div>
      <p className="text-muted-foreground text-sm">{t("profile.paymentDetailsHint")}</p>
      {status === "invalid-paypal-email" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidPaypalEmail")}</p>
      )}
      {status === "invalid-iban" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidIban")}</p>
      )}
      {status === "invalid-paypal-me-handle" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidPaypalMeHandle")}</p>
      )}
      {status === "invalid-account-holder" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidAccountHolder")}</p>
      )}
      {status === "error" && <p className="text-destructive text-sm">{t("profile.saveError")}</p>}
      {status === "success" && (
        <p className="text-muted-foreground text-sm">{t("profile.saveSuccess")}</p>
      )}
      <Button type="submit" disabled={loading || !online}>
        {loading ? t("common.loading") : (submitLabel ?? t("profile.save"))}
      </Button>
    </form>
  );
}
