"use client";

import { Bell, BellRing, Loader2, Scale, Split, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useEffect, useState } from "react";
import { useLocale, useT } from "@/components/locale-provider";
import { PaymentDetailsForm } from "@/components/payment-details-form";
import { PaymentMethodsGuide } from "@/components/payment-methods-guide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeOnboarding } from "@/lib/actions/onboarding";
import type { TranslationKey } from "@/lib/i18n/translate";
import { currentSubscription, pushSupport, subscribeThisDevice } from "@/lib/push/client";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";

type Step = "notifications" | "welcome" | "payment";
type PushState = "checking" | "unsupported" | "ios-needs-install" | "denied" | "off" | "on";
type FeatureTheme = "orange" | "teal" | "rose";

const badgeBg: Record<FeatureTheme, string> = {
  orange: "bg-orange-50 dark:bg-orange-500/10",
  teal: "bg-teal-50 dark:bg-teal-500/10",
  rose: "bg-rose-50 dark:bg-rose-500/10",
};
const badgeText: Record<FeatureTheme, string> = {
  orange: "text-orange-600 dark:text-orange-400",
  teal: "text-teal-600 dark:text-teal-400",
  rose: "text-rose-600 dark:text-rose-400",
};

const FEATURES: {
  icon: typeof UserPlus;
  theme: FeatureTheme;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
}[] = [
  {
    icon: UserPlus,
    theme: "orange",
    titleKey: "onboarding.featureGroupsTitle",
    descriptionKey: "onboarding.featureGroupsDescription",
  },
  {
    icon: Split,
    theme: "teal",
    titleKey: "onboarding.featureSplitTitle",
    descriptionKey: "onboarding.featureSplitDescription",
  },
  {
    icon: Scale,
    theme: "rose",
    titleKey: "onboarding.featureBalanceTitle",
    descriptionKey: "onboarding.featureBalanceDescription",
  },
];

/**
 * The post-sign-in setup guide: a quick feature overview, then payment
 * details (reusing the same guide/form as the Profile page). Fully
 * skippable at any point — "Überspringen" and a successful payment save
 * both just call `completeOnboarding` and leave, see ADR-less decision in
 * the profile.onboardingReplayLink entry point on the Profile page for how
 * someone gets back here after skipping.
 */
export function OnboardingFlow({
  displayName,
  paypalEmail,
  iban,
  paypalMeHandle,
  accountHolderName,
  exitTo,
  uid,
  vapidPublicKey,
}: {
  displayName: string;
  paypalEmail: string;
  iban: string;
  paypalMeHandle: string;
  accountHolderName: string;
  exitTo: string;
  uid: string;
  /** Null when push isn't configured on the server: the notifications step is left out. */
  vapidPublicKey: string | null;
}) {
  const steps: Step[] = vapidPublicKey
    ? ["notifications", "welcome", "payment"]
    : ["welcome", "payment"];
  const [step, setStep] = useState<Step>(steps[0]);
  const [finishing, setFinishing] = useState(false);
  const [push, setPush] = useState<PushState>("checking");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState(false);
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const online = useOnline();

  useEffect(() => {
    if (!vapidPublicKey) return;
    let cancelled = false;
    async function detect(): Promise<PushState> {
      const support = pushSupport();
      if (support !== "supported") return support;
      if (Notification.permission === "denied") return "denied";
      return (await currentSubscription()) ? "on" : "off";
    }
    detect().then(
      (state) => !cancelled && setPush(state),
      () => !cancelled && setPush("unsupported"),
    );
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  // Asking for permission needs a tap, so this is the one button that does it;
  // a granted permission moves straight on, anything else stays to explain.
  async function enablePush() {
    if (!vapidPublicKey) return;
    setPushBusy(true);
    setPushError(false);
    try {
      const result = await subscribeThisDevice(uid, vapidPublicKey, locale);
      if (result.ok) {
        setPush("on");
        setStep("welcome");
      } else if (result.error === "denied") setPush("denied");
      else if (result.error !== "dismissed") setPushError(true);
    } catch (error) {
      console.error("Turning on push notifications failed", error);
      setPushError(true);
    } finally {
      setPushBusy(false);
    }
  }

  async function finish() {
    setFinishing(true);
    await completeOnboarding();
    router.push(exitTo);
    router.refresh();
  }

  const stepIndex = steps.indexOf(step) + 1;

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {steps
            .map((_, i) => i + 1)
            .map((index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === stepIndex ? "bg-primary w-6" : "bg-muted w-1.5",
                )}
              />
            ))}
          <span className="text-muted-foreground ml-1.5 text-xs">
            {t("onboarding.stepLabel", { current: stepIndex, total: steps.length })}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={finish} disabled={finishing}>
          {t("onboarding.skip")}
        </Button>
      </div>

      {step === "notifications" ? (
        <div className="animate-rise flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 pt-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
              {push === "on" ? <BellRing className="size-8" /> : <Bell className="size-8" />}
            </span>
            <h1 className="font-heading text-xl font-semibold">
              {t("onboarding.notificationsTitle")}
            </h1>
            <p className="text-muted-foreground text-sm">{t("onboarding.notificationsSubtitle")}</p>
          </div>
          {push === "unsupported" && <p className="text-sm">{t("notifications.unsupported")}</p>}
          {push === "ios-needs-install" && (
            <p className="text-sm">{t("notifications.iosInstall")}</p>
          )}
          {push === "denied" && <p className="text-sm">{t("notifications.denied")}</p>}
          {push === "on" && (
            <p className="text-success flex items-center gap-2 text-sm font-medium">
              <BellRing aria-hidden="true" className="size-4" />
              {t("notifications.activeOnDevice")}
            </p>
          )}
          {pushError && (
            <p role="alert" className="text-destructive text-xs">
              {t("notifications.error")}
            </p>
          )}
          {push === "checking" || push === "off" ? (
            <Button
              size="lg"
              className="w-full"
              disabled={push === "checking" || pushBusy || !online}
              onClick={enablePush}
            >
              <Bell />
              {pushBusy ? t("notifications.enabling") : t("onboarding.notificationsEnable")}
            </Button>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setStep("welcome")}>
              {t("onboarding.continueButton")}
            </Button>
          )}
          {(push === "checking" || push === "off") && (
            <Button variant="ghost" className="w-full" onClick={() => setStep("welcome")}>
              {t("onboarding.notificationsLater")}
            </Button>
          )}
        </div>
      ) : step === "welcome" ? (
        <div className="animate-rise flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            {steps[0] === "notifications" && (
              <button
                type="button"
                onClick={() => setStep("notifications")}
                className="text-muted-foreground hover:text-foreground w-fit text-xs underline-offset-2 hover:underline"
              >
                ← {t("onboarding.backButton")}
              </button>
            )}
            <h1 className="font-heading text-xl font-semibold">
              {t("onboarding.welcomeTitle", { name: displayName })}
            </h1>
            <p className="text-muted-foreground text-sm">{t("onboarding.welcomeSubtitle")}</p>
          </div>
          <ul className="flex flex-col gap-3">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <li
                  key={feature.titleKey}
                  className="animate-rise bg-card ring-foreground/10 shadow-e1 flex items-start gap-3 rounded-xl p-3 ring-1"
                  style={{ "--stagger": index + 1 } as CSSProperties}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-full",
                      badgeBg[feature.theme],
                      badgeText[feature.theme],
                    )}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{t(feature.titleKey)}</span>
                    <span className="text-muted-foreground text-xs">
                      {t(feature.descriptionKey)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button size="lg" className="w-full" onClick={() => setStep("payment")}>
            {t("onboarding.continueButton")}
          </Button>
        </div>
      ) : (
        <div className="animate-rise flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => setStep("welcome")}
              className="text-muted-foreground hover:text-foreground w-fit text-xs underline-offset-2 hover:underline"
            >
              ← {t("onboarding.backButton")}
            </button>
            <h1 className="font-heading text-xl font-semibold">{t("onboarding.paymentTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("onboarding.paymentSubtitle")}</p>
          </div>
          <PaymentMethodsGuide />
          <Card>
            <CardContent>
              <PaymentDetailsForm
                paypalEmail={paypalEmail}
                iban={iban}
                paypalMeHandle={paypalMeHandle}
                accountHolderName={accountHolderName}
                submitLabel={t("onboarding.paymentFinish")}
                onSaved={finish}
              />
            </CardContent>
          </Card>
          <p className="text-muted-foreground text-center text-xs">{t("onboarding.laterHint")}</p>
        </div>
      )}

      {finishing && (
        <div className="bg-background/70 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      )}
    </div>
  );
}
