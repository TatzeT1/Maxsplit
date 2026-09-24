import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminGroupActions } from "@/components/admin/admin-group-actions";
import { categoryIconElement } from "@/lib/categories";
import { getGroupDetail } from "@/lib/admin/groups";
import { requireAdminSession } from "@/lib/auth/admin";
import { formatDate, formatTime } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import type { ExpenseSplit } from "@/lib/types";

function memberName(members: { uid: string; displayName: string }[], uid: string): string {
  return members.find((member) => member.uid === uid)?.displayName || "(unknown)";
}

function paidBySummary(
  members: { uid: string; displayName: string }[],
  paidBy: Record<string, number>,
  currency: string,
): string {
  return Object.entries(paidBy)
    .map(
      ([uid, amountMinor]) => `${memberName(members, uid)} ${formatMoney(amountMinor, currency)}`,
    )
    .join(", ");
}

function splitSummary(
  members: { uid: string; displayName: string }[],
  splits: Record<string, ExpenseSplit>,
  currency: string,
): string {
  return Object.entries(splits)
    .map(
      ([uid, split]) => `${memberName(members, uid)} ${formatMoney(split.amountMinor, currency)}`,
    )
    .join(", ");
}

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
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {group.icon && <span aria-hidden>{group.icon}</span>}
          {group.name}
        </h1>
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

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Balances</h2>
        <ul className="flex flex-col gap-2">
          {group.members.map((member) => {
            const balanceMinor = group.balancesMinor[member.uid] ?? 0;
            return (
              <li
                key={member.uid}
                className="bg-card ring-foreground/10 flex items-center justify-between gap-3 rounded-xl p-3 ring-1"
              >
                <span className="font-medium">{member.displayName || "(unnamed)"}</span>
                <span
                  className={`tabular-nums ${balanceMinor > 0 ? "text-emerald-600 dark:text-emerald-400" : balanceMinor < 0 ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {formatMoney(balanceMinor, group.currency)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Expenses ({group.expenseCount})</h2>
        {group.expenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">No expenses yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {group.expenses.map((expense) => (
              <li
                key={expense.id}
                className="bg-card ring-foreground/10 flex flex-col gap-2 rounded-xl p-3 text-sm ring-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span aria-hidden>
                      {expense.emoji ?? categoryIconElement(expense.category, "h-4 w-4")}
                    </span>
                    <span className="truncate">{expense.description}</span>
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatMoney(expense.amountMinor, expense.currency)}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatDate(new Date(expense.date))}
                  {expense.category && ` · ${expense.category}`}
                  {expense.viaLottery && " · 🎲 lottery"}
                  {expense.deletedAt && (
                    <span className="text-destructive">
                      {" "}
                      · deleted {formatDate(new Date(expense.deletedAt))}
                    </span>
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  Paid by {paidBySummary(group.members, expense.paidBy, expense.currency)}
                </div>
                <div className="text-muted-foreground text-xs">
                  Split ({expense.splitMode}):{" "}
                  {splitSummary(group.members, expense.splits, expense.currency)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Settlements ({group.settlementCount})</h2>
        {group.settlements.length === 0 ? (
          <p className="text-muted-foreground text-sm">No settlements yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {group.settlements.map((settlement) => (
              <li
                key={settlement.id}
                className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 text-sm ring-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {memberName(group.members, settlement.fromUid)} →{" "}
                    {memberName(group.members, settlement.toUid)}
                  </span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatMoney(settlement.amountMinor, settlement.currency)}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {formatDate(new Date(settlement.date))}
                  {settlement.note && ` · ${settlement.note}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {group.recurringRules.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">Recurring rules ({group.recurringRules.length})</h2>
          <ul className="flex flex-col gap-2">
            {group.recurringRules.map((rule) => (
              <li
                key={rule.id}
                className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 text-sm ring-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{rule.description}</span>
                  <span className="whitespace-nowrap tabular-nums">
                    {formatMoney(rule.amountMinor, rule.currency)}
                  </span>
                </div>
                <div className="text-muted-foreground text-xs">
                  {rule.frequency} · next {formatDate(new Date(rule.nextRunDate))}
                  {!rule.active && " · inactive"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          Chat ({group.messageCount}
          {group.messageCount > group.messages.length
            ? `, showing last ${group.messages.length}`
            : ""}
          )
        </h2>
        {group.messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">No messages yet.</p>
        ) : (
          <ul className="bg-card ring-foreground/10 flex max-h-96 flex-col gap-2 overflow-y-auto rounded-xl p-3 ring-1">
            {group.messages.map((message) => {
              const createdAt = new Date(message.createdAt);
              return (
                <li key={message.id} className="text-sm">
                  <span className="font-medium">
                    {memberName(group.members, message.senderUid)}
                  </span>{" "}
                  <span className="text-muted-foreground text-xs">
                    {formatDate(createdAt)} {formatTime(createdAt)}
                  </span>
                  <p className="whitespace-pre-wrap">{message.text}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AdminGroupActions groupId={groupId} archived={group.archived} />
    </div>
  );
}
