"use client";

import { Pause, Play, Repeat } from "lucide-react";
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
import { RecurringRuleDialog } from "@/components/groups/recurring-rule-dialog";
import { deleteRecurringRule, setRecurringRuleActive } from "@/lib/actions/recurring";
import { categoryIconElement } from "@/lib/categories";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { isGroupManager } from "@/lib/groups/permissions";
import { t } from "@/lib/i18n/de";
import type { GroupMember, GroupRole, RecurringRule } from "@/lib/types";

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
  const [error, setError] = useState<string | null>(null);
  const canManage = rule.createdBy === currentUid || isGroupManager(currentRole);

  async function handleToggleActive() {
    setBusy(true);
    setError(null);
    const result = await setRecurringRuleActive({
      groupId,
      ruleId: rule.id,
      active: !rule.active,
    });
    if (!result.ok) setError(t("recurring.saveError"));
    setBusy(false);
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteRecurringRule({ groupId, ruleId: rule.id });
    if (!result.ok) setError(t("recurring.saveError"));
    setBusy(false);
  }

  return (
    <li className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 ring-1">
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          {categoryIconElement(rule.category, "h-4 w-4")}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{rule.description}</span>
          <span className="text-muted-foreground truncate text-sm">
            {rule.frequency === "weekly"
              ? t("recurring.frequencyWeekly")
              : t("recurring.frequencyMonthly")}
            {" · "}
            {rule.active
              ? t("recurring.nextRun", { date: formatDate(new Date(rule.nextRunDate)) })
              : t("recurring.paused")}
          </span>
        </div>
        <span className="shrink-0 font-semibold">
          {formatMoney(rule.amountMinor, rule.currency)}
        </span>
      </div>
      {canManage && (
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" disabled={busy} onClick={handleToggleActive}>
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
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
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
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
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
  const currentRole = members[currentUid]?.role ?? "member";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Repeat className="h-4 w-4" />
          {t("recurring.title")}
        </h2>
        <RecurringRuleDialog
          groupId={groupId}
          members={members}
          currency={currency}
          currentUid={currentUid}
        />
      </div>
      {rules.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("recurring.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
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
    </div>
  );
}
