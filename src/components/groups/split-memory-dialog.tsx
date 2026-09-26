"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { MemoryBoard } from "@/components/groups/split-game/memory-board";

const CONFIG: DuelGameConfig = {
  emoji: "🧠",
  titleKey: "expenses.memoryTitle",
  introKey: "expenses.memoryIntro",
  Board: MemoryBoard,
};

export function SplitMemoryDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
