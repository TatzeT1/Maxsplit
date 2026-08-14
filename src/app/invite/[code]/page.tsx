import { Wallet } from "lucide-react";
import Link from "next/link";
import { InviteClient } from "@/components/groups/invite-client";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSession } from "@/lib/auth/session";
import { findGroupByInviteCode } from "@/lib/groups/lookup";
import { getServerT } from "@/lib/i18n/server";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [group, session, t] = await Promise.all([
    findGroupByInviteCode(code),
    getSession(),
    getServerT(),
  ]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <header
        className="relative z-10 flex items-center justify-between px-4 py-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <Link href="/" className="font-heading flex items-center gap-2 text-lg font-semibold">
          <span className="shadow-primary/30 shadow-e1 flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-rose-500 text-white">
            <Wallet className="size-4" />
          </span>
          {t("app.name")}
        </Link>
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      <AmbientBackdrop />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        {!group ? (
          <div className="animate-rise flex flex-col items-center gap-3">
            <h1 className="font-heading text-xl font-semibold">{t("invite.notFoundTitle")}</h1>
            <p className="text-muted-foreground text-sm">{t("invite.notFoundBody")}</p>
            <Link href="/" className="text-primary text-sm underline underline-offset-4">
              {t("common.back")}
            </Link>
          </div>
        ) : (
          <>
            <div className="animate-rise flex flex-col items-center gap-1">
              <h1 className="font-heading text-xl font-semibold">{t("invite.title")}</h1>
              <p className="font-heading text-2xl font-semibold">{group.groupName}</p>
            </div>
            <InviteClient code={code} groupName={group.groupName} signedIn={!!session} />
          </>
        )}
      </main>
    </div>
  );
}
