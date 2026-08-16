"use client";

import { WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useT } from "@/components/locale-provider";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

// The server has no network state of its own — assume online so the first
// paint matches what SSR always renders (nothing), and let the client
// snapshot correct it immediately after hydration if the device is offline.
function getServerSnapshot() {
  return true;
}

/**
 * Split has no offline write queue (see AGENTS.md: writes are Server
 * Actions, not direct client Firestore writes, so there's nothing for the
 * browser to replay on reconnect). Without this, losing signal mid-session
 * looks identical to everything working — a save silently does nothing and
 * `onSnapshot` listeners just stop updating. This banner is the minimum fix:
 * make the offline state visible instead of indistinguishable from normal.
 */
export function OfflineBanner() {
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useT();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-secondary text-secondary-foreground animate-rise sticky top-0 z-50 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {t("common.offline")}
    </div>
  );
}
