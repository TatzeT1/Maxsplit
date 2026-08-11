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
    <div className="flex flex-1 flex-col">
      <header
        className="flex items-center justify-between border-b px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <span className="text-lg font-semibold">{t("app.name")}</span>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">{t("auth.signInTitle")}</h1>
          <p className="text-muted-foreground max-w-sm">{t("auth.signInSubtitle")}</p>
        </div>
        <SignInButton />
      </main>
    </div>
  );
}
