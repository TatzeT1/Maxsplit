"use client";

import { Loader2, Scale, Split, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type CSSProperties, useState } from "react";
import { useT } from "@/components/locale-provider";
import { PaymentDetailsForm } from "@/components/payment-details-form";
import { PaymentMethodsGuide } from "@/components/payment-methods-guide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { completeOnboarding } from "@/lib/actions/onboarding";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";

type Step = "welcome" | "payment";
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
  exitTo,
}: {
  displayName: string;
  paypalEmail: string;
  iban: string;
  paypalMeHandle: string;
  exitTo: string;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [finishing, setFinishing] = useState(false);
  const router = useRouter();
  const t = useT();

  async function finish() {
    setFinishing(true);
    await completeOnboarding();
    router.push(exitTo);
    router.refresh();
  }

  const stepIndex = step === "welcome" ? 1 : 2;

  return (
    <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {[1, 2].map((index) => (
            <span
              key={index}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                index === stepIndex ? "bg-primary w-6" : "bg-muted w-1.5",
              )}
            />
          ))}
          <span className="text-muted-foreground ml-1.5 text-xs">
            {t("onboarding.stepLabel", { current: stepIndex, total: 2 })}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={finish} disabled={finishing}>
          {t("onboarding.skip")}
        </Button>
      </div>

      {step === "welcome" ? (
        <div className="animate-rise flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
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
