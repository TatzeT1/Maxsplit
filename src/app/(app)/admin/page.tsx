import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminStats } from "@/lib/admin/stats";
import { listGroups } from "@/lib/admin/groups";
import { listUsers } from "@/lib/admin/users";
import { requireAdminSession } from "@/lib/auth/admin";

export default async function AdminPage() {
  await requireAdminSession();

  const [stats, users, groups] = await Promise.all([getAdminStats(), listUsers(), listGroups()]);

  const tiles: { label: string; value: number }[] = [
    { label: "Total users", value: stats.totalUsers },
    { label: "Total groups", value: stats.totalGroups },
    { label: "Active groups", value: stats.activeGroups },
    { label: "Archived groups", value: stats.archivedGroups },
    { label: "Total expenses", value: stats.totalExpenses },
    { label: "Total settlements", value: stats.totalSettlements },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 p-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Admin</h1>
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <Card key={tile.label}>
              <CardHeader>
                <CardTitle className="text-muted-foreground text-xs font-normal tracking-wide uppercase">
                  {tile.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{tile.value.toLocaleString()}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Users ({users.length})</h2>
        {users.length === 0 ? (
          <p className="text-muted-foreground text-sm">No users yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {users.map((user) => (
              <li key={user.uid}>
                <Link
                  href={`/admin/users/${user.uid}`}
                  className="hover:bg-accent bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-3 ring-1 transition-colors"
                >
                  <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {(user.displayName || user.email || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {user.displayName || "(no name)"}
                      {user.banned && (
                        <span className="text-destructive ml-2 text-xs font-normal">banned</span>
                      )}
                      {!user.onboardingCompletedAt && (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          onboarding pending
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email ?? "—"}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Groups ({groups.length})</h2>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">No groups yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((group) => (
              <li key={group.groupId}>
                <Link
                  href={`/admin/groups/${group.groupId}`}
                  className="hover:bg-accent bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-3 ring-1 transition-colors"
                >
                  <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                    {group.icon || group.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{group.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {group.memberCount} member{group.memberCount === 1 ? "" : "s"} ·{" "}
                      {group.currency}
                      {group.archived ? " · archived" : ""}
                    </span>
                  </div>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
