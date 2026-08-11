import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <AppHeader displayName={session.displayName} isAdmin={isAdminEmail(session.email)} />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
