"use client";

import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { ChevronRight, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/locale-provider";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { ShoppingList } from "@/lib/types";

/** Lists named on the card before it says "+n". */
const LISTS_SHOWN = 3;

/** The group page's way into its shopping lists — what's still open, at a glance. */
export function ShoppingEntryCard({ groupId }: { groupId: string }) {
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  // Empty, but only from this device's cache: offline that means "never
  // loaded here", not "no lists" — the card must not claim the latter.
  const [cachedEmpty, setCachedEmpty] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const online = useOnline();
  const t = useT();

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "groups", groupId, "shoppingLists"), orderBy("updatedAt", "desc")),
      { includeMetadataChanges: true },
      (snapshot) => {
        setLists(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ShoppingList));
        setCachedEmpty(snapshot.empty && snapshot.metadata.fromCache);
      },
      (error) => {
        setErrorCode(reportSnapshotError("shopping-lists", error));
      },
    );
  }, [groupId]);

  const open = (lists ?? []).reduce((sum, list) => sum + (list.openCount ?? 0), 0);
  const shown = (lists ?? []).slice(0, LISTS_SHOWN);
  const more = (lists?.length ?? 0) - shown.length;

  return (
    <Link
      href={`/groups/${groupId}/shopping`}
      className={cn(
        "bg-card ring-foreground/10 hover:ring-foreground/20 hover:shadow-e1 relative flex items-center gap-3 overflow-hidden rounded-xl p-3 ring-1 transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.99]",
        open > 0 && "ring-foreground/25",
      )}
    >
      <div className="monogram relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
        <ShoppingCart className="h-4.5 w-4.5" />
        {open > 0 && (
          <span className="bg-primary text-primary-foreground ring-card absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ring-2">
            {open > 99 ? "99+" : open}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-sm", open > 0 ? "font-semibold" : "font-medium")}>
          {t("shopping.title")}
        </span>
        {errorCode ? (
          <span className="text-destructive truncate text-xs">
            {t("errors.errorCode", { code: errorCode })}
          </span>
        ) : lists === null || (cachedEmpty && online) ? (
          <span className="bg-muted h-3 w-32 animate-pulse rounded" aria-hidden="true" />
        ) : (
          <p className="text-muted-foreground truncate text-xs">
            {lists.length === 0
              ? cachedEmpty
                ? t("shopping.entryNotSynced")
                : t("shopping.entryEmpty")
              : shown
                  .map(
                    (list) =>
                      `${list.icon ?? "🛒"} ${list.name} · ${
                        list.openCount > 0
                          ? t("shopping.entryOpen", { count: list.openCount })
                          : t("shopping.entryAllDone")
                      }`,
                  )
                  .join("   ") + (more > 0 ? `   +${more}` : "")}
          </p>
        )}
      </div>
      <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
    </Link>
  );
}
