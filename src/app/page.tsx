import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { SignInButton } from "@/components/sign-in-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { FeaturePins } from "@/components/ui/feature-pins";
import { Hero10 } from "@/components/ui/hero-10";
import { InstallAppButton } from "@/components/install-app-button";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";

const HERO_IMAGES = ["/hero/split-groceries.png", "/hero/split-bill.png", "/hero/split-travel.png"];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/groups");
  const t = await getServerT();

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <header
        className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <span className="font-heading flex items-center gap-2 text-lg font-semibold">
          <span className="shadow-primary/30 shadow-e1 flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-white">
            <Wallet className="size-4" />
          </span>
          {t("app.name")}
        </span>
        <div className="flex items-center gap-1">
          <InstallAppButton />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <AmbientBackdrop />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4">
        <Hero10
          title={t("auth.heroTitle")}
          titleLine2Prefix={t("auth.heroTitleLine2Prefix")}
          titleHighlight={t("auth.heroTitleHighlight")}
          description={t("auth.heroDescription")}
          socialProof={t("auth.heroSocialProof")}
          images={HERO_IMAGES}
          imageAlts={[
            t("auth.heroImageAltGroceries"),
            t("auth.heroImageAltBill"),
            t("auth.heroImageAltTravel"),
          ]}
          animation="subtle"
          variant="compact"
          primaryCTA={{ ctaEnabled: false, text: "" }}
        />
        <div
          className="motion-safe:animate-rise -mt-2 flex flex-col items-center gap-2 pb-16 text-center"
          style={{ animationDelay: "260ms" }}
        >
          <SignInButton />
          <p className="text-muted-foreground text-xs">{t("auth.signInSubtitle")}</p>
        </div>

        <section className="w-full max-w-5xl px-4 pb-24">
          <div className="mx-auto mb-4 flex max-w-xl flex-col items-center gap-3 text-center">
            <span className="text-primary text-xs font-semibold tracking-wide uppercase">
              {t("auth.featuresEyebrow")}
            </span>
            <h2 className="font-heading text-2xl font-normal tracking-tight sm:text-3xl">
              {t("auth.featuresTitle")}
            </h2>
            <p className="text-muted-foreground text-sm sm:text-base">
              {t("auth.featuresSubtitle")}
            </p>
          </div>
          <FeaturePins
            features={[
              {
                title: t("auth.featureInviteTitle"),
                description: t("auth.featureInviteDescription"),
                icon: "invite",
                colorTheme: "orange",
              },
              {
                title: t("auth.featureSplitTitle"),
                description: t("auth.featureSplitDescription"),
                icon: "split",
                colorTheme: "teal",
              },
              {
                title: t("auth.featureBalanceTitle"),
                description: t("auth.featureBalanceDescription"),
                icon: "balance",
                colorTheme: "rose",
              },
              {
                title: t("auth.featurePdfTitle"),
                description: t("auth.featurePdfDescription"),
                icon: "pdf",
                colorTheme: "orange",
              },
              {
                title: t("auth.featureFreeTitle"),
                description: t("auth.featureFreeDescription"),
                icon: "free",
                colorTheme: "teal",
              },
            ]}
          />
        </section>
      </main>
    </div>
  );
}
