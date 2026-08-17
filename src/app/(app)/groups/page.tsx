"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { useT } from "@/components/locale-provider";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { avatarGradient, cn } from "@/lib/utils";
import type { Group } from "@/lib/types";

const MAX_VISIBLE_AVATARS = 4;

/**
 * Reads the cached `balancesMinor` (see types.ts) written by
 * recomputeGroupBalances — never recomputed here from the ledger, since that
 * would mean subscribing to every group's full expense subcollection just to
 * render a list. Renders nothing for a group created before that field
 * existed; it fills in on that group's next expense/settlement mutation.
 */
function GroupBalanceBadge({ group, uid }: { group: Group; uid: string }) {
  const t = useT();
  const amountMinor = group.balancesMinor?.[uid];
  if (amountMinor === undefined) return null;

  if (amountMinor === 0) {
    return (
      <span className="text-success shrink-0 text-xs font-medium">
        {t("groups.balanceSettled")}
      </span>
    );
  }

  const isOwedToYou = amountMinor > 0;
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-end gap-0.5",
        isOwedToYou ? "text-success" : "text-destructive",
      )}
    >
      <span className="font-heading tabular-money text-sm font-semibold">
        {formatMoney(Math.abs(amountMinor), group.currency)}
      </span>
      <span className="text-[10px] font-medium tracking-wide uppercase opacity-80">
        {isOwedToYou ? t("groups.balanceOwedToYouLabel") : t("groups.balanceYouOweLabel")}
      </span>
    </div>
  );
}

function MemberAvatarStack({ group }: { group: Group }) {
  const t = useT();
  const entries = Object.values(group.members);
  const visible = entries.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = entries.length - visible.length;

  return (
    <div className="flex -space-x-2">
      {visible.map((member, index) => (
        <div
          key={`${member.displayName}-${index}`}
          className={`ring-card bg-linear-to-br ${avatarGradient(member.displayName)} flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2`}
        >
          {member.displayName.charAt(0).toUpperCase() || "?"}
        </div>
      ))}
      {overflow > 0 && (
        <div className="ring-card bg-muted text-muted-foreground flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2">
          {t("groups.moreMembers", { count: overflow })}
        </div>
      )}
    </div>
  );
}

export default function GroupsPage() {
  const user = useCurrentUser();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    if (!user) return;
    const groupsQuery = query(
      collection(db, "groups"),
      where("memberUids", "array-contains", user.uid),
    );
    return onSnapshot(
      groupsQuery,
      (snapshot) => {
        setErrorCode(null);
        setGroups(
          snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }) as Group)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        );
      },
      (error) => {
        setErrorCode(reportSnapshotError("groups", error));
      },
    );
  }, [user]);

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-heading text-xl font-semibold">{t("groups.title")}</h1>
          <div className="flex gap-2">
            <JoinGroupDialog />
            <CreateGroupDialog />
          </div>
        </div>

        {user && errorCode ? (
          <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
            <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
            <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
          </div>
        ) : groups === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
            <Users className="text-muted-foreground h-6 w-6" />
            <p className="text-muted-foreground text-sm">{t("groups.empty")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((group, index) => (
              <li
                key={group.id}
                className="animate-rise"
                style={{ "--stagger": Math.min(index, 8) } as CSSProperties}
              >
                <Link
                  href={`/groups/${group.id}`}
                  className="group bg-card ring-foreground/10 hover:ring-primary/40 shadow-e1 hover:shadow-e2 active:shadow-e1 ease-spring relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 ring-1 transition-[transform,box-shadow,--tw-ring-color] duration-(--duration-fast) hover:-translate-y-0.5 active:scale-[0.995]"
                >
                  <div
                    className={`absolute inset-0 bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.12]`}
                  />
                  <div
                    className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card shadow-e1 relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white ring-2`}
                  >
                    {group.icon || group.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="relative flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate font-medium">{group.name}</span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <MemberAvatarStack group={group} />
                      <span className="text-muted-foreground text-xs">
                        {group.memberUids.length === 1
                          ? t("groups.memberCountSingular")
                          : t("groups.membersCount", { count: group.memberUids.length })}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <span className="bg-accent text-accent-foreground rounded-full px-1.5 py-0.5 font-medium">
                        {group.currency}
                      </span>
                      <span>
                        {t("groups.createdOn", { date: formatDate(new Date(group.createdAt)) })}
                      </span>
                    </div>
                  </div>
                  {user && <GroupBalanceBadge group={group} uid={user.uid} />}
                  <ChevronRight className="text-muted-foreground group-hover:text-primary relative h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
