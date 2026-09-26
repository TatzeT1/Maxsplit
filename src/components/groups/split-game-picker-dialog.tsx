"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import { springs } from "@/lib/motion";
import {
  SPLIT_GAMES,
  SPLIT_GAME_CATEGORIES,
  splitGameInfo,
  type SplitGameId,
} from "@/components/groups/split-game/game-catalog";
import { SplitGamePreview } from "@/components/groups/split-game/game-preview";
import { GameTileImage } from "@/components/groups/split-game/game-tile-image";

export type { SplitGameId } from "@/components/groups/split-game/game-catalog";

/**
 * Two-step "which game decides who pays" picker: a grid of tiles split into
 * "Glücksspiele" (pure luck) and "Minispiele" (skill duels), then — instead
 * of a tile handing straight off into a game's own popup — a preview step
 * that explains what's about to start before "Los geht's" hands off to that
 * game's dialog. The two-step flow exists specifically so tapping a tile
 * never feels like an unexplained popup appearing.
 */
export function SplitGamePickerDialog({
  open,
  onOpenChange,
  onSelectGame,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGame: (game: SplitGameId) => void;
}) {
  const t = useT();
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState<SplitGameId | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  function openPreview(id: SplitGameId) {
    setDirection(1);
    setSelectedId(id);
  }

  function backToGrid() {
    setDirection(-1);
    setSelectedId(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) setSelectedId(null);
    onOpenChange(nextOpen);
  }

  function startSelectedGame() {
    if (!selectedId) return;
    const id = selectedId;
    // Reset now: the parent closes this dialog by flipping `open` itself,
    // which — unlike a user-initiated close — never runs `onOpenChange`.
    setSelectedId(null);
    onSelectGame(id);
  }

  const selectedGame = selectedId ? splitGameInfo(selectedId) : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="overflow-x-hidden sm:max-w-md"
        onEscapeKeyDown={(event) => {
          if (selectedGame) {
            event.preventDefault();
            backToGrid();
          }
        }}
      >
        <DialogHeader>
          {selectedGame ? (
            <>
              <DialogTitle className="flex items-center gap-2">
                <span aria-hidden="true">{selectedGame.emoji}</span>
                {t(selectedGame.nameKey)}
              </DialogTitle>
              <DialogDescription>{t(selectedGame.blurbKey)}</DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>{t("expenses.gamePickerTitle")}</DialogTitle>
              <DialogDescription>{t("expenses.gamePickerIntro")}</DialogDescription>
            </>
          )}
        </DialogHeader>

        <AnimatePresence mode="wait" initial={false}>
          {selectedGame ? (
            <motion.div
              key={selectedGame.id}
              initial={reduceMotion ? false : { opacity: 0, y: 12 * direction }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -12 * direction, transition: { duration: 0.12 } }
              }
              transition={reduceMotion ? { duration: 0 } : springs.weighted}
            >
              <SplitGamePreview game={selectedGame} />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={reduceMotion ? false : { opacity: 0, y: 12 * direction }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -12 * direction, transition: { duration: 0.12 } }
              }
              transition={reduceMotion ? { duration: 0 } : springs.weighted}
              className="flex flex-col gap-4"
            >
              {SPLIT_GAME_CATEGORIES.map((category) => (
                <section key={category.id} aria-labelledby={`game-category-${category.id}`}>
                  <div className="mb-2 flex flex-col gap-0.5">
                    <span
                      id={`game-category-${category.id}`}
                      className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase"
                    >
                      {t(category.titleKey)}
                    </span>
                    <span className="text-muted-foreground text-xs">{t(category.blurbKey)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SPLIT_GAMES.filter((game) => game.category === category.id).map((game) => (
                      <button
                        key={game.id}
                        type="button"
                        onClick={() => openPreview(game.id)}
                        className="has-focus-visible:ring-ring/50 ease-spring active:shadow-pressed border-border bg-background hover:bg-muted flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] has-focus-visible:ring-3"
                      >
                        <GameTileImage src={game.imageSrc} emoji={game.emoji} />
                        <span className="font-heading text-sm font-medium">{t(game.nameKey)}</span>
                        <span className="text-muted-foreground text-xs">{t(game.blurbKey)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {selectedGame && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={backToGrid}
            >
              {t("expenses.gamePreviewBack")}
            </Button>
            <Button
              type="button"
              size="lg"
              className="flex-1"
              autoFocus
              onClick={startSelectedGame}
            >
              {t("expenses.gamePreviewStart")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
