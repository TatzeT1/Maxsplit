"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { NimBoard } from "@/components/groups/split-game/nim-board";

const CONFIG: DuelGameConfig = {
  emoji: "🥢",
  titleKey: "expenses.nimTitle",
  introKey: "expenses.nimIntro",
  Board: NimBoard,
  gameId: "nim",
  tournament: true,
};

export function SplitNimDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
