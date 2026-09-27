import type { DuelGameConfig } from "@/components/groups/split-game/duel-game-dialog";
import { TicTacToeBoard } from "@/components/groups/split-game/tic-tac-toe-board";
import { ConnectFourBoard } from "@/components/groups/split-game/connect-four-board";
import { MemoryBoard } from "@/components/groups/split-game/memory-board";
import { ReactionBoard } from "@/components/groups/split-game/reaction-board";
import type { DuelGameId } from "@/lib/types";

/**
 * Maps a tournament's `gameId` to the same emoji/title/board every duel
 * game's own dialog wrapper already uses — needed wherever there's no
 * `DuelGameConfig` in scope already (the standalone tournament page; the
 * dialog case passes its own `config` straight through instead). Which games
 * actually expose the "Turnier" toggle is decided per game in its own
 * `split-*-dialog.tsx` wrapper, not here — this registry just has to be
 * complete so flipping that toggle on later is config, not new code.
 */
export const TOURNAMENT_GAME_CONFIGS: Record<DuelGameId, DuelGameConfig> = {
  tictactoe: {
    emoji: "⭕",
    titleKey: "expenses.ticTacToeTitle",
    introKey: "expenses.ticTacToeIntro",
    Board: TicTacToeBoard,
    gameId: "tictactoe",
  },
  connectfour: {
    emoji: "🔴",
    titleKey: "expenses.connectFourTitle",
    introKey: "expenses.connectFourIntro",
    Board: ConnectFourBoard,
    gameId: "connectfour",
  },
  memory: {
    emoji: "🧠",
    titleKey: "expenses.memoryTitle",
    introKey: "expenses.memoryIntro",
    Board: MemoryBoard,
    gameId: "memory",
  },
  reaction: {
    emoji: "⚡",
    titleKey: "expenses.reactionTitle",
    introKey: "expenses.reactionIntro",
    Board: ReactionBoard,
    gameId: "reaction",
  },
};
