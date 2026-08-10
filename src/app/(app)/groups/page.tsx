"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { t } from "@/lib/i18n/de";
import type { Group } from "@/lib/types";

export default function GroupsPage() {
  const user = useCurrentUser();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

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
    <div className="flex flex-1 flex-col gap-6 p-4">
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
        <p className="text-muted-foreground">{t("groups.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.id}>
              <Link
                href={`/groups/${group.id}`}
                className="hover:bg-accent flex items-center justify-between rounded-lg border p-4 transition-colors"
              >
                <span className="font-medium">{group.name}</span>
                <span className="text-muted-foreground text-sm">
                  {group.memberUids.length === 1
                    ? t("groups.memberCountSingular")
                    : t("groups.membersCount", { count: group.memberUids.length })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
