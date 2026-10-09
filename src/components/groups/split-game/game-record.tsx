"use client";

import { Gamepad2 } from "lucide-react";
import dynamic from "next/dynamic";
import { splitGameInfo } from "@/components/groups/split-game/game-catalog";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Expense, ExpenseGame } from "@/lib/types";

/**
 * The estimate record's audit table replays the classifier and compares exact
 * BigInt ratios — code the group page has no other use for, so it is loaded only
 * when an expense that carries an estimate audit is opened (and never on the
 * server: it is a closed disclosure). Offline the chunk may be missing; the plain
 * summary above it still renders.
 */
const EstimateAuditTable = dynamic(
  () =>
    import("@/components/groups/split-game/estimate/estimate-audit").then(
      (module) => module.EstimateAuditTable,
    ),
  { ssr: false, loading: () => <Skeleton className="h-10 w-full rounded-xl" /> },
);

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
   * against the live split. Absent in the expense form, which holds no stored
   * audit yet.
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

  if (!game?.estimate) return summary;
  return (
    <div className="flex flex-col gap-2">
      {summary}
      <EstimateAuditTable audit={game.estimate} expense={expense} />
    </div>
  );
}
