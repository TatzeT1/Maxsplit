import { FileDown, Heart, Scale, Split, UserPlus, type LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import type { CSSProperties } from "react";
import { BrandMark } from "@/components/brand-mark";
import { InstallAppButton } from "@/components/install-app-button";
import { LanguageToggle } from "@/components/language-toggle";
import { SignInButton } from "@/components/sign-in-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Monogram } from "@/components/ui/monogram";
import { getSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format/money";
import { getServerT } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translate";

const FEATURES: { icon: LucideIcon; title: TranslationKey; description: TranslationKey }[] = [
  {
    icon: UserPlus,
    title: "auth.featureInviteTitle",
    description: "auth.featureInviteDescription",
  },
  { icon: Split, title: "auth.featureSplitTitle", description: "auth.featureSplitDescription" },
  {
    icon: Scale,
    title: "auth.featureBalanceTitle",
    description: "auth.featureBalanceDescription",
  },
  { icon: FileDown, title: "auth.featurePdfTitle", description: "auth.featurePdfDescription" },
  { icon: Heart, title: "auth.featureFreeTitle", description: "auth.featureFreeDescription" },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/groups");
  const t = await getServerT();

  // The preview is the product itself, not an illustration of it: the same
  // till receipt the group page prints, with made-up but well-formed numbers.
  const lines = [
    { name: t("auth.previewNameA"), amountMinor: 8734 },
    { name: t("auth.previewNameB"), amountMinor: 3715 },
  ];
  const totalMinor = lines.reduce((sum, line) => sum + line.amountMinor, 0);

  return (
    <div className="relative flex flex-1 flex-col">
      <header
        className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <span className="font-heading flex items-center gap-2 text-lg font-medium">
          <BrandMark />
          {t("app.name")}
        </span>
        <div className="flex items-center gap-1">
          <InstallAppButton />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <AmbientBackdrop />

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-4">
        <section className="grid items-center gap-12 pt-10 pb-16 sm:pt-16 md:grid-cols-[1.1fr_1fr] md:gap-16 md:pt-24 md:pb-28">
          <div className="flex flex-col items-start gap-6">
            <h1
              className="font-heading animate-rise text-[clamp(2.6rem,11vw,4.25rem)] leading-[1.02] font-normal tracking-[-0.03em] text-balance"
              style={{ "--stagger": 0 } as CSSProperties}
            >
              {t("auth.heroTitle")}
              <br />
              {t("auth.heroTitleLine2Prefix")}{" "}
              <em className="text-muted-foreground font-light">{t("auth.heroTitleHighlight")}</em>
            </h1>
            <p
              className="text-muted-foreground animate-rise max-w-md text-base text-pretty sm:text-lg"
              style={{ "--stagger": 2 } as CSSProperties}
            >
              {t("auth.heroDescription")}
            </p>
            <div
              className="animate-rise flex w-full max-w-xs flex-col items-start gap-2"
              style={{ "--stagger": 4 } as CSSProperties}
            >
              <SignInButton />
              <p className="text-muted-foreground w-full text-center text-xs">
                {t("auth.signInSubtitle")}
              </p>
            </div>
          </div>

          <div
            className="animate-rise mx-auto w-full max-w-sm"
            style={{ "--stagger": 6 } as CSSProperties}
            aria-hidden="true"
          >
            <div className="mb-3 flex items-center gap-3 px-1">
              <span className="monogram flex size-9 items-center justify-center rounded-[0.7rem] text-base">
                🏠
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("auth.previewGroup")}</span>
                <span className="text-muted-foreground text-xs">{t("auth.previewMembers")}</span>
              </div>
            </div>
            <div className="paper-tokens">
              <div className="drop-shadow-[0_18px_28px_oklch(0.15_0.006_70/0.28)]">
                <div className="receipt-edges bg-card flex flex-col px-6 pt-7 pb-8">
                  <p className="text-muted-foreground flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase">
                    <span className="bg-success size-1.5 rounded-full" />
                    {t("balances.heroOwedToYou")}
                  </p>
                  <p className="display-figure pt-2 text-[3.25rem]">
                    {formatMoney(totalMinor, "EUR")}
                  </p>
                  <hr className="border-foreground/20 mt-5 mb-4 border-t-2 border-dashed" />
                  <ul className="flex flex-col gap-3">
                    {lines.map((line) => (
                      <li key={line.name} className="flex items-baseline gap-2 text-[0.95rem]">
                        <Monogram name={line.name} className="size-5 self-center text-[10px]" />
                        <span className="min-w-0 truncate">
                          {t("balances.lineOwesYou", { name: line.name })}
                        </span>
                        <span className="border-foreground/30 min-w-3 flex-1 -translate-y-1 border-b-2 border-dotted" />
                        <span className="tabular-money shrink-0 font-semibold">
                          {formatMoney(line.amountMinor, "EUR")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-border/70 border-t pt-14 pb-24">
          <div className="mb-10 flex max-w-xl flex-col gap-3">
            <span className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase">
              {t("auth.featuresEyebrow")}
            </span>
            <h2 className="font-heading text-3xl font-normal tracking-[-0.02em] text-balance sm:text-4xl">
              {t("auth.featuresTitle")}
            </h2>
            <p className="text-muted-foreground text-base text-pretty">
              {t("auth.featuresSubtitle")}
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex gap-4">
                <span className="monogram flex size-10 shrink-0 items-center justify-center rounded-[0.7rem]">
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium">{t(title)}</h3>
                  <p className="text-muted-foreground text-sm text-pretty">{t(description)}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-14 text-sm">{t("auth.heroSocialProof")}</p>
        </section>
      </main>
    </div>
  );
}
