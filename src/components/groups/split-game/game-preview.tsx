"use client";

import { Swords } from "lucide-react";
import { useT } from "@/components/locale-provider";
import type { SplitGameInfo } from "@/components/groups/split-game/game-catalog";

/**
 * The picker's second step: before a tile hands off into the actual game
 * dialog, this explains what tapping "Los geht's" is about to start —
 * addressing the "tap a tile, a popup just appears" confusion the flat
 * 2×2 grid used to cause. One shared component for all 8 games, driven
 * entirely by `game-catalog.ts`, so no per-game preview copy lives here.
 */
export function SplitGamePreview({ game }: { game: SplitGameInfo }) {
  const t = useT();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <span aria-hidden="true" className="animate-rise text-5xl">
          {game.emoji}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          {t("expenses.gamePreviewHowTitle")}
        </span>
        <p className="text-sm leading-relaxed">{t(game.howKey)}</p>
      </div>
      {game.category === "skill" && (
        <div className="bg-muted/40 flex gap-3 rounded-xl border p-3">
          <Swords aria-hidden="true" className="text-muted-foreground mt-0.5 size-5 shrink-0" />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t("expenses.gameLadderTitle")}</span>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t("expenses.gameLadderExplainer")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
