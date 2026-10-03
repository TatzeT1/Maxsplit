"use client";

import { Gamepad2 } from "lucide-react";
import { splitGameInfo } from "@/components/groups/split-game/game-catalog";
import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";
import type { ExpenseGame } from "@/lib/types";

/**
 * "🎡 Glücksrad · im 2. Versuch · 4 haben mitgespielt" — how a game-decided
 * expense says which game decided it. A reshuffled result is never quiet:
 * the attempt is highlighted from the second one on. An expense from before
 * the game was recorded (`game` absent) just says it was a game.
 */
export function GameRecordSummary({
  game,
  showPlayers = false,
  className,
}: {
  game: ExpenseGame | null | undefined;
  showPlayers?: boolean;
  className?: string;
}) {
  const t = useT();
  const info = game ? splitGameInfo(game.gameId) : null;

  return (
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
}
