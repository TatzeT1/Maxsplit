"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { TicTacToeBoard } from "@/components/groups/split-game/tic-tac-toe-board";

const CONFIG: DuelGameConfig = {
  emoji: "⭕",
  titleKey: "expenses.ticTacToeTitle",
  introKey: "expenses.ticTacToeIntro",
  Board: TicTacToeBoard,
};

export function SplitTicTacToeDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
