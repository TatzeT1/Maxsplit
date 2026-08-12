"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { formatDate } from "@/lib/format/date";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { avatarGradient } from "@/lib/utils";
import type { Group } from "@/lib/types";

const MAX_VISIBLE_AVATARS = 4;

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
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-paper-texture absolute inset-0 opacity-[0.25]" />
        <div className="motion-safe:animate-float-a absolute -top-24 -right-20 size-72 rounded-full bg-orange-400/20 blur-3xl dark:bg-orange-500/15" />
        <div className="motion-safe:animate-float-b absolute top-1/2 -left-24 size-72 rounded-full bg-teal-400/15 blur-3xl dark:bg-teal-500/10" />
      </div>

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
                className="animate-pop-in"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
              >
                <Link
                  href={`/groups/${group.id}`}
                  className="group bg-card ring-foreground/10 hover:ring-primary/40 relative flex items-center gap-4 overflow-hidden rounded-2xl p-4 ring-1 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99] dark:hover:shadow-black/20"
                >
                  <div
                    className={`absolute inset-0 bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.12]`}
                  />
                  <div
                    className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold text-white shadow-sm ring-2`}
                  >
                    {group.name.charAt(0).toUpperCase() || "?"}
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
