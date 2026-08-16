"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardQueuedAction,
  flushQueuedActions,
  listQueuedActions,
  retryQueuedAction,
  type QueuedAction,
} from "@/lib/offline/action-queue";

/**
 * Keeps the queue flushed and exposes its current contents for display.
 *
 * Flush triggers on mount, on the `online` event, and on the tab/PWA
 * becoming visible again — the last one matters specifically for iOS, which
 * has no Background Sync API (a Service Worker can't be woken to retry a
 * request while the app is closed or backgrounded), so "the app is open and
 * foregrounded" is the only reliable moment left to catch a reconnect.
 */
export function useQueuedActions(): {
  actions: QueuedAction[];
  discard: (id: string) => void;
  retry: (action: QueuedAction) => void;
} {
  const [actions, setActions] = useState<QueuedAction[]>([]);

  const refresh = useCallback(() => {
    void listQueuedActions().then(setActions);
  }, []);

  const flush = useCallback(() => {
    void flushQueuedActions().then(refresh);
  }, [refresh]);

  useEffect(() => {
    flush();
    const handleVisible = () => {
      if (document.visibilityState === "visible") flush();
    };
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [flush]);

  const discard = useCallback(
    (id: string) => {
      void discardQueuedAction(id).then(refresh);
    },
    [refresh],
  );

  const retry = useCallback(
    (action: QueuedAction) => {
      void retryQueuedAction(action).then(flush);
    },
    [flush],
  );

  return { actions, discard, retry };
}
