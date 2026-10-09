import { DUEL_GAME_IDS } from "@/lib/games/duel-game-ids";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { LuckGameId, QuizGameId, SplitGameId, TableGameId } from "@/lib/types";

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

export function isLuckGameId(value: string): value is LuckGameId {
  return (LUCK_GAME_IDS as readonly string[]).includes(value);
}

/**
 * Runtime list mirroring the `TableGameId` union: skill games the whole table
 * plays at once on one phone. Neither luck (the Glücks-Index skips them) nor
 * duels (no ladder, tournament or online play).
 */
export const TABLE_GAME_IDS: readonly TableGameId[] = ["finger"];

/**
 * Runtime list mirroring the `QuizGameId` union: the knowledge games — one
 * question, one answer — played on one phone or online. Not luck (the
 * Glücks-Index skips them) and not a duel (no ladder, no tournament).
 */
export const QUIZ_GAME_IDS: readonly QuizGameId[] = ["estimate"];

export function isQuizGameId(value: string): value is QuizGameId {
  return (QUIZ_GAME_IDS as readonly string[]).includes(value);
}

/** Runtime list mirroring the `SplitGameId` union, for validating a Server Action's input. */
export const SPLIT_GAME_IDS: readonly SplitGameId[] = [
  ...LUCK_GAME_IDS,
  ...DUEL_GAME_IDS,
  ...TABLE_GAME_IDS,
  ...QUIZ_GAME_IDS,
];

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
  finger: { emoji: "☝️", nameKey: "expenses.gameNameFinger" },
  estimate: { emoji: "🎯", nameKey: "expenses.gameNameEstimate" },
};
