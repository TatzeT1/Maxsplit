import { Gamepad2, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LanguageToggle } from "@/components/language-toggle";
import { SignInButton } from "@/components/sign-in-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import { estimateRoundPath } from "@/lib/games/round-paths";

/**
 * The link an estimate round's invite shares (WhatsApp, "Link kopieren"). Signed
 * in, it forwards straight to the round. Signed out — typically WhatsApp's
 * in-app browser, which doesn't share the phone browser's cookies — it asks for
 * a sign-in first and then lands on the round, instead of dumping the person on
 * the generic group list. Deliberately says nothing about the round or who's in
 * it: the visitor isn't known to be a group member yet.
 *
 * The sign-in shell is a copy of the tournament share page's (which is left
 * untouched); a shared shell can be extracted in a separate change.
 */
export default async function PlayEstimateInvitePage({
  params,
}: {
  params: Promise<{ groupId: string; roundId: string }>;
}) {
  const { groupId, roundId } = await params;
  // Ids go into a path; anything but a plain Firestore id can't be one.
  const safeId = /^[A-Za-z0-9_-]{1,128}$/;
  if (!safeId.test(groupId) || !safeId.test(roundId)) redirect("/");

  const target = estimateRoundPath(groupId, roundId);
  const session = await getSession();
  if (session) redirect(target);
  const t = await getServerT();

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
        <div className="animate-rise flex flex-col items-center gap-3">
          <span className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <Gamepad2 aria-hidden="true" className="size-7" />
          </span>
          <h1 className="font-heading text-2xl font-semibold">{t("play.title")}</h1>
          <p className="text-muted-foreground max-w-xs text-sm">{t("play.body")}</p>
        </div>
        <SignInButton redirectTo={target} />
      </main>
    </div>
  );
}
