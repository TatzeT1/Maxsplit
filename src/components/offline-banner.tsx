"use client";

import { WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useT } from "@/components/locale-provider";
import { formatDayMonth, formatTime } from "@/lib/format/date";
import { useCurrentScreenSync } from "@/lib/offline/sync-marks";
import { useOnline } from "@/lib/use-online";

/**
 * How long a screen may go without live data while the device claims to be
 * online before the banner calls the connection lost — well past the second
 * or two a normal start from the cache takes to turn live. Covers the Wi-Fi
 * that's connected but goes nowhere, which `navigator.onLine` reports as fine.
 */
const UNREACHABLE_AFTER_MS = 8000;

/** True once `active` has held for `delayMs` without interruption. */
function useActiveFor(active: boolean, delayMs: number): boolean {
  const [state, setState] = useState({ active, elapsed: false });
  // Restart the clock on every change — adjusted during render, React's
  // pattern for state that follows a prop.
  if (state.active !== active) setState({ active, elapsed: false });

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setState({ active: true, elapsed: true }), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return active && state.active && state.elapsed;
}

/** "29.09., 14:32" — with the day, because a copy can just as well be from last week. */
function formatSyncedAt(at: number): string {
  const date = new Date(at);
  return `${formatDayMonth(date)}, ${formatTime(date)}`;
}

/**
 * Offline, the app is view-only: Firestore shows its cached copy
 * (lib/firebase/client.ts) and everything that saves is disabled, because
 * writes are Server Actions with nothing to queue them (ADR-001). This banner
 * says so, and how old the copy on screen is ("Stand 29.09., 14:32", from the
 * screen's sync mark) — without it, stale data would look exactly like live
 * data, and a disabled button like a broken one.
 */
export function OfflineBanner() {
  const online = useOnline();
  const screen = useCurrentScreenSync();
  const unreachable = useActiveFor(online && screen !== null && !screen.live, UNREACHABLE_AFTER_MS);
  const t = useT();

  if (online && !unreachable) return null;

  const syncedAt = screen?.syncedAt;
  return (
    <div
      role="status"
      className="bg-secondary text-secondary-foreground animate-rise sticky top-0 z-50 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.5rem)" }}
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      <span>
        {online ? t("common.unreachable") : t("common.offline")}
        {syncedAt ? ` · ${t("common.syncedAt", { time: formatSyncedAt(syncedAt) })}` : null}
      </span>
    </div>
  );
}
