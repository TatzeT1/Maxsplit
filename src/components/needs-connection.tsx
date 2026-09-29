"use client";

import { WifiOff } from "lucide-react";
import { useT } from "@/components/locale-provider";

/**
 * Offline, in place of a screen this device has no copy of (see
 * lib/offline/sync-marks.ts) — never an empty list or a skeleton that would
 * pass for "nothing here" or "still loading".
 */
export function NeedsConnection({ body }: { body: string }) {
  const t = useT();
  return (
    <div
      role="status"
      className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-2 p-6 text-center"
    >
      <WifiOff aria-hidden="true" className="text-muted-foreground mb-1 size-6" />
      <p className="font-medium">{t("offline.needsConnectionTitle")}</p>
      <p className="text-muted-foreground max-w-xs text-sm">{body}</p>
    </div>
  );
}
