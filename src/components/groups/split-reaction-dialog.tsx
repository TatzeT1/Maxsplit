"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { ReactionBoard } from "@/components/groups/split-game/reaction-board";

const CONFIG: DuelGameConfig = {
  emoji: "⚡",
  titleKey: "expenses.reactionTitle",
  introKey: "expenses.reactionIntro",
  Board: ReactionBoard,
};

export function SplitReactionDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
