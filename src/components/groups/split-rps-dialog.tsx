"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { RpsBoard } from "@/components/groups/split-game/rps-board";

const CONFIG: DuelGameConfig = {
  emoji: "✊",
  titleKey: "expenses.rpsTitle",
  introKey: "expenses.rpsIntro",
  Board: RpsBoard,
  gameId: "rps",
  tournament: true,
};

export function SplitRpsDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
