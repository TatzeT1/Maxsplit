import { Wallet } from "lucide-react";
import { redirect } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { SignInButton } from "@/components/sign-in-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";

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
          <span className="shadow-primary/30 flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-md">
            <Wallet className="size-4" />
          </span>
          {t("app.name")}
        </span>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* Animated gradient-mesh background: warm & teal blobs drifting behind a subtle paper-dot texture. */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-paper-texture absolute inset-0 opacity-[0.35]" />
        <div className="motion-safe:animate-float-a absolute -top-24 -left-24 size-72 rounded-full bg-orange-400/30 blur-3xl dark:bg-orange-500/20" />
        <div className="motion-safe:animate-float-b absolute top-1/3 -right-20 size-80 rounded-full bg-teal-400/25 blur-3xl dark:bg-teal-500/20" />
        <div className="motion-safe:animate-float-a absolute -bottom-28 left-1/4 size-72 rounded-full bg-fuchsia-400/20 blur-3xl [animation-delay:2s] dark:bg-fuchsia-500/15" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-8 px-4 text-center">
        <div className="flex flex-col gap-3">
          <h1
            className="motion-safe:animate-pop-in font-heading text-4xl font-semibold tracking-tight text-balance"
            style={{ animationDelay: "60ms" }}
          >
            {t("auth.signInTitle")}
          </h1>
          <p
            className="motion-safe:animate-pop-in text-muted-foreground max-w-sm text-balance"
            style={{ animationDelay: "160ms" }}
          >
            {t("auth.signInSubtitle")}
          </p>
        </div>
        <div className="motion-safe:animate-pop-in" style={{ animationDelay: "260ms" }}>
          <SignInButton />
        </div>
      </main>
    </div>
  );
}
