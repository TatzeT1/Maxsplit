import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGroupActions } from "@/components/admin/admin-group-actions";
import { getGroupDetail } from "@/lib/admin/groups";
import { requireAdminSession } from "@/lib/auth/admin";

export default async function AdminGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  await requireAdminSession();
  const { groupId } = await params;
  const group = await getGroupDetail(groupId);
  if (!group) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <Link href="/admin" className="text-muted-foreground w-fit text-sm hover:underline">
          ← Admin
        </Link>
        <h1 className="text-xl font-semibold">{group.name}</h1>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Currency</dt>
        <dd>{group.currency}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>{group.archived ? "Archived" : "Active"}</dd>
        <dt className="text-muted-foreground">Invite code</dt>
        <dd>{group.inviteCode}</dd>
        <dt className="text-muted-foreground">Created</dt>
        <dd>{new Date(group.createdAt).toLocaleString()}</dd>
        <dt className="text-muted-foreground">Expenses</dt>
        <dd>{group.expenseCount.toLocaleString()}</dd>
        <dt className="text-muted-foreground">Settlements</dt>
        <dd>{group.settlementCount.toLocaleString()}</dd>
      </dl>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Members ({group.members.length})</h2>
        <ul className="flex flex-col gap-2">
          {group.members.map((member) => (
            <li
              key={member.uid}
              className="bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-xl p-3 ring-1"
            >
              <div className="flex flex-col">
                <span className="font-medium">{member.displayName || "(unnamed)"}</span>
                <span className="text-muted-foreground text-xs">
                  {member.role}
                  {member.isPlaceholder ? " · placeholder" : ""}
                </span>
              </div>
              {!member.isPlaceholder && (
                <Link
                  href={`/admin/users/${member.uid}`}
                  className="text-primary text-xs hover:underline"
                >
                  View user
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>

      <AdminGroupActions groupId={groupId} archived={group.archived} />
    </div>
  );
}
