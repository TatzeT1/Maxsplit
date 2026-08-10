"use client";

import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { ActivityFeed } from "@/components/groups/activity-feed";
import { BalanceView } from "@/components/groups/balance-view";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { t } from "@/lib/i18n/de";
import { computePairwiseDebts } from "@/lib/money/balances";
import type { Expense, Group, Settlement } from "@/lib/types";

export function GroupDetailClient({ groupId }: { groupId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    const expensesQuery = query(collection(db, "groups", groupId, "expenses"), orderBy("date", "desc"));
    return onSnapshot(
      expensesQuery,
      (snapshot) => {
        setExpenses(
          snapshot.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Expense)
            .filter((expense) => !expense.deletedAt),
        );
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    const settlementsQuery = query(
      collection(db, "groups", groupId, "settlements"),
      orderBy("date", "desc"),
    );
    return onSnapshot(
      settlementsQuery,
      (snapshot) => {
        setSettlements(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Settlement));
      },
      (error) => {
        if (error.code !== "permission-denied") console.error(error);
      },
    );
  }, [groupId, user]);

  async function handleCopyInviteCode() {
    if (!group) return;
    await navigator.clipboard.writeText(group.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!group || expenses === null || settlements === null || !user) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const net = computePairwiseDebts(
    expenses.map((expense) => ({
      payerUid: Object.keys(expense.paidBy)[0],
      splits: Object.fromEntries(
        Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
      ),
    })),
    settlements,
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">{group.name}</h1>
        <button
          onClick={handleCopyInviteCode}
          className="text-muted-foreground w-fit text-left text-sm hover:underline"
        >
          {copied ? t("groups.inviteCodeCopied") : `${t("groups.inviteCodeLabel")}: ${group.inviteCode}`}
        </button>
      </div>

      <BalanceView net={net} members={group.members} currentUid={user.uid} currency={group.currency} />

      <div className="flex gap-2">
        <AddExpenseDialog
          groupId={groupId}
          members={group.members}
          currency={group.currency}
          currentUid={user.uid}
          trigger={<Button>{t("expenses.add")}</Button>}
        />
        <RecordSettlementDialog
          groupId={groupId}
          members={group.members}
          currency={group.currency}
          currentUid={user.uid}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t("groups.members")}</h2>
        <ul className="flex flex-col gap-1">
          {Object.entries(group.members).map(([uid, member]) => (
            <li key={uid} className="text-sm">
              {member.displayName}
              {uid === user.uid && " (du)"}
            </li>
          ))}
        </ul>
      </div>

      <ActivityFeed
        expenses={expenses}
        settlements={settlements}
        members={group.members}
        groupId={groupId}
        currentUid={user.uid}
      />
    </div>
  );
}
