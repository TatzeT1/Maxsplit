import { Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { NotificationSettings } from "@/components/notification-settings";
import { PaymentDetailsForm } from "@/components/payment-details-form";
import { PaymentMethodsGuide } from "@/components/payment-methods-guide";
import { ProfileForm } from "@/components/profile-form";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import { getVapidConfig } from "@/lib/push/vapid";
import { avatarGradient } from "@/lib/utils";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const t = await getServerT();
  const name = session.displayName || session.email || "?";
  // Read at request time and handed down, not NEXT_PUBLIC_: see lib/push/vapid.ts.
  const vapidPublicKey = getVapidConfig()?.publicKey ?? null;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">{t("profile.title")}</h1>
      <div className="animate-rise flex items-center gap-4">
        <div
          className={`bg-linear-to-br ${avatarGradient(name)} ring-card shadow-e1 flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-semibold text-white ring-2`}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-col">
          {session.displayName && (
            <span className="truncate font-medium">{session.displayName}</span>
          )}
          {session.email && (
            <span className="text-muted-foreground truncate text-sm">{session.email}</span>
          )}
        </div>
      </div>
      <Card>
        <CardContent>
          <ProfileForm displayName={session.displayName ?? ""} email={session.email ?? ""} />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t("profile.paymentDetailsTitle")}</h2>
          <Link
            href="/onboarding?replay=1"
            className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
          >
            <Sparkles className="size-3.5" />
            {t("profile.onboardingReplayLink")}
          </Link>
        </div>
        <PaymentMethodsGuide />
        <Card>
          <CardContent>
            <PaymentDetailsForm
              paypalEmail={session.paypalEmail ?? ""}
              iban={session.iban ?? ""}
              paypalMeHandle={session.paypalMeHandle ?? ""}
              accountHolderName={session.accountHolderName ?? ""}
            />
          </CardContent>
        </Card>
      </div>
      {vapidPublicKey && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{t("notifications.title")}</h2>
          <Card>
            <CardContent>
              <NotificationSettings
                uid={session.uid}
                vapidPublicKey={vapidPublicKey}
                prefs={session.notificationPrefs}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
