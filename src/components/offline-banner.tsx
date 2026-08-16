"use client";

import { RotateCw, WifiOff, X } from "lucide-react";
import { useEffect } from "react";
import { useOffline } from "next/offline";
import { useT } from "@/components/locale-provider";
import { useQueuedActions } from "@/lib/offline/use-queued-actions";

/**
 * `useOffline` (from Next's `experimental.useOffline`, enabled in
 * next.config.ts) tracks both the browser's offline event *and* a failed
 * framework fetch, which catches the "looks connected but isn't" case
 * `navigator.onLine` alone would miss — see
 * node_modules/next/dist/docs/01-app/02-guides/offline-support.md. It only
 * covers the current page session, though: a closed tab or a killed iOS PWA
 * loses anything still pending. The IndexedDB outbox in lib/offline is the
 * durability layer for that gap, and this banner surfaces both — the
 * device's connectivity, and any queued action that's stuck or been
 * rejected outright — so neither state is silently indistinguishable from
 * "everything's fine."
 */
export function OfflineBanner() {
  const isOffline = useOffline();
  const { actions, discard, retry } = useQueuedActions();
  const t = useT();

  useEffect(() => {
    void navigator.storage?.persist?.();
  }, []);

  const failed = actions.filter((action) => action.error);
  const hasPending = actions.length > failed.length;

  if (!isOffline && failed.length === 0) return null;

  return (
    <div
      role="status"
      className="bg-secondary text-secondary-foreground animate-rise sticky top-0 z-50 flex flex-col gap-1.5 px-3 py-2 text-sm font-medium"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      {isOffline && (
        <div className="flex items-center justify-center gap-2">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          <span>{hasPending ? t("common.offlineWithPending") : t("common.offline")}</span>
        </div>
      )}
      {failed.map((action) => (
        <div key={action.id} className="flex items-center justify-center gap-3">
          <span className="text-destructive">
            {action.kind === "add-expense" ? t("expenses.syncFailed") : t("settlements.syncFailed")}
          </span>
          <button
            type="button"
            onClick={() => retry(action)}
            className="hover:text-foreground flex items-center gap-1 underline underline-offset-2"
          >
            <RotateCw className="size-3.5" aria-hidden="true" />
            {t("common.retry")}
          </button>
          <button
            type="button"
            onClick={() => discard(action.id)}
            className="hover:text-foreground flex items-center gap-1 underline underline-offset-2"
          >
            <X className="size-3.5" aria-hidden="true" />
            {t("common.discard")}
          </button>
        </div>
      ))}
    </div>
  );
}
