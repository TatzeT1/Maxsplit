import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { t } from "@/lib/i18n/de";

export function AppHeader({ displayName }: { displayName: string | null }) {
  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href="/groups" className="text-lg font-semibold">
        {t("app.name")}
      </Link>
      <nav className="flex items-center gap-2">
        {displayName && (
          <span className="text-muted-foreground hidden text-sm sm:inline">{displayName}</span>
        )}
        <ThemeToggle />
        <SignOutButton />
      </nav>
    </header>
  );
}
