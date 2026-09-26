"use client";

import { Swords } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import type { SplitGameInfo } from "@/components/groups/split-game/game-catalog";
import { GameTileImage } from "@/components/groups/split-game/game-tile-image";

/**
 * The picker's second step: before a tile hands off into the actual game
 * dialog, this explains what tapping "Los geht's" is about to start —
 * addressing the "tap a tile, a popup just appears" confusion the flat
 * 2×2 grid used to cause. One shared component for all 8 games, driven
 * entirely by `game-catalog.ts`, so no per-game preview copy lives here.
 */
export function SplitGamePreview({ game }: { game: SplitGameInfo }) {
  const t = useT();
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col items-center gap-2 py-2 text-center">
        <span
          aria-hidden="true"
          className="bg-primary/20 animate-bloom pointer-events-none absolute top-0 size-40 rounded-full blur-2xl"
        />
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.85, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : springs.weighted}
          className="relative"
        >
          <GameTileImage src={game.imageSrc} emoji={game.emoji} size="lg" />
        </motion.div>
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
