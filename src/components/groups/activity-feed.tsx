"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { deleteExpense } from "@/lib/actions/expenses";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { t } from "@/lib/i18n/de";
import type { Expense, GroupMember, Settlement } from "@/lib/types";

type ActivityItem =
  | { kind: "expense"; date: string; createdAt: string; expense: Expense }
  | { kind: "settlement"; date: string; createdAt: string; settlement: Settlement };

function ExpenseRow({
  expense,
  members,
  groupId,
  currentUid,
}: {
  expense: Expense;
  members: Record<string, GroupMember>;
  groupId: string;
  currentUid: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const payerUid = Object.keys(expense.paidBy)[0];
  const payerName = members[payerUid]?.displayName ?? "?";

  async function handleDelete() {
    setDeleting(true);
    await deleteExpense({ groupId, expenseId: expense.id });
    setDeleting(false);
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{expense.description}</span>
        <span className="text-muted-foreground text-sm">
          {t("expenses.paidByOne", { name: payerName })} · {formatDate(new Date(expense.date))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatMoney(expense.amountMinor, expense.currency)}</span>
        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
          {t("common.edit")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={deleting}>
              {t("common.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("expenses.deleteConfirm")}</AlertDialogTitle>
              <AlertDialogDescription>{t("expenses.deleteConfirmBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <AddExpenseDialog
        groupId={groupId}
        members={members}
        currency={expense.currency}
        currentUid={currentUid}
        expenseToEdit={expense}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </li>
  );
}

function SettlementRow({
  settlement,
  members,
}: {
  settlement: Settlement;
  members: Record<string, GroupMember>;
}) {
  const fromName = members[settlement.fromUid]?.displayName ?? "?";
  const toName = members[settlement.toUid]?.displayName ?? "?";

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
      <span className="text-sm">
        {t("activity.settlementRecorded", {
          from: fromName,
          to: toName,
          amount: formatMoney(settlement.amountMinor, settlement.currency),
        })}
      </span>
      <span className="text-muted-foreground text-sm">{formatDate(new Date(settlement.date))}</span>
    </li>
  );
}

export function ActivityFeed({
  expenses,
  settlements,
  members,
  groupId,
  currentUid,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  members: Record<string, GroupMember>;
  groupId: string;
  currentUid: string;
}) {
  const items: ActivityItem[] = [
    ...expenses.map(
      (expense): ActivityItem => ({
        kind: "expense",
        date: expense.date,
        createdAt: expense.createdAt,
        expense,
      }),
    ),
    ...settlements.map(
      (settlement): ActivityItem => ({
        kind: "settlement",
        date: settlement.date,
        createdAt: settlement.createdAt,
        settlement,
      }),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t("activity.title")}</h2>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("activity.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) =>
            item.kind === "expense" ? (
              <ExpenseRow
                key={`expense-${item.expense.id}`}
                expense={item.expense}
                members={members}
                groupId={groupId}
                currentUid={currentUid}
              />
            ) : (
              <SettlementRow
                key={`settlement-${item.settlement.id}`}
                settlement={item.settlement}
                members={members}
              />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
