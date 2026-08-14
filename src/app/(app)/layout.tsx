import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SessionGuard } from "@/components/session-guard";
import { isAdminSession } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/");

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppSidebar displayName={session.displayName} isAdmin={isAdminSession(session)} />
      <main className="flex flex-1 flex-col">
        <SessionGuard>{children}</SessionGuard>
      </main>
    </div>
  );
}
