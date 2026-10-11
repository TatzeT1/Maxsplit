"use client";

import { Gamepad2 } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import { splitGameInfo } from "@/components/groups/split-game/game-catalog";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Expense, ExpenseGame } from "@/lib/types";

/**
 * The estimate record's audit table replays the classifier and compares exact
 * BigInt ratios — code the group page has no other use for, so it is loaded only
 * when an expense that carries an estimate audit is opened (and never on the
 * server: it is a closed disclosure). Offline the chunk may be missing: the import
 * then rejects at render, which `AuditBoundary` turns into one visible line, so the
 * summary above it and the rest of the screen keep working.
 */
const EstimateAuditTable = dynamic(
  () =>
    import("@/components/groups/split-game/estimate/estimate-audit").then(
      (module) => module.EstimateAuditTable,
    ),
  { ssr: false, loading: AuditLoading },
);

/**
 * Catches a failed audit chunk (offline, a stale deploy) so it never takes the
 * enclosing screen down. The fallback is a visible line, never nothing: a missing
 * audit must not read as "there is none".
 */
class AuditBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("estimate audit failed to load:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * `next/dynamic`'s loading slot. The App Router build keeps a failed chunk out of it (the lazy
 * import throws at render, which `AuditBoundary` catches), but the pages-style runtime reports
 * the failure HERE as `error` and would otherwise sit on its skeleton forever — a failure
 * must never look like loading.
 */
function AuditLoading({ error }: { error?: Error | null }) {
  return error ? <AuditUnavailable /> : <Skeleton className="h-10 w-full rounded-xl" />;
}

function AuditUnavailable() {
  const t = useT();
  return (
    <p role="status" className="text-muted-foreground px-1 text-xs">
      {t("expenses.estimateAuditUnavailable")}
    </p>
  );
}

/**
 * "🎡 Glücksrad · im 2. Versuch · 4 haben mitgespielt" — how a game-decided
 * expense says which game decided it. A reshuffled result is never quiet:
 * the attempt is highlighted from the second one on. An expense from before
 * the game was recorded (`game` absent) just says it was a game.
 */
export function GameRecordSummary({
  game,
  showPlayers = false,
  expense,
  className,
}: {
  game: ExpenseGame | null | undefined;
  showPlayers?: boolean;
  /**
   * The expense as it is stored now, so an estimate game's audit can be checked
   * against the live split. Absent in the expense form (create AND edit): there
   * the bill is being changed, so there is nothing stable to compare and the
   * audit is not shown at all.
   */
  expense?: Pick<Expense, "amountMinor" | "currency" | "splits">;
  className?: string;
}) {
  const t = useT();
  const info = game ? splitGameInfo(game.gameId) : null;

  const summary = (
    <div className={cn("bg-muted/60 flex items-start gap-2.5 rounded-xl px-3 py-2.5", className)}>
      <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center">
        {info ? info.emoji : <Gamepad2 className="text-muted-foreground size-4" />}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="font-medium">
          {t("expenses.gameDecidedTitle")}
          {info && `: ${t(info.nameKey)}`}
        </span>
        {game && (
          <span className="text-muted-foreground text-xs">
            <span className={cn(game.attempt > 1 && "text-foreground font-semibold")}>
              {game.attempt > 1
                ? t("expenses.gameAttemptNth", { count: game.attempt })
                : t("expenses.gameAttemptFirst")}
            </span>
            {showPlayers &&
              ` · ${t("expenses.gamePlayersCount", { count: game.playerUids.length })}`}
          </span>
        )}
      </div>
    </div>
  );

  if (!game?.estimate || !expense) return summary;
  return (
    <div className="flex flex-col gap-2">
      {summary}
      <AuditBoundary fallback={<AuditUnavailable />}>
        <EstimateAuditTable audit={game.estimate} expense={expense} />
      </AuditBoundary>
    </div>
  );
}
