import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PaymentDetailsForm } from "@/components/payment-details-form";
import { ProfileForm } from "@/components/profile-form";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";
import { avatarGradient } from "@/lib/utils";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const t = await getServerT();
  const name = session.displayName || session.email || "?";

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
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t("profile.paymentDetailsTitle")}</h2>
        <Card>
          <CardContent>
            <PaymentDetailsForm paypalEmail={session.paypalEmail ?? ""} iban={session.iban ?? ""} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
