"use client";

import { Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AddPlaceholderDialog } from "@/components/groups/add-placeholder-dialog";
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
import { useT } from "@/components/locale-provider";
import { deleteGroup, leaveGroup, removeMember, setMemberRole } from "@/lib/actions/groups";
import { isGroupManager } from "@/lib/groups/permissions";
import { cn } from "@/lib/utils";
import type { GroupMember, GroupRole } from "@/lib/types";

function roleLabel(role: GroupRole, t: ReturnType<typeof useT>): string {
  if (role === "owner") return t("groups.roleOwner");
  if (role === "admin") return t("groups.roleAdmin");
  return t("groups.roleMember");
}

function RoleBadge({ role }: { role: GroupRole }) {
  const t = useT();
  if (role === "member") return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        role === "owner" ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground",
      )}
    >
      {roleLabel(role, t)}
    </span>
  );
}

function NotJoinedBadge() {
  const t = useT();
  return (
    <span className="text-muted-foreground bg-muted shrink-0 rounded-full px-2 py-0.5 text-xs font-medium">
      {t("groups.notJoinedBadge")}
    </span>
  );
}

function MemberRow({
  uid,
  member,
  groupId,
  currentUid,
  currentRole,
}: {
  uid: string;
  member: GroupMember;
  groupId: string;
  currentUid: string;
  currentRole: GroupRole;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const isSelf = uid === currentUid;
  const canManage =
    isGroupManager(currentRole) &&
    !isSelf &&
    member.role !== "owner" &&
    !(currentRole === "admin" && member.role === "admin");

  async function handleRoleChange() {
    setBusy(true);
    setError(null);
    const result = await setMemberRole({
      groupId,
      uid,
      role: member.role === "admin" ? "member" : "admin",
    });
    if (!result.ok) setError(t("groups.roleChangeError"));
    setBusy(false);
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    const result = await removeMember({ groupId, uid });
    if (!result.ok) setError(t("groups.removeMemberError"));
    setBusy(false);
  }

  return (
    <li className="bg-card ring-foreground/10 flex flex-col gap-1 rounded-xl p-3 ring-1">
      <div className="flex items-center gap-3">
        <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
          {member.displayName.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">
            {member.displayName}
            {isSelf && t("groups.selfSuffix")}
          </span>
          {member.isPlaceholder ? <NotJoinedBadge /> : <RoleBadge role={member.role} />}
        </div>
      </div>
      {canManage && (
        <div className="flex justify-end gap-2 pt-1">
          {currentRole === "owner" && !member.isPlaceholder && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={handleRoleChange}>
              {member.role === "admin" ? t("groups.removeAdmin") : t("groups.makeAdmin")}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy}>
                {t("groups.removeMember")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("groups.removeMemberConfirm", { name: member.displayName })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("groups.removeMemberConfirmBody", { name: member.displayName })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove}>
                  {t("groups.removeMember")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
    </li>
  );
}

export function MembersPanel({
  groupId,
  members,
  currentUid,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = useT();
  const currentRole = members[currentUid]?.role ?? "member";
  const isOwner = currentRole === "owner";

  async function handleLeave() {
    setBusy(true);
    setError(null);
    const result = await leaveGroup({ groupId });
    if (!result.ok) {
      setError(
        result.error === "owner-cannot-leave"
          ? t("groups.ownerCannotLeave")
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
    const result = await deleteGroup({ groupId });
    if (!result.ok) {
      setError(t("groups.deleteGroupError"));
      setBusy(false);
      return;
    }
    router.push("/groups");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="h-4 w-4" />
          {t("groups.members")}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">
            {Object.keys(members).length === 1
              ? t("groups.memberCountSingular")
              : t("groups.membersCount", { count: Object.keys(members).length })}
          </span>
          {isGroupManager(currentRole) && <AddPlaceholderDialog groupId={groupId} />}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {Object.entries(members).map(([uid, member]) => (
          <MemberRow
            key={uid}
            uid={uid}
            member={member}
            groupId={groupId}
            currentUid={currentUid}
            currentRole={currentRole}
          />
        ))}
      </ul>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex gap-2">
        {!isOwner && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                {t("groups.leaveGroup")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("groups.leaveGroupConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("groups.leaveGroupConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleLeave}>
                  {t("groups.leaveGroup")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {isOwner && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={busy}>
                {t("groups.deleteGroup")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("groups.deleteGroupConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("groups.deleteGroupConfirmBody")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={handleDelete}>
                  {t("groups.deleteGroup")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
