"use client";

import { Copy, Pencil, Receipt, Search, Trash2 } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AddExpenseDialog } from "@/components/groups/add-expense-dialog";
import { ExpenseDetailDialog } from "@/components/groups/expense-detail-dialog";
import { InviteShareButton } from "@/components/groups/invite-share-button";
import { RecordSettlementDialog } from "@/components/groups/record-settlement-dialog";
import { RowActions } from "@/components/groups/row-actions";
import { useT } from "@/components/locale-provider";
import { deleteExpense } from "@/lib/actions/expenses";
import { deleteSettlement } from "@/lib/actions/settlements";
import { categoryColorClasses, categoryIconElement, categoryLabel } from "@/lib/categories";
import { formatDayMonth, formatMonthKey } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { SETTLEMENT_EMOJI } from "@/lib/emoji";
import { isGroupManager } from "@/lib/groups/permissions";
import type { TranslationKey } from "@/lib/i18n/translate";
import { computeCategoryTotals } from "@/lib/money/category-totals";
import { expenseImpactFor } from "@/lib/money/expense-impact";
import { cn } from "@/lib/utils";
import { useOnline } from "@/lib/use-online";
import type {
  ActivityLogEntry,
  ActivityLogType,
  CategoryId,
  Expense,
  Group,
  GroupMember,
  Settlement,
} from "@/lib/types";

type ActivityItem =
  | { kind: "expense"; date: string; createdAt: string; expense: Expense }
  | { kind: "settlement"; date: string; createdAt: string; settlement: Settlement }
  | { kind: "log"; date: string; createdAt: string; entry: ActivityLogEntry };

/** Below this many expenses a search box is more furniture than help. */
const SEARCH_MIN_EXPENSES = 6;

const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

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

/** "du bekommst 69,12 €" / "du schuldest 13,50 €" / "nicht dabei" — your side of one expense. */
function ImpactLabel({ impact, currency }: { impact: number | null; currency: string }) {
  const t = useT();
  if (impact === null || impact === 0) {
    return (
      <span className="text-muted-foreground shrink-0">
        {impact === null ? t("expenses.impactNotInvolved") : t("expenses.impactEven")}
      </span>
    );
  }
  const amount = formatMoney(Math.abs(impact), currency);
  return (
    <span
      className={cn(
        "tabular-money shrink-0 font-semibold",
        impact > 0 ? "text-success" : "text-destructive",
      )}
    >
      {impact > 0 ? t("expenses.impactGets", { amount }) : t("expenses.impactOwes", { amount })}
    </span>
  );
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
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const t = useT();
  const online = useOnline();
  const canEdit = expense.createdBy === currentUid || isGroupManager(members[currentUid]?.role);
  const payerUids = Object.keys(expense.paidBy);
  const paidByText =
    payerUids.length > 1
      ? t("expenses.paidByMultiple", {
          names: listFormatter.format(
            payerUids.map((uid) =>
              uid === currentUid ? t("expenses.you") : (members[uid]?.displayName ?? "?"),
            ),
          ),
        })
      : payerUids[0] === currentUid
        ? t("expenses.paidBySelf")
        : t("expenses.paidByOne", { name: members[payerUids[0]]?.displayName ?? "?" });

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteExpense({ groupId, expenseId: expense.id });
    if (!result.ok) setDeleteError(expenseDeleteErrorMessage(result.error, t));
    setDeleting(false);
  }

  return (
    <li style={style} className="animate-rise flex flex-col gap-1">
      {/* Opens the read-only detail sheet on tap — role="button" rather than
          a native <button> because it wraps RowActions, itself an
          interactive trigger, and buttons can't nest buttons. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setDetailOpen(true);
          }
        }}
        className="hover:bg-muted/50 focus-visible:ring-ring/50 flex cursor-pointer items-center gap-2.5 py-3 pr-3 pl-3.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
      >
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            categoryColorClasses(expense.category),
          )}
        >
          {expense.emoji ? (
            <span className="text-base leading-none">{expense.emoji}</span>
          ) : (
            categoryIconElement(expense.category, "h-4 w-4")
          )}
        </div>
        {/* Two independent lines rather than two columns: the description
            gets the width the total doesn't need, and the paid-by text gets
            the width your share doesn't. The day lives in the month header
            and the detail sheet — on a phone it only ever fit truncated. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            {/* Wraps rather than truncates: the description is the one thing
                a row exists to tell you. */}
            <span className="line-clamp-2 min-w-0 text-[0.95rem] leading-snug font-medium">
              {expense.description}
            </span>
            <span className="font-heading tabular-money shrink-0 text-[0.95rem] font-semibold">
              {formatMoney(expense.amountMinor, expense.currency)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground min-w-0 truncate">{paidByText}</span>
            <ImpactLabel
              impact={expenseImpactFor(expense, currentUid)}
              currency={expense.currency}
            />
          </div>
        </div>
        {/* Keeps every menu interaction — including items rendered into the
            portaled dropdown, which still bubble through the React tree —
            from also triggering the row's onClick above. */}
        <span onClick={(event) => event.stopPropagation()}>
          <RowActions>
            <DropdownMenuItem disabled={!online} onSelect={() => setDuplicateOpen(true)}>
              <Copy className="h-3.5 w-3.5" />
              {t("expenses.duplicate")}
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuItem disabled={!online} onSelect={() => setEditOpen(true)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {t("common.edit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={deleting || !online}
                  onSelect={() => setDeleteOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("common.delete")}
                </DropdownMenuItem>
              </>
            )}
          </RowActions>
        </span>
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
      {deleteError && <p className="text-destructive px-4 pb-2 text-xs">{deleteError}</p>}
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
      <ExpenseDetailDialog
        expense={expense}
        members={members}
        open={detailOpen}
        onOpenChange={setDetailOpen}
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
  const online = useOnline();
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
    <li style={style} className="animate-rise bg-success/[0.06] flex flex-col gap-1">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="bg-success/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <span className="text-lg leading-none">{SETTLEMENT_EMOJI}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm leading-snug">
            {t("activity.settlementRecorded", {
              from: fromName,
              to: toName,
              amount: formatMoney(settlement.amountMinor, settlement.currency),
            })}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatDayMonth(new Date(settlement.date))}
          </span>
        </div>
        {canEdit && (
          <RowActions>
            <DropdownMenuItem disabled={!online} onSelect={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("common.edit")}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={deleting || !online}
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
      {deleteError && <p className="text-destructive px-4 pb-2 text-xs">{deleteError}</p>}
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

/** Edit/delete history: a quiet one-liner between the rows it's about, not a row of its own weight. */
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
      className="animate-rise text-muted-foreground flex items-center gap-3 px-4 py-2 text-xs"
    >
      <span className="flex w-10 shrink-0 justify-center">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">{text}</span>
      <span className="shrink-0">{formatDayMonth(new Date(entry.createdAt))}</span>
    </li>
  );
}

/**
 * Category filter chips that double as the spending breakdown: each carries
 * its category's total, biggest first, so "where does our money go" is
 * answered by the same control that filters the list. Replaces a separate
 * statistics card and a native select.
 */
function CategoryChips({
  expenses,
  currency,
  value,
  onChange,
}: {
  expenses: Expense[];
  currency: string;
  value: CategoryId | "all";
  onChange: (value: CategoryId | "all") => void;
}) {
  const t = useT();
  const totals = useMemo(() => computeCategoryTotals(expenses), [expenses]);
  const totalMinor = totals.reduce((sum, entry) => sum + entry.amountMinor, 0);
  if (totals.length < 2) return null;

  const chip = (active: boolean) =>
    cn(
      "flex h-9 shrink-0 touch-manipulation items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-(--duration-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      active
        ? "bg-foreground text-background border-foreground"
        : "bg-card border-border hover:bg-muted",
    );

  return (
    <div
      role="group"
      aria-label={t("expenses.filterAllCategories")}
      // Bleeds to the column edges and fades out on the right, so a row
      // longer than the screen reads as "swipe for more" rather than cut off.
      className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] px-4 pb-1 [&::-webkit-scrollbar]:hidden"
    >
      <button
        type="button"
        aria-pressed={value === "all"}
        onClick={() => onChange("all")}
        className={chip(value === "all")}
      >
        {t("expenses.filterAll")}
        <span className="tabular-money opacity-70">{formatMoney(totalMinor, currency)}</span>
      </button>
      {totals.map(({ category, amountMinor }) => (
        <button
          key={category}
          type="button"
          aria-pressed={value === category}
          onClick={() => onChange(value === category ? "all" : category)}
          className={chip(value === category)}
        >
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full",
              categoryColorClasses(category),
            )}
          >
            {categoryIconElement(category, "h-3 w-3")}
          </span>
          {categoryLabel(category, t)}
          <span className="tabular-money opacity-70">{formatMoney(amountMinor, currency)}</span>
        </button>
      ))}
      {/* Room for the fade to land on nothing instead of the last chip. */}
      <span aria-hidden="true" className="w-4 shrink-0" />
    </div>
  );
}

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * The group's ledger: expenses, payments and edit history, newest first and
 * grouped by month, each month one card with its spending total. Every
 * expense row answers "what does this mean for me" on the right — the
 * number people actually open a group to find.
 */
export function ActivityFeed({
  expenses,
  settlements,
  activityLog,
  group,
  currentUid,
}: {
  expenses: Expense[];
  settlements: Settlement[];
  activityLog: ActivityLogEntry[];
  group: Group;
  currentUid: string;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const t = useT();
  const members = group.members;

  const query = search.trim().toLowerCase();
  const filteredExpenses = expenses.filter((expense) => {
    if (categoryFilter !== "all" && (expense.category ?? "other") !== categoryFilter) return false;
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

  const months: { key: string; items: ActivityItem[]; totalMinor: number }[] = [];
  for (const item of items) {
    const key = monthKeyOf(item.date);
    let month = months[months.length - 1];
    if (!month || month.key !== key) {
      month = { key, items: [], totalMinor: 0 };
      months.push(month);
    }
    month.items.push(item);
    if (item.kind === "expense") month.totalMinor += item.expense.amountMinor;
  }

  const isEmpty = expenses.length === 0 && settlements.length === 0;
  const isAlone = Object.keys(members).length === 1;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center">
        <Receipt className="text-muted-foreground h-7 w-7" />
        <div className="flex flex-col gap-1">
          <p className="font-heading text-lg font-medium">{t("expenses.emptyTitle")}</p>
          <p className="text-muted-foreground max-w-xs text-sm text-pretty">
            {isAlone ? t("expenses.emptyBodySolo") : t("expenses.emptyBody")}
          </p>
        </div>
        {isAlone && <InviteShareButton group={group} variant="secondary" className="mt-1" />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* `empty:hidden`: with neither control needed, no stray gap is left behind. */}
      <div className="flex flex-col gap-2.5 empty:hidden">
        {(expenses.length >= SEARCH_MIN_EXPENSES || query.length > 0) && (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            />
            <Input
              type="search"
              enterKeyHint="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("expenses.searchPlaceholder")}
              aria-label={t("expenses.searchPlaceholder")}
              className="h-10 pl-9"
            />
          </div>
        )}
        <CategoryChips
          expenses={expenses}
          currency={group.currency}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center">
          <Receipt className="text-muted-foreground h-6 w-6" />
          <p className="text-muted-foreground text-sm">{t("expenses.noResults")}</p>
        </div>
      ) : (
        months.map((month) => (
          <section key={month.key} className="flex flex-col gap-2">
            <div className="text-muted-foreground flex items-baseline justify-between gap-3 px-1">
              <h3 className="font-mono text-[11px] tracking-[0.14em] uppercase">
                {formatMonthKey(month.key)}
              </h3>
              {month.totalMinor > 0 && (
                <span className="tabular-money text-xs">
                  {formatMoney(month.totalMinor, group.currency)}
                </span>
              )}
            </div>
            <ul className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y overflow-hidden rounded-xl ring-1">
              {month.items.map((item, index) => {
                const style = { "--stagger": Math.min(index, 8) } as CSSProperties;
                return item.kind === "expense" ? (
                  <ExpenseRow
                    key={`expense-${item.expense.id}`}
                    expense={item.expense}
                    members={members}
                    groupId={group.id}
                    currentUid={currentUid}
                    style={style}
                  />
                ) : item.kind === "settlement" ? (
                  <SettlementRow
                    key={`settlement-${item.settlement.id}`}
                    settlement={item.settlement}
                    members={members}
                    groupId={group.id}
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
          </section>
        ))
      )}
    </div>
  );
}
