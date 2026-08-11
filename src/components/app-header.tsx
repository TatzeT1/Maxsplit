import { ShieldCheck, User, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getServerT } from "@/lib/i18n/server";

export async function AppHeader({
  displayName,
  isAdmin,
}: {
  displayName: string | null;
  isAdmin: boolean;
}) {
  const t = await getServerT();
  return (
    <header
      className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur-sm"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 py-3">
        <Link href="/groups" className="font-heading flex items-center gap-2 text-lg font-semibold">
          <span className="shadow-primary/30 flex size-7 items-center justify-center rounded-lg bg-linear-to-br from-orange-400 to-rose-500 text-white shadow-sm">
            <Wallet className="size-4" />
          </span>
          {t("app.name")}
        </Link>
        <nav className="flex items-center gap-2">
          {displayName && (
            <Link
              href="/profile"
              className="text-muted-foreground hidden text-sm hover:underline sm:inline"
            >
              {displayName}
            </Link>
          )}
          <Button variant="ghost" size="icon" aria-label={t("profile.title")} asChild>
            <Link href="/profile">
              <User className="size-5" />
            </Link>
          </Button>
          {isAdmin && (
            <Button variant="ghost" size="icon" aria-label="Admin" asChild>
              <Link href="/admin">
                <ShieldCheck className="size-5" />
              </Link>
            </Button>
          )}
          <LanguageToggle />
          <ThemeToggle />
          <SignOutButton />
        </nav>
      </div>
    </header>
  );
}
