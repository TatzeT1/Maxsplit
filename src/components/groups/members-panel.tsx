"use client";

import { Check, Copy, Pencil, ShieldCheck, UserMinus, Users, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { RowActions } from "@/components/groups/row-actions";
import { useT } from "@/components/locale-provider";
import {
  deleteGroup,
  leaveGroup,
  removeMember,
  renamePlaceholderMember,
  setMemberRole,
} from "@/lib/actions/groups";
import { isGroupManager } from "@/lib/groups/permissions";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { avatarGradient, cn } from "@/lib/utils";
import type { GroupMember, GroupRole } from "@/lib/types";

function CopyChip({ label, value }: { label: string; value: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => copy(value)}
      title={value}
      className={cn(
        "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-all duration-200 active:scale-95",
        copied
          ? "border-success/40 bg-success/10 text-success"
          : "border-input hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {copied ? <Check className="animate-rise h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {label}
    </button>
  );
}

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
  const [renaming, setRenaming] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [nameInput, setNameInput] = useState(member.displayName);
  const t = useT();
  const isSelf = uid === currentUid;
  const canManage =
    isGroupManager(currentRole) &&
    !isSelf &&
    member.role !== "owner" &&
    !(currentRole === "admin" && member.role === "admin");
  const canRename = canManage && member.isPlaceholder;

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
    if (!result.ok) {
      setError(
        result.error === "unsettled-balance"
          ? t("groups.unsettledBalanceError")
          : t("groups.removeMemberError"),
      );
    }
    setBusy(false);
  }

  function startRenaming() {
    setNameInput(member.displayName);
    setRenaming(true);
  }

  async function handleRename() {
    const name = nameInput.trim();
    if (!name || name === member.displayName) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await renamePlaceholderMember({ groupId, uid, displayName: name });
    setBusy(false);
    if (!result.ok) {
      setError(t("groups.renamePlaceholderError"));
      return;
    }
    setRenaming(false);
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-1 rounded-xl p-3 ring-1",
        member.role === "owner"
          ? "bg-primary/5 ring-primary/15"
          : member.role === "admin"
            ? "bg-accent/40 ring-foreground/10"
            : "bg-card ring-foreground/10",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "shadow-e1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-sm font-medium text-white",
            avatarGradient(member.displayName),
          )}
        >
          {member.displayName.charAt(0).toUpperCase() || "?"}
        </div>
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Input
              autoFocus
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setRenaming(false);
              }}
              className="h-8"
              disabled={busy}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.save")}
              disabled={busy}
              onClick={handleRename}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.cancel")}
              disabled={busy}
              onClick={() => setRenaming(false)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {member.displayName}
              {isSelf && t("groups.selfSuffix")}
            </span>
            {member.isPlaceholder ? <NotJoinedBadge /> : <RoleBadge role={member.role} />}
          </div>
        )}
        {canManage && !renaming && (
          <RowActions>
            {canRename && (
              <DropdownMenuItem onSelect={startRenaming}>
                <Pencil className="h-3.5 w-3.5" />
                {t("groups.renamePlaceholder")}
              </DropdownMenuItem>
            )}
            {currentRole === "owner" && !member.isPlaceholder && (
              <DropdownMenuItem disabled={busy} onSelect={handleRoleChange}>
                <ShieldCheck className="h-3.5 w-3.5" />
                {member.role === "admin" ? t("groups.removeAdmin") : t("groups.makeAdmin")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={() => setRemoveOpen(true)}
            >
              <UserMinus className="h-3.5 w-3.5" />
              {t("groups.removeMember")}
            </DropdownMenuItem>
          </RowActions>
        )}
      </div>
      {(member.paypalEmail || member.iban) && (
        <div className="flex flex-wrap gap-1.5 pl-12">
          {member.paypalEmail && (
            <CopyChip label={t("groups.copyPaypal")} value={member.paypalEmail} />
          )}
          {member.iban && <CopyChip label={t("groups.copyIban")} value={member.iban} />}
        </div>
      )}
      <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}>
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
            <AlertDialogAction onClick={handleRemove}>{t("groups.removeMember")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
          : result.error === "unsettled-balance"
            ? t("groups.unsettledBalanceError")
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
