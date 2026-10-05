"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { CreateGroupDialog } from "@/components/groups/create-group-dialog";
import { JoinGroupDialog } from "@/components/groups/join-group-dialog";
import { GroupsOverview } from "@/components/groups/groups-overview";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import type { Group } from "@/lib/types";

const LIVE_SOURCES = ["groups"] as const;

export default function GroupsPage() {
  const user = useCurrentUser();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const t = useT();
  const online = useOnline();
  const { live, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(user ? `${user.uid}:groups` : null, live);

  useEffect(() => {
    if (!user) return;
    const groupsQuery = query(
      collection(db, "groups"),
      where("memberUids", "array-contains", user.uid),
    );
    return onSnapshot(
      groupsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setErrorCode(null);
        // Order is GroupsOverview's business: open balances first, archived last.
        setGroups(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Group));
        report("groups", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("groups", error));
      },
    );
  }, [user, report]);

  // Offline before this device ever loaded the list: an empty cache would
  // read as "Du hast noch keine Gruppen".
  if (user && !online && !live && syncedAt === null) {
    return <NeedsConnection body={t("offline.groupsNotSynced")} />;
  }

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
          user && <GroupsOverview groups={groups} uid={user.uid} />
        )}
      </div>
    </div>
  );
}
