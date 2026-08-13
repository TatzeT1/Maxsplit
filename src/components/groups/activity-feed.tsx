"use client";

import { Activity, Copy, Pencil, Receipt, Trash2 } from "lucide-react";
import { type CSSProperties, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { RowActions } from "@/components/groups/row-actions";
import { useT } from "@/components/locale-provider";
import { deleteExpense } from "@/lib/actions/expenses";
import { deleteSettlement } from "@/lib/actions/settlements";
import {
  CATEGORY_IDS,
  categoryColorClasses,
  categoryIconElement,
  categoryLabel,
  categoryRowTintClass,
} from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { SETTLEMENT_EMOJI } from "@/lib/emoji";
import { isGroupManager } from "@/lib/groups/permissions";
import type { TranslationKey } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
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

function expenseDeleteErrorMessage(code: string, t: ReturnType<typeof useT>): string {
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

function settlementDeleteErrorMessage(code: string, t: ReturnType<typeof useT>): string {
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
  style,
}: {
  expense: Expense;
  members: Record<string, GroupMember>;
  groupId: string;
  currentUid: string;
  style?: CSSProperties;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const t = useT();
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
    if (!result.ok) setDeleteError(expenseDeleteErrorMessage(result.error, t));
    setDeleting(false);
  }

  return (
    <li
      style={style}
      className="bg-card ring-foreground/10 hover:ring-foreground/20 animate-pop-in relative flex flex-col gap-1 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:shadow-sm"
    >
      <div className={cn("absolute inset-0 -z-10", categoryRowTintClass(expense.category))} />
      {/* Tight gaps and a menu pulled into the card's own padding: the
          description competes with the amount for a phone's width, and every
          pixel spent here truncates a shopping list item instead. */}
      <div className="relative flex items-center gap-2.5">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            categoryColorClasses(expense.category),
          )}
        >
          {expense.emoji ? (
            <span className="text-lg leading-none">{expense.emoji}</span>
          ) : (
            categoryIconElement(expense.category, "h-4 w-4")
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {/* Wraps rather than truncates: the description is the one thing a
              row exists to tell you, and "Neue Kaffeemaschi…" hides what the
              user themselves typed. Short titles keep the row at one line. */}
          <span className="line-clamp-2 font-medium">{expense.description}</span>
          <span className="text-muted-foreground truncate text-sm">
            {paidByText} · {formatDate(new Date(expense.date))}
            {expense.category && ` · ${categoryLabel(expense.category, t)}`}
          </span>
        </div>
        <span className="font-heading shrink-0 text-base font-semibold">
          {formatMoney(expense.amountMinor, expense.currency)}
        </span>
        <RowActions>
          <DropdownMenuItem onSelect={() => setDuplicateOpen(true)}>
            <Copy className="h-3.5 w-3.5" />
            {t("expenses.duplicate")}
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {t("common.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting}
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("common.delete")}
              </DropdownMenuItem>
            </>
          )}
        </RowActions>
      </div>
      {/* Controlled rather than trigger-based: a Radix AlertDialogTrigger nested
          inside a DropdownMenuItem fights the menu over focus as it unmounts. */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
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
  style,
}: {
  settlement: Settlement;
  members: Record<string, GroupMember>;
  groupId: string;
  currentUid: string;
  style?: CSSProperties;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const t = useT();
  const canEdit = settlement.createdBy === currentUid || isGroupManager(members[currentUid]?.role);
  const fromName = members[settlement.fromUid]?.displayName ?? "?";
  const toName = members[settlement.toUid]?.displayName ?? "?";

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteSettlement({ groupId, settlementId: settlement.id });
    if (!result.ok) setDeleteError(settlementDeleteErrorMessage(result.error, t));
    setDeleting(false);
  }

  return (
    <li
      style={style}
      className="border-success/30 bg-success/5 animate-pop-in flex flex-col gap-1 rounded-xl border border-dashed p-3"
    >
      <div className="flex items-center gap-3">
        <div className="bg-success/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <span className="text-lg leading-none">{SETTLEMENT_EMOJI}</span>
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
        {canEdit && (
          <RowActions>
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={deleting}
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </DropdownMenuItem>
          </RowActions>
        )}
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settlements.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settlements.deleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  style,
}: {
  entry: ActivityLogEntry;
  members: Record<string, GroupMember>;
  style?: CSSProperties;
}) {
  const t = useT();
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
    <li
      style={style}
      className="border-border/70 bg-muted/20 animate-pop-in flex items-center gap-3 rounded-xl border border-dashed p-3"
    >
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
  const t = useT();

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
                  {categoryLabel(id, t)}
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
          {items.map((item, index) => {
            const style = { animationDelay: `${Math.min(index, 8) * 40}ms` };
            return item.kind === "expense" ? (
              <ExpenseRow
                key={`expense-${item.expense.id}`}
                expense={item.expense}
                members={members}
                groupId={groupId}
                currentUid={currentUid}
                style={style}
              />
            ) : item.kind === "settlement" ? (
              <SettlementRow
                key={`settlement-${item.settlement.id}`}
                settlement={item.settlement}
                members={members}
                groupId={groupId}
                currentUid={currentUid}
                style={style}
              />
            ) : (
              <LogRow
                key={`log-${item.entry.id}`}
                entry={item.entry}
                members={members}
                style={style}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
