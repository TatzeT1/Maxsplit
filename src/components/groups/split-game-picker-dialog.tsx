"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useT } from "@/components/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translate";

export type SplitGameId = "lottery" | "wheel" | "slot" | "scratch";

const GAME_TILES: {
  id: SplitGameId;
  emoji: string;
  nameKey: TranslationKey;
  blurbKey: TranslationKey;
}[] = [
  {
    id: "lottery",
    emoji: "🎲",
    nameKey: "expenses.gameNameLottery",
    blurbKey: "expenses.gameBlurbLottery",
  },
  {
    id: "wheel",
    emoji: "🎡",
    nameKey: "expenses.gameNameWheel",
    blurbKey: "expenses.gameBlurbWheel",
  },
  { id: "slot", emoji: "🎰", nameKey: "expenses.gameNameSlot", blurbKey: "expenses.gameBlurbSlot" },
  {
    id: "scratch",
    emoji: "🎫",
    nameKey: "expenses.gameNameScratch",
    blurbKey: "expenses.gameBlurbScratch",
  },
];

/** Tile picker that lets the group choose which mini-game decides who pays, before handing off to that game's own dialog. */
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("expenses.gamePickerTitle")}</DialogTitle>
          <DialogDescription>{t("expenses.gamePickerIntro")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {GAME_TILES.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => onSelectGame(tile.id)}
              className="has-focus-visible:ring-ring/50 ease-spring active:shadow-pressed border-border bg-background hover:bg-muted flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition-[background-color,border-color,transform,box-shadow] duration-(--duration-fast) select-none active:scale-[0.98] has-focus-visible:ring-3"
            >
              <span aria-hidden="true" className="text-2xl">
                {tile.emoji}
              </span>
              <span className="font-heading text-sm font-medium">{t(tile.nameKey)}</span>
              <span className="text-muted-foreground text-xs">{t(tile.blurbKey)}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
