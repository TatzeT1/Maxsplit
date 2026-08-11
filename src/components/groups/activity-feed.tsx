"use client";

import { Activity, ArrowRightLeft, Copy, Pencil, Receipt, Trash2 } from "lucide-react";
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
import { Select } from "@/components/ui/select";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { deleteExpense } from "@/lib/actions/expenses";
import { deleteSettlement } from "@/lib/actions/settlements";
import { CATEGORY_IDS, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { t, type TranslationKey } from "@/lib/i18n/de";
import type {
  ActivityLogEntry,
  ActivityLogType,
  CategoryId,
  Expense,
  GroupMember,
  Settlement,
} from "@/lib/types";

type ActivityItem =
  | { kind: "expense"; date: string; createdAt: string; expense: Expense }
  | { kind: "settlement"; date: string; createdAt: string; settlement: Settlement }
  | { kind: "log"; date: string; createdAt: string; entry: ActivityLogEntry };

function expenseDeleteErrorMessage(code: string): string {
  switch (code) {
    case "not-owner":
      return t("expenses.errorNotOwner");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("expenses.deleteError");
  }
}

function settlementDeleteErrorMessage(code: string): string {
  switch (code) {
    case "not-owner":
      return t("settlements.errorNotOwner");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("settlements.deleteError");
  }
}

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
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canEdit = expense.createdBy === currentUid || isGroupManager(members[currentUid]?.role);
  const payerUids = Object.keys(expense.paidBy);
  const payerNames = payerUids.map((uid) => members[uid]?.displayName ?? "?");
  const paidByText =
    payerUids.length > 1
      ? t("expenses.paidByMultiple", { names: payerNames.join(", ") })
      : t("expenses.paidByOne", { name: payerNames[0] ?? "?" });
  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteExpense({ groupId, expenseId: expense.id });
    if (!result.ok) setDeleteError(expenseDeleteErrorMessage(result.error));
    setDeleting(false);
  }

  return (
    <li className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 ring-1">
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          {categoryIconElement(expense.category, "h-4 w-4")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{expense.description}</span>
          <span className="text-muted-foreground truncate text-sm">
            {paidByText} · {formatDate(new Date(expense.date))}
            {expense.category && ` · ${categoryLabel(expense.category)}`}
          </span>
        </div>
        <span className="shrink-0 font-semibold">
          {formatMoney(expense.amountMinor, expense.currency)}
        </span>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={() => setDuplicateOpen(true)}>
          <Copy className="h-3.5 w-3.5" />
          {t("expenses.duplicate")}
        </Button>
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
      {deleteError && <p className="text-destructive text-xs">{deleteError}</p>}
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
      <AddExpenseDialog
        groupId={groupId}
        members={members}
        currency={expense.currency}
        currentUid={currentUid}
        duplicateFrom={expense}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
    </li>
  );
}

function SettlementRow({
  settlement,
  members,
  groupId,
  currentUid,
}: {
  settlement: Settlement;
  members: Record<string, GroupMember>;
  groupId: string;
  currentUid: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const canEdit = settlement.createdBy === currentUid || isGroupManager(members[currentUid]?.role);
  const fromName = members[settlement.fromUid]?.displayName ?? "?";
  const toName = members[settlement.toUid]?.displayName ?? "?";

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteSettlement({ groupId, settlementId: settlement.id });
    if (!result.ok) setDeleteError(settlementDeleteErrorMessage(result.error));
    setDeleting(false);
  }

  return (
    <li className="border-border/70 bg-muted/30 flex flex-col gap-1 rounded-xl border border-dashed p-3">
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <ArrowRightLeft className="h-4 w-4" />
        </div>
        <span className="flex-1 text-sm">
          {t("activity.settlementRecorded", {
            from: fromName,
            to: toName,
            amount: formatMoney(settlement.amountMinor, settlement.currency),
          })}
        </span>
        <span className="text-muted-foreground shrink-0 text-sm">
          {formatDate(new Date(settlement.date))}
        </span>
      </div>
      {canEdit && (
        <div className="flex justify-end gap-2 pt-1">
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
                <AlertDialogTitle>{t("settlements.deleteConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("settlements.deleteConfirmBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {deleteError && <p className="text-destructive text-xs">{deleteError}</p>}
      {canEdit && (
        <RecordSettlementDialog
          groupId={groupId}
          members={members}
          currency={settlement.currency}
          currentUid={currentUid}
          settlementToEdit={settlement}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </li>
  );
}

function LogRow({
  entry,
  members,
}: {
  entry: ActivityLogEntry;
  members: Record<string, GroupMember>;
}) {
  const name = members[entry.actorUid]?.displayName ?? "?";
  const logKeys: Record<ActivityLogType, TranslationKey> = {
    expense_edited: "activity.expenseEdited",
    expense_deleted: "activity.expenseDeleted",
    settlement_edited: "activity.settlementEdited",
    settlement_deleted: "activity.settlementDeleted",
  };
  const text = t(logKeys[entry.type], { name, description: entry.description });
  const isEdit = entry.type === "expense_edited" || entry.type === "settlement_edited";
  const Icon = isEdit ? Pencil : Trash2;

  return (
    <li className="border-border/70 bg-muted/20 flex items-center gap-3 rounded-xl border border-dashed p-3">
      <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-muted-foreground flex-1 text-sm">{text}</span>
      <span className="text-muted-foreground shrink-0 text-sm">
        {formatDate(new Date(entry.createdAt))}
      </span>
    </li>
  );
}

export function ActivityFeed({
  expenses,
  settlements,
  activityLog,
  members,
  groupId,
  currentUid,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  activityLog: ActivityLogEntry[];
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
      : [
          ...settlements.map((settlement): ActivityItem => ({
            kind: "settlement",
            date: settlement.date,
            createdAt: settlement.createdAt,
            settlement,
          })),
          ...activityLog.map((entry): ActivityItem => ({
            kind: "log",
            date: entry.createdAt,
            createdAt: entry.createdAt,
            entry,
          })),
        ]),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Activity className="h-4 w-4" />
        {t("activity.title")}
      </h2>
      {expenses.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("expenses.searchPlaceholder")}
            className="flex-1"
          />
          <div className="sm:w-44 sm:shrink-0">
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as CategoryId | "all")}
            >
              <option value="all">{t("expenses.filterAllCategories")}</option>
              {CATEGORY_IDS.map((id) => (
                <option key={id} value={id}>
                  {categoryLabel(id)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <Receipt className="text-muted-foreground h-6 w-6" />
          <p className="text-muted-foreground text-sm">
            {isFiltering ? t("expenses.noResults") : t("activity.empty")}
          </p>
        </div>
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
            ) : item.kind === "settlement" ? (
              <SettlementRow
                key={`settlement-${item.settlement.id}`}
                settlement={item.settlement}
                members={members}
                groupId={groupId}
                currentUid={currentUid}
              />
            ) : (
              <LogRow key={`log-${item.entry.id}`} entry={item.entry} members={members} />
            ),
          )}
        </ul>
      )}
    </div>
  );
}
