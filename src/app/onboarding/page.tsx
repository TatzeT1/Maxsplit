import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { replay } = await searchParams;
  const isReplay = replay === "1";
  // Not a replay and already done — sign-in always routes here, so a
  // returning user just bounces straight through to their groups.
  if (session.onboardingCompletedAt && !isReplay) redirect("/groups");

  const t = await getServerT();
  const exitTo = isReplay ? "/profile" : "/groups";
  const name = session.displayName || session.email || "?";

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
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <AmbientBackdrop />

      <OnboardingFlow
        displayName={name}
        paypalEmail={session.paypalEmail ?? ""}
        iban={session.iban ?? ""}
        paypalMeHandle={session.paypalMeHandle ?? ""}
        exitTo={exitTo}
      />
    </div>
  );
}
