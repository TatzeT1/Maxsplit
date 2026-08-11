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
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import type { Group } from "@/lib/types";

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
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">{t("groups.title")}</h1>
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
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center">
          <Users className="text-muted-foreground h-6 w-6" />
          <p className="text-muted-foreground text-sm">{t("groups.empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="hover:bg-accent active:bg-accent bg-card ring-foreground/10 flex items-center gap-3 rounded-xl p-4 ring-1 transition-colors"
              >
                <div className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
                  {group.name.charAt(0).toUpperCase() || "?"}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{group.name}</span>
                  <span className="text-muted-foreground text-sm">
                    {group.memberUids.length === 1
                      ? t("groups.memberCountSingular")
                      : t("groups.membersCount", { count: group.memberUids.length })}
                  </span>
                </div>
                <ChevronRight className="text-muted-foreground h-5 w-5 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
