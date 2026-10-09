"use client";

import { Hourglass } from "lucide-react";
import { useT } from "@/components/locale-provider";
import { useDeadlineNow } from "@/lib/games/use-estimate-round";
import { cn } from "@/lib/utils";

/** "2:41" below an hour, "1:00:00" from an hour on. A duration without words, so it needs no key. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${ss}` : `${minutes}:${ss}`;
}

/**
 * "Noch 2:41" / "Letzte Chance läuft — noch 1:58." until `closesAt`, as a
 * `role="timer"` that is not itself live (it changes every second). Screen
 * readers get a separate polite status that changes exactly three times: at
 * one minute, at ten seconds and at zero.
 *
 * Display only. The server accepts a guess until `closesAt + graceMs`, so the
 * clock keeps running through the grace (the page decides "Zeit um" from the
 * same deadline) while the text says "Die Zeit ist um." from `closesAt` on.
 * Render it only while the stage is guessing.
 */
export function EstimateCountdown({
  closesAt,
  graceMs,
  lastCall,
}: {
  closesAt: string;
  graceMs: number;
  lastCall: boolean;
}) {
  const t = useT();
  const closes = Date.parse(closesAt);
  const now = useDeadlineNow(Number.isNaN(closes) ? null : closes + graceMs, true);
  if (Number.isNaN(closes)) return null;

  const remainingMs = closes - now;
  const seconds = Math.ceil(remainingMs / 1000);
  const time = formatCountdown(remainingMs);
  const text =
    seconds <= 0
      ? t("expenses.estimateTimeUp")
      : lastCall
        ? t("expenses.estimateLastCallRunning", { time })
        : t("expenses.estimateCountdown", { time });
  const announcement =
    seconds <= 0
      ? t("expenses.estimateCountdownUp")
      : seconds <= 10
        ? t("expenses.estimateCountdownTen")
        : seconds <= 60
          ? t("expenses.estimateCountdownMinute")
          : "";
  const urgent = seconds <= 10 || lastCall;

  return (
    <div data-slot="estimate-countdown" className="flex flex-col items-center gap-1">
      <p
        role="timer"
        aria-live="off"
        className={cn(
          "tabular-money flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
          urgent ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          seconds > 0 && seconds <= 10 && "motion-safe:animate-pulse",
        )}
      >
        <Hourglass aria-hidden="true" className="size-4 shrink-0" />
        {text}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
