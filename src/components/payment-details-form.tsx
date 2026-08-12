"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/components/locale-provider";
import { updatePaymentDetails } from "@/lib/actions/profile";

export function PaymentDetailsForm({ paypalEmail, iban }: { paypalEmail: string; iban: string }) {
  const [email, setEmail] = useState(paypalEmail);
  const [ibanValue, setIbanValue] = useState(iban);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "success" | "error" | "invalid-paypal-email" | "invalid-iban"
  >("idle");
  const router = useRouter();
  const t = useT();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setStatus("idle");
    const result = await updatePaymentDetails({ paypalEmail: email, iban: ibanValue });
    setLoading(false);
    if (!result.ok) {
      setStatus(
        result.error === "invalid-paypal-email" || result.error === "invalid-iban"
          ? result.error
          : "error",
      );
      return;
    }
    setStatus("success");
    router.refresh();
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
      <p className="text-muted-foreground text-sm">{t("profile.paymentDetailsHint")}</p>
      {status === "invalid-paypal-email" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidPaypalEmail")}</p>
      )}
      {status === "invalid-iban" && (
        <p className="text-destructive text-sm">{t("profile.errorInvalidIban")}</p>
      )}
      {status === "error" && <p className="text-destructive text-sm">{t("profile.saveError")}</p>}
      {status === "success" && (
        <p className="text-muted-foreground text-sm">{t("profile.saveSuccess")}</p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? t("common.loading") : t("profile.save")}
      </Button>
    </form>
  );
}
