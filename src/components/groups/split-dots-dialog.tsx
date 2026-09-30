"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { DotsBoard } from "@/components/groups/split-game/dots-board";

const CONFIG: DuelGameConfig = {
  emoji: "✏️",
  titleKey: "expenses.dotsTitle",
  introKey: "expenses.dotsIntro",
  Board: DotsBoard,
  gameId: "dots",
  tournament: true,
};

export function SplitDotsDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
