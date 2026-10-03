import { DUEL_GAME_IDS } from "@/lib/games/duel-game-ids";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { LuckGameId, SplitGameId } from "@/lib/types";

/** Runtime list mirroring the `LuckGameId` union. */
export const LUCK_GAME_IDS: readonly LuckGameId[] = [
  "lottery",
  "wheel",
  "slot",
  "scratch",
  "balloon",
  "duckrace",
  "dicecup",
  "pegboard",
];

/** Runtime list mirroring the `SplitGameId` union, for validating a Server Action's input. */
export const SPLIT_GAME_IDS: readonly SplitGameId[] = [...LUCK_GAME_IDS, ...DUEL_GAME_IDS];

export function isSplitGameId(value: unknown): value is SplitGameId {
  return typeof value === "string" && (SPLIT_GAME_IDS as readonly string[]).includes(value);
}

/**
 * Emoji + name per game, for places that only need to *name* a game (the
 * chat, statistics, the server) without the picker's catalog and its tile
 * art. The catalog uses the same emoji and name keys (pinned by a test).
 */
export const SPLIT_GAME_META: Record<SplitGameId, { emoji: string; nameKey: TranslationKey }> = {
  lottery: { emoji: "🎲", nameKey: "expenses.gameNameLottery" },
  wheel: { emoji: "🎡", nameKey: "expenses.gameNameWheel" },
  slot: { emoji: "🎰", nameKey: "expenses.gameNameSlot" },
  scratch: { emoji: "🎫", nameKey: "expenses.gameNameScratch" },
  balloon: { emoji: "🎈", nameKey: "expenses.gameNameBalloon" },
  duckrace: { emoji: "🦆", nameKey: "expenses.gameNameDuckRace" },
  dicecup: { emoji: "🥃", nameKey: "expenses.gameNameDice" },
  pegboard: { emoji: "🎱", nameKey: "expenses.gameNamePegboard" },
  tictactoe: { emoji: "⭕", nameKey: "expenses.gameNameTicTacToe" },
  connectfour: { emoji: "🔴", nameKey: "expenses.gameNameConnectFour" },
  memory: { emoji: "🧠", nameKey: "expenses.gameNameMemory" },
  reaction: { emoji: "⚡", nameKey: "expenses.gameNameReaction" },
  rps: { emoji: "✊", nameKey: "expenses.gameNameRps" },
  nim: { emoji: "🥢", nameKey: "expenses.gameNameNim" },
  dots: { emoji: "✏️", nameKey: "expenses.gameNameDots" },
};
