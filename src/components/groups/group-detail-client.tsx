"use client";

import { collection, doc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { ActivityFeed } from "@/components/groups/activity-feed";
import { BalanceView } from "@/components/groups/balance-view";
import { EditGroupDialog } from "@/components/groups/edit-group-dialog";
import { MembersPanel } from "@/components/groups/members-panel";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { RecurringPanel } from "@/components/groups/recurring-panel";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { isGroupManager } from "@/lib/groups/permissions";
import { computeBalances, computePairwiseDebts } from "@/lib/money/balances";
import { avatarGradient, cn } from "@/lib/utils";
import type { ActivityLogEntry, Expense, Group, RecurringRule, Settlement } from "@/lib/types";

export function GroupDetailClient({ groupId }: { groupId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[] | null>(null);
  const [recurringRules, setRecurringRules] = useState<RecurringRule[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
      },
      (error) => {
        setErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    const expensesQuery = query(
      collection(db, "groups", groupId, "expenses"),
      orderBy("date", "desc"),
    );
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
        setErrorCode(reportSnapshotError("expenses", error));
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
        setErrorCode(reportSnapshotError("settlements", error));
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    const activityLogQuery = query(
      collection(db, "groups", groupId, "activityLog"),
      orderBy("createdAt", "desc"),
      limit(30),
    );
    return onSnapshot(
      activityLogQuery,
      (snapshot) => {
        setActivityLog(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ActivityLogEntry));
      },
      (error) => {
        setErrorCode(reportSnapshotError("activityLog", error));
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, "groups", groupId, "recurring"),
      (snapshot) => {
        setRecurringRules(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as RecurringRule));
      },
      (error) => {
        setErrorCode(reportSnapshotError("recurring", error));
      },
    );
  }, [groupId, user]);

  async function handleCopyInviteLink() {
    if (!group) return;
    const url = `${window.location.origin}/invite/${group.inviteCode}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  if (
    !group ||
    expenses === null ||
    settlements === null ||
    activityLog === null ||
    recurringRules === null ||
    !user
  ) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-2xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const balanceExpenses = expenses.map((expense) => ({
    paidBy: expense.paidBy,
    splits: Object.fromEntries(
      Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
    ),
  }));
  const net = computePairwiseDebts(balanceExpenses, settlements);
  const balances = computeBalances(balanceExpenses, settlements);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-paper-texture absolute inset-0 opacity-[0.25]" />
        <div
          className={`motion-safe:animate-float-a absolute -top-24 -left-20 size-72 rounded-full bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.15] blur-3xl`}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
        <div className="animate-pop-in flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold text-white shadow-sm ring-2`}
            >
              {group.icon || group.name.charAt(0).toUpperCase() || "?"}
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="font-heading truncate text-2xl font-semibold">{group.name}</h1>
              <button
                onClick={handleCopyInviteLink}
                className={cn(
                  "flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 active:scale-95",
                  copied
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-input hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {copied ? (
                  <Check className="animate-pop-in h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? t("groups.inviteCodeCopied") : t("groups.shareInvite")}
              </button>
            </div>
          </div>
          {isGroupManager(group.members[user.uid]?.role) && <EditGroupDialog group={group} />}
        </div>

        <BalanceView
          groupId={groupId}
          net={net}
          balances={balances}
          members={group.members}
          currentUid={user.uid}
          currency={group.currency}
        />

        <div className="grid grid-cols-2 gap-2">
          <AddExpenseDialog
            groupId={groupId}
            members={group.members}
            currency={group.currency}
            currentUid={user.uid}
            trigger={
              <Button size="lg" className="w-full">
                {t("expenses.add")}
              </Button>
            }
          />
          <RecordSettlementDialog
            groupId={groupId}
            members={group.members}
            currency={group.currency}
            currentUid={user.uid}
            trigger={
              <Button variant="outline" size="lg" className="w-full">
                {t("settlements.record")}
              </Button>
            }
          />
        </div>

        <MembersPanel groupId={groupId} members={group.members} currentUid={user.uid} />

        <RecurringPanel
          groupId={groupId}
          rules={recurringRules}
          members={group.members}
          currency={group.currency}
          currentUid={user.uid}
        />

        <ActivityFeed
          expenses={expenses}
          settlements={settlements}
          activityLog={activityLog}
          members={group.members}
          groupId={groupId}
          currentUid={user.uid}
        />
      </div>
    </div>
  );
}
