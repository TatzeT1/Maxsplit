import type { TranslationKey } from "@/lib/i18n/translate";

export type SplitGameId =
  "lottery" | "wheel" | "slot" | "scratch" | "tictactoe" | "connectfour" | "memory" | "reaction";

export type SplitGameCategory = "luck" | "skill";

export interface SplitGameInfo {
  id: SplitGameId;
  category: SplitGameCategory;
  emoji: string;
  nameKey: TranslationKey;
  blurbKey: TranslationKey;
  /** The longer "how it works" paragraph shown on the picker's preview step. */
  howKey: TranslationKey;
}

/** Drives both the picker's section headings and the preview screen's category badge. */
export const SPLIT_GAME_CATEGORIES: readonly {
  id: SplitGameCategory;
  titleKey: TranslationKey;
  blurbKey: TranslationKey;
}[] = [
  {
    id: "luck",
    titleKey: "expenses.gameCategoryLuckTitle",
    blurbKey: "expenses.gameCategoryLuckBlurb",
  },
  {
    id: "skill",
    titleKey: "expenses.gameCategorySkillTitle",
    blurbKey: "expenses.gameCategorySkillBlurb",
  },
];

/**
 * One row per game, driving the picker's tile grid, the preview step, and
 * (via `category`) which section a game's tile sits in. `add-expense-dialog`
 * only needs the `id`s; everything about how a game presents itself lives
 * here so the picker never hand-rolls per-game copy.
 */
export const SPLIT_GAMES: readonly SplitGameInfo[] = [
  {
    id: "lottery",
    category: "luck",
    emoji: "🎲",
    nameKey: "expenses.gameNameLottery",
    blurbKey: "expenses.gameBlurbLottery",
    howKey: "expenses.gameHowLottery",
  },
  {
    id: "wheel",
    category: "luck",
    emoji: "🎡",
    nameKey: "expenses.gameNameWheel",
    blurbKey: "expenses.gameBlurbWheel",
    howKey: "expenses.gameHowWheel",
  },
  {
    id: "slot",
    category: "luck",
    emoji: "🎰",
    nameKey: "expenses.gameNameSlot",
    blurbKey: "expenses.gameBlurbSlot",
    howKey: "expenses.gameHowSlot",
  },
  {
    id: "scratch",
    category: "luck",
    emoji: "🎫",
    nameKey: "expenses.gameNameScratch",
    blurbKey: "expenses.gameBlurbScratch",
    howKey: "expenses.gameHowScratch",
  },
  {
    id: "tictactoe",
    category: "skill",
    emoji: "⭕",
    nameKey: "expenses.gameNameTicTacToe",
    blurbKey: "expenses.gameBlurbTicTacToe",
    howKey: "expenses.gameHowTicTacToe",
  },
  {
    id: "connectfour",
    category: "skill",
    emoji: "🔴",
    nameKey: "expenses.gameNameConnectFour",
    blurbKey: "expenses.gameBlurbConnectFour",
    howKey: "expenses.gameHowConnectFour",
  },
  {
    id: "memory",
    category: "skill",
    emoji: "🧠",
    nameKey: "expenses.gameNameMemory",
    blurbKey: "expenses.gameBlurbMemory",
    howKey: "expenses.gameHowMemory",
  },
  {
    id: "reaction",
    category: "skill",
    emoji: "⚡",
    nameKey: "expenses.gameNameReaction",
    blurbKey: "expenses.gameBlurbReaction",
    howKey: "expenses.gameHowReaction",
  },
];

export function splitGameInfo(id: SplitGameId): SplitGameInfo {
  const info = SPLIT_GAMES.find((game) => game.id === id);
  if (!info) throw new Error(`Unknown split game id: ${id}`);
  return info;
}
