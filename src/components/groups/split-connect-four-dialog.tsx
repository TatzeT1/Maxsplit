"use client";

import {
  DuelGameDialog,
  type DuelGameConfig,
  type SplitGameDialogProps,
} from "@/components/groups/split-game/duel-game-dialog";
import { ConnectFourBoard } from "@/components/groups/split-game/connect-four-board";

const CONFIG: DuelGameConfig = {
  emoji: "🔴",
  titleKey: "expenses.connectFourTitle",
  introKey: "expenses.connectFourIntro",
  Board: ConnectFourBoard,
};

export function SplitConnectFourDialog(props: SplitGameDialogProps) {
  return <DuelGameDialog {...props} config={CONFIG} />;
}
