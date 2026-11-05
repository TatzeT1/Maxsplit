"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Receipt, Share2, Users } from "lucide-react";
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

const FIRST_STEPS = [
  { icon: Users, title: "groups.firstStep1Title", body: "groups.firstStep1Body" },
  { icon: Share2, title: "groups.firstStep2Title", body: "groups.firstStep2Body" },
  { icon: Receipt, title: "groups.firstStep3Title", body: "groups.firstStep3Body" },
] as const;

/**
 * The empty list as a short how-to: a first-timer who lands on "no groups"
 * should see what the app is for and what to do next, not just an empty box.
 */
function FirstSteps() {
  const t = useT();
  return (
    <section className="bg-card shadow-e1 animate-rise flex flex-col gap-5 rounded-2xl p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-medium">{t("groups.firstStepsTitle")}</h2>
        <p className="text-muted-foreground text-sm text-pretty">{t("groups.empty")}</p>
      </div>
      <ol className="flex flex-col gap-4">
        {FIRST_STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="flex gap-3.5">
            <span className="monogram relative flex size-10 shrink-0 items-center justify-center rounded-[0.7rem]">
              <Icon className="size-[18px]" strokeWidth={1.75} />
              <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full text-[11px] font-semibold">
                {index + 1}
              </span>
            </span>
            <div className="flex flex-col gap-0.5">
              <h3 className="font-medium">{t(title)}</h3>
              <p className="text-muted-foreground text-sm text-pretty">{t(body)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

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

  const heading = (
    <h1 className="text-muted-foreground animate-rise -mb-2 pt-4 text-xs font-medium tracking-[0.12em] uppercase">
      {t("groups.title")}
    </h1>
  );
  const actions = (
    <div className="animate-rise grid grid-cols-2 gap-2 *:w-full">
      <JoinGroupDialog />
      <CreateGroupDialog />
    </div>
  );

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <AmbientBackdrop />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-4 pt-6 pb-10">
        {user && errorCode ? (
          <>
            {heading}
            <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
              <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
              <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
            </div>
          </>
        ) : groups === null ? (
          <div className="flex flex-col gap-5 pt-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-16 w-56" />
            <Skeleton className="mt-4 h-48 w-full rounded-2xl" />
          </div>
        ) : groups.length === 0 ? (
          <>
            {heading}
            <FirstSteps />
            {actions}
            <p className="text-muted-foreground text-center text-sm text-pretty">
              {t("groups.firstStepsInvited")}
            </p>
          </>
        ) : (
          user && (
            <GroupsOverview groups={groups} uid={user.uid} heading={heading} actions={actions} />
          )
        )}
      </div>
    </div>
  );
}
