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
import { Input } from "@/components/ui/input";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { deleteExpense } from "@/lib/actions/expenses";
import { CATEGORY_IDS, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { t } from "@/lib/i18n/de";
import type { CategoryId, Expense, GroupMember, Settlement } from "@/lib/types";

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
  const canEdit = expense.createdBy === currentUid || isGroupManager(members[currentUid]?.role);
  const payerUids = Object.keys(expense.paidBy);
  const payerNames = payerUids.map((uid) => members[uid]?.displayName ?? "?");
  const paidByText =
    payerUids.length > 1
      ? t("expenses.paidByMultiple", { names: payerNames.join(", ") })
      : t("expenses.paidByOne", { name: payerNames[0] ?? "?" });
  async function handleDelete() {
    setDeleting(true);
    await deleteExpense({ groupId, expenseId: expense.id });
    setDeleting(false);
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
        {categoryIconElement(expense.category, "h-4 w-4")}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{expense.description}</span>
        <span className="text-muted-foreground text-sm">
          {paidByText} · {formatDate(new Date(expense.date))}
          {expense.category && ` · ${categoryLabel(expense.category)}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-medium">{formatMoney(expense.amountMinor, expense.currency)}</span>
        {canEdit && (
          <>
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
          </>
        )}
      </div>
      {canEdit && (
        <AddExpenseDialog
          groupId={groupId}
          members={members}
          currency={expense.currency}
          currentUid={currentUid}
          expenseToEdit={expense}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
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
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");

  const query = search.trim().toLowerCase();
  const filteredExpenses = expenses.filter((expense) => {
    if (categoryFilter !== "all" && expense.category !== categoryFilter) return false;
    if (query && !expense.description.toLowerCase().includes(query)) return false;
    return true;
  });
  const isFiltering = query.length > 0 || categoryFilter !== "all";

  const items: ActivityItem[] = [
    ...filteredExpenses.map((expense): ActivityItem => ({
      kind: "expense",
      date: expense.date,
      createdAt: expense.createdAt,
      expense,
    })),
    ...(isFiltering
      ? []
      : settlements.map((settlement): ActivityItem => ({
          kind: "settlement",
          date: settlement.date,
          createdAt: settlement.createdAt,
          settlement,
        }))),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{t("activity.title")}</h2>
      {expenses.length > 0 && (
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("expenses.searchPlaceholder")}
            className="flex-1"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as CategoryId | "all")}
            className="border-input h-8 rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none md:text-sm"
          >
            <option value="all">{t("expenses.filterAllCategories")}</option>
            {CATEGORY_IDS.map((id) => (
              <option key={id} value={id}>
                {categoryLabel(id)}
              </option>
            ))}
          </select>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {isFiltering ? t("expenses.noResults") : t("activity.empty")}
        </p>
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
