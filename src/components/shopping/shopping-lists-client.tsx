"use client";

import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, ChevronRight, Plus, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { ShoppingListDialog } from "@/components/shopping/shopping-list-dialog";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import type { Group, ShoppingList } from "@/lib/types";

const LIVE_SOURCES = ["group", "lists"] as const;

/** `/groups/[groupId]/shopping`: the group's shopping lists, and a new one. */
export function ShoppingListsClient({ groupId }: { groupId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const online = useOnline();
  const t = useT();
  const { live, received, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(user ? `${user.uid}:shopping:${groupId}` : null, live);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      { includeMetadataChanges: true },
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
        report("group", snapshot);
      },
      (error) => setErrorCode(reportSnapshotError("group", error)),
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(collection(db, "groups", groupId, "shoppingLists"), orderBy("createdAt", "asc")),
      { includeMetadataChanges: true },
      (snapshot) => {
        setLists(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ShoppingList));
        report("lists", snapshot);
      },
      (error) => setErrorCode(reportSnapshotError("shopping-lists", error)),
    );
  }, [groupId, user, report]);

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  if (user && !online && !live && (syncedAt === null || (received("group") && !group))) {
    return <NeedsConnection body={t("shopping.listsNotSynced")} />;
  }

  if (!user || !group || lists === null) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3 p-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientBackdrop />
      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 pt-4 pb-8">
        <header className="flex items-center gap-3">
          <Link
            href={`/groups/${groupId}`}
            aria-label={t("shopping.back")}
            className="hover:bg-accent focus-visible:ring-ring/50 -ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="font-heading truncate text-2xl leading-tight font-medium">
              {t("shopping.title")}
            </h1>
            <span className="text-muted-foreground truncate text-xs">{group.name}</span>
          </div>
          <Button size="sm" disabled={!online} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t("shopping.newList")}
          </Button>
        </header>

        {lists.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
            <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-full">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <p className="text-muted-foreground text-sm">{t("shopping.noLists")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {lists.map((list) => (
              <li key={list.id}>
                <Link
                  href={`/groups/${groupId}/shopping/${list.id}`}
                  className="bg-card ring-foreground/10 hover:ring-foreground/20 hover:shadow-e1 flex items-center gap-3 rounded-xl p-3 ring-1 transition-all duration-200 active:scale-[0.99]"
                >
                  <span className="bg-primary/10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg">
                    {list.icon ?? "🛒"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{list.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {list.openCount > 0
                        ? t("shopping.openCount", { count: list.openCount })
                        : t("shopping.openCountNone")}
                    </span>
                  </span>
                  <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ShoppingListDialog
        groupId={groupId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={(listId) => router.push(`/groups/${groupId}/shopping/${listId}`)}
      />
    </div>
  );
}
