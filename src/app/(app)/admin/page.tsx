import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminStats } from "@/lib/admin/stats";
import { isAdminEmail } from "@/lib/auth/admin";
import { getSession } from "@/lib/auth/session";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || !isAdminEmail(session.email)) notFound();

  const stats = await getAdminStats();

  const tiles: { label: string; value: number }[] = [
    { label: "Total users", value: stats.totalUsers },
    { label: "Total groups", value: stats.totalGroups },
    { label: "Active groups", value: stats.activeGroups },
    { label: "Archived groups", value: stats.archivedGroups },
    { label: "Total expenses", value: stats.totalExpenses },
    { label: "Total settlements", value: stats.totalSettlements },
  ];

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
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
  );
}
