"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useT } from "@/components/locale-provider";
import { gameLoaders } from "@/components/groups/split-game/game-loaders";

// The picker and the eight split-game dialogs, each split into its own chunk.
// They used to be static imports of AddExpenseDialog, so every visit to a
// group page downloaded all eight games — boards, bracket, online play, sound
// — although most expenses are entered without one. Now a game's code loads
// when its preview opens in the picker (preloadSplitGame in game-loaders.ts),
// and the dialog renders once that has arrived.

/**
 * Shown in place of a game dialog while its chunk is still arriving, so
 * "Los geht's" on a slow connection reads as loading, not as nothing
 * happening. It doesn't take pointer events: if the network stalls, the
 * expense form underneath stays usable rather than trapped behind a spinner.
 */
function GameLoading() {
  const t = useT();
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="bg-popover text-popover-foreground ring-foreground/10 shadow-e2 rounded-full p-3 ring-1">
        <Loader2 className="size-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    </div>
  );
}

export const SplitGamePickerDialog = dynamic(
  () => import("@/components/groups/split-game-picker-dialog").then((m) => m.SplitGamePickerDialog),
  { loading: GameLoading },
);
export const SplitLotteryDialog = dynamic(
  () => gameLoaders.lottery().then((m) => m.SplitLotteryDialog),
  { loading: GameLoading },
);
export const SplitWheelDialog = dynamic(() => gameLoaders.wheel().then((m) => m.SplitWheelDialog), {
  loading: GameLoading,
});
export const SplitSlotDialog = dynamic(() => gameLoaders.slot().then((m) => m.SplitSlotDialog), {
  loading: GameLoading,
});
export const SplitScratchDialog = dynamic(
  () => gameLoaders.scratch().then((m) => m.SplitScratchDialog),
  { loading: GameLoading },
);
export const SplitTicTacToeDialog = dynamic(
  () => gameLoaders.tictactoe().then((m) => m.SplitTicTacToeDialog),
  { loading: GameLoading },
);
export const SplitConnectFourDialog = dynamic(
  () => gameLoaders.connectfour().then((m) => m.SplitConnectFourDialog),
  { loading: GameLoading },
);
export const SplitMemoryDialog = dynamic(
  () => gameLoaders.memory().then((m) => m.SplitMemoryDialog),
  { loading: GameLoading },
);
export const SplitReactionDialog = dynamic(
  () => gameLoaders.reaction().then((m) => m.SplitReactionDialog),
  { loading: GameLoading },
);
