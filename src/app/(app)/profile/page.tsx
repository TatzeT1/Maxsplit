import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile-form";
import { getSession } from "@/lib/auth/session";
import { getServerT } from "@/lib/i18n/server";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) redirect("/");

  const t = await getServerT();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">{t("profile.title")}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={session.displayName ?? ""} email={session.email ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
