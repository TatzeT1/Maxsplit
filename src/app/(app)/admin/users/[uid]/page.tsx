import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminUserActions } from "@/components/admin/admin-user-actions";
import { getUserDetail } from "@/lib/admin/users";
import { requireAdminSession } from "@/lib/auth/admin";

export default async function AdminUserPage({ params }: { params: Promise<{ uid: string }> }) {
  await requireAdminSession();
  const { uid } = await params;
  const user = await getUserDetail(uid);
  if (!user) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Admin
        </Link>
        <h1 className="text-xl font-semibold">{user.displayName || user.email || user.uid}</h1>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email ?? "—"}</dd>
        <dt className="text-muted-foreground">UID</dt>
        <dd className="break-all">{user.uid}</dd>
        <dt className="text-muted-foreground">Default currency</dt>
        <dd>{user.defaultCurrency ?? "—"}</dd>
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className={user.banned ? "text-destructive font-medium" : undefined}>
          {user.banned ? "Banned" : "Active"}
        </dd>
        <dt className="text-muted-foreground">Onboarding</dt>
        <dd>
          {user.onboardingCompletedAt
            ? `Done (${new Date(user.onboardingCompletedAt).toLocaleString()})`
            : "Not done yet"}
        </dd>
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Groups ({user.groups.length})</h2>
        {user.groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not a member of any group.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {user.groups.map((group) => (
              <li key={group.groupId}>
                <Link
                  href={`/admin/groups/${group.groupId}`}
                  className="hover:bg-accent bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-xl p-3 ring-1 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{group.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {group.role}
                      {group.archived ? " · archived" : ""} · {group.currency}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AdminUserActions
        uid={user.uid}
        banned={user.banned}
        onboardingCompletedAt={user.onboardingCompletedAt}
      />
    </div>
  );
}
