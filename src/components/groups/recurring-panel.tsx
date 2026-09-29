"use client";

import { Pause, Play, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RecurringRuleDialog } from "@/components/groups/recurring-rule-dialog";
import { RowActions } from "@/components/groups/row-actions";
import { SectionHeading } from "@/components/groups/section-heading";
import { useT } from "@/components/locale-provider";
import { deleteRecurringRule, setRecurringRuleActive } from "@/lib/actions/recurring";
import { categoryColorClasses, categoryIconElement } from "@/lib/categories";
import { formatDayMonth } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { cn } from "@/lib/utils";
import { useOnline } from "@/lib/use-online";
import type { GroupMember, GroupRole, RecurringRule } from "@/lib/types";

/** Turns a server ActionResult error code into a message that says what to fix. */
function recurringActionErrorMessage(code: string, t: ReturnType<typeof useT>): string {
  switch (code) {
    case "not-owner":
      return t("recurring.errorNotOwner");
    case "rule-member-missing":
      return t("recurring.errorMemberMissing");
    case "forbidden":
      return t("errors.forbidden");
    case "not-found":
      return t("errors.notFound");
    default:
      return t("recurring.saveError");
  }
}

function RuleRow({
  rule,
  groupId,
  currentUid,
  currentRole,
}: {
  rule: RecurringRule;
  groupId: string;
  currentUid: string;
  currentRole: GroupRole;
}) {
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();
  const online = useOnline();
  const canManage = rule.createdBy === currentUid || isGroupManager(currentRole);

  async function handleToggleActive() {
    setBusy(true);
    setError(null);
    const result = await setRecurringRuleActive({
      groupId,
      ruleId: rule.id,
      active: !rule.active,
    });
    if (!result.ok) setError(recurringActionErrorMessage(result.error, t));
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteRecurringRule({ groupId, ruleId: rule.id });
    if (!result.ok) setError(recurringActionErrorMessage(result.error, t));
    setBusy(false);
  }

  return (
    <li className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            rule.active ? categoryColorClasses(rule.category) : "bg-muted text-muted-foreground",
          )}
        >
          {categoryIconElement(rule.category, "h-4 w-4")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn("truncate text-sm font-medium", !rule.active && "text-muted-foreground")}
          >
            {rule.description}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {rule.frequency === "weekly"
              ? t("recurring.frequencyWeekly")
              : t("recurring.frequencyMonthly")}
            {" · "}
            {rule.active
              ? t("recurring.nextRun", { date: formatDayMonth(new Date(rule.nextRunDate)) })
              : t("recurring.paused")}
          </span>
        </div>
        <span className="tabular-money shrink-0 text-sm font-semibold">
          {formatMoney(rule.amountMinor, rule.currency)}
        </span>
        {canManage && (
          <RowActions>
            <DropdownMenuItem disabled={busy || !online} onSelect={handleToggleActive}>
              {rule.active ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  {t("recurring.pause")}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  {t("recurring.resume")}
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={busy || !online}
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("common.delete")}
            </DropdownMenuItem>
          </RowActions>
        )}
      </div>
      {/* Controlled rather than trigger-based: a Radix AlertDialogTrigger nested
          inside a DropdownMenuItem fights the menu over focus as it unmounts. */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("recurring.deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("recurring.deleteConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-destructive pl-12 text-xs">{error}</p>}
    </li>
  );
}

export function RecurringPanel({
  groupId,
  rules,
  members,
  currency,
  currentUid,
}: {
  groupId: string;
  rules: RecurringRule[];
  members: Record<string, GroupMember>;
  currency: string;
  currentUid: string;
}) {
  const t = useT();
  const currentRole = members[currentUid]?.role ?? "member";

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        aside={
          <RecurringRuleDialog
            groupId={groupId}
            members={members}
            currency={currency}
            currentUid={currentUid}
          />
        }
      >
        {t("recurring.title")}
      </SectionHeading>
      {rules.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          {t("recurring.empty")}
        </p>
      ) : (
        <ul className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              groupId={groupId}
              currentUid={currentUid}
              currentRole={currentRole}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
