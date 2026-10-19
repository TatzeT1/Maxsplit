import Link from "next/link";
import { AdminAiCallList } from "@/components/admin/admin-ai-call-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiOverview } from "@/lib/admin/ai";
import { listUsers } from "@/lib/admin/users";
import { requireAdminSession } from "@/lib/auth/admin";
import { cn } from "@/lib/utils";

function limitLabel(limit: number): string {
  return limit === 0 ? "blocked" : String(limit);
}

export default async function AdminAiPage() {
  await requireAdminSession();

  const [overview, users] = await Promise.all([getAiOverview(), listUsers()]);
  const userNames = Object.fromEntries(
    users.map((user) => [user.uid, user.displayName || user.email || user.uid]),
  );
  const groupNames = Object.fromEntries(
    overview.groups.map((group) => [group.groupId, group.name]),
  );
  const requestsToday = overview.providers.reduce((sum, provider) => sum + provider.today, 0);

  const tiles: { label: string; value: number }[] = [
    { label: `Prompts ${overview.month}`, value: overview.promptsThisMonth },
    { label: "Requests today", value: requestsToday },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-8 p-4">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
            ← Admin
          </Link>
          <h1 className="text-xl font-semibold">AI usage</h1>
        </div>
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
        <h2 className="text-sm font-medium">Free-tier budget per model (UTC day)</h2>
        <p className="text-muted-foreground text-xs">
          Counted by this app — every HTTP request, retries included. Google offers no API for
          what&apos;s left; the budgets are the 2026-09 measurements, per Google Cloud project. The
          real quota is on the AI Studio quota page.
        </p>
        {overview.providers.length === 0 ? (
          <p className="text-muted-foreground text-sm">No requests this month.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.providers.map((provider) => {
              const left =
                provider.dailyBudget !== null
                  ? Math.max(0, provider.dailyBudget - provider.today)
                  : null;
              return (
                <li
                  key={provider.provider}
                  className="bg-card ring-foreground/10 flex flex-col gap-1.5 rounded-xl p-3 text-sm ring-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium break-all">{provider.provider}</span>
                    <span className="shrink-0 tabular-nums">
                      {provider.today}
                      {provider.dailyBudget !== null && ` / ${provider.dailyBudget}`} today
                    </span>
                  </div>
                  {provider.dailyBudget !== null && (
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          left === 0 ? "bg-destructive" : "bg-primary",
                        )}
                        style={{
                          width: `${Math.min(100, (provider.today / provider.dailyBudget) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {left !== null ? `~${left} left today · ` : "budget unknown · "}
                    {provider.month} this month
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Groups — prompts this month</h2>
        <ul className="flex flex-col gap-2">
          {overview.groups.map((group) => (
            <li key={group.groupId}>
              <Link
                href={`/admin/groups/${group.groupId}#ai`}
                className="hover:bg-accent bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-xl p-3 text-sm ring-1 transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden>{group.icon || group.name.charAt(0).toUpperCase() || "?"}</span>
                  <span className="truncate font-medium">{group.name}</span>
                </span>
                <span
                  className={cn(
                    "shrink-0 tabular-nums",
                    group.limit === 0 || group.used >= group.limit
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {group.used} / {limitLabel(group.limit)}
                  {!group.isDefault && " · own limit"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Latest prompts{overview.recentCalls && ` (${overview.recentCalls.length})`}
        </h2>
        {overview.recentCalls ? (
          <AdminAiCallList
            calls={overview.recentCalls}
            groupNames={groupNames}
            userNames={userNames}
          />
        ) : (
          <p className="text-destructive text-sm">
            Can&apos;t list prompts across groups yet: the aiCalls index isn&apos;t deployed. Run{" "}
            <code>pnpm exec firebase deploy --only firestore:indexes</code>. Each group&apos;s page
            shows its own.
          </p>
        )}
      </div>
    </div>
  );
}
