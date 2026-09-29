"use client";

import { ChevronRight, LogOut, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditGroupDialog } from "@/components/groups/edit-group-dialog";
import { InviteShareButton } from "@/components/groups/invite-share-button";
import { MembersPanel } from "@/components/groups/members-panel";
import { RecurringPanel } from "@/components/groups/recurring-panel";
import { SectionHeading } from "@/components/groups/section-heading";
import { useT } from "@/components/locale-provider";
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
import { deleteGroup, leaveGroup } from "@/lib/actions/groups";
import { isGroupManager } from "@/lib/groups/permissions";
import type { Group, RecurringRule } from "@/lib/types";

/** The owner deletes, everyone else leaves — each behind a confirmation, and last on the page. */
function LeaveOrDeleteGroup({ group, currentUid }: { group: Group; currentUid: string }) {
  const router = useRouter();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = group.members[currentUid]?.role === "owner";

  async function handleLeave() {
    setBusy(true);
    setError(null);
    const result = await leaveGroup({ groupId: group.id });
    if (!result.ok) {
      setError(
        result.error === "owner-cannot-leave"
          ? t("groups.ownerCannotLeave")
          : result.error === "unsettled-balance"
            ? t("groups.unsettledBalanceError")
            : result.error === "in-recurring-rule"
              ? t("groups.leaveInRecurringRuleError")
              : t("groups.leaveGroupError"),
      );
      setBusy(false);
      return;
    }
    router.push("/groups");
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const result = await deleteGroup({ groupId: group.id });
    if (!result.ok) {
      setError(t("groups.deleteGroupError"));
      setBusy(false);
      return;
    }
    router.push("/groups");
  }

  return (
    <div className="flex flex-col gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant={isOwner ? "destructive" : "outline"}
            className="h-11 w-full justify-start"
            disabled={busy}
          >
            {isOwner ? <Trash2 /> : <LogOut />}
            {isOwner ? t("groups.deleteGroup") : t("groups.leaveGroup")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOwner ? t("groups.deleteGroupConfirm") : t("groups.leaveGroupConfirm")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOwner ? t("groups.deleteGroupConfirmBody") : t("groups.leaveGroupConfirmBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={isOwner ? "destructive" : "default"}
              onClick={isOwner ? handleDelete : handleLeave}
            >
              {isOwner ? t("groups.deleteGroup") : t("groups.leaveGroup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

/**
 * Everything about the group itself rather than its money, in the order
 * it's reached for: bringing people in, who's in, what repeats on its own,
 * and — last, set apart — changing or ending the group.
 */
export function GroupSettingsTab({
  group,
  recurringRules,
  currentUid,
}: {
  group: Group;
  recurringRules: RecurringRule[];
  currentUid: string;
}) {
  const t = useT();
  const canManage = isGroupManager(group.members[currentUid]?.role);

  return (
    <div className="flex flex-col gap-7">
      <section className="bg-card ring-foreground/10 shadow-e1 flex flex-col gap-3 rounded-2xl p-4 ring-1">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg leading-tight font-medium">
            {t("groups.inviteTitle")}
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">{t("groups.inviteBody")}</p>
        </div>
        <InviteShareButton group={group} variant="secondary" className="w-full" />
        <p className="text-muted-foreground text-center font-mono text-xs tracking-wider">
          {t("groups.inviteCodeInline", { code: group.inviteCode })}
        </p>
      </section>

      <MembersPanel groupId={group.id} members={group.members} currentUid={currentUid} />

      <RecurringPanel
        groupId={group.id}
        rules={recurringRules}
        members={group.members}
        currency={group.currency}
        currentUid={currentUid}
      />

      <section className="flex flex-col gap-3">
        <SectionHeading>{t("groups.manageTitle")}</SectionHeading>
        {canManage && (
          <EditGroupDialog
            group={group}
            trigger={
              <Button variant="outline" className="h-11 w-full justify-start">
                <Pencil />
                <span className="flex-1 text-left">{t("groups.editGroup")}</span>
                <ChevronRight className="text-muted-foreground" />
              </Button>
            }
          />
        )}
        <LeaveOrDeleteGroup group={group} currentUid={currentUid} />
      </section>
    </div>
  );
}
