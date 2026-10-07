import type { TranslationKey } from "@/lib/i18n/translate";
import type { SplitGameId } from "@/lib/types";

export type { SplitGameId };

export type SplitGameCategory = "luck" | "skill";

export interface SplitGameInfo {
  id: SplitGameId;
  category: SplitGameCategory;
  emoji: string;
  /** Cartoon tile illustration, `public/game-tiles/<id>.jpg` — the emoji stays on as a small corner badge over it. */
  imageSrc: string;
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
    imageSrc: "/game-tiles/lottery.jpg",
    nameKey: "expenses.gameNameLottery",
    blurbKey: "expenses.gameBlurbLottery",
    howKey: "expenses.gameHowLottery",
  },
  {
    id: "wheel",
    category: "luck",
    emoji: "🎡",
    imageSrc: "/game-tiles/wheel.jpg",
    nameKey: "expenses.gameNameWheel",
    blurbKey: "expenses.gameBlurbWheel",
    howKey: "expenses.gameHowWheel",
  },
  {
    id: "slot",
    category: "luck",
    emoji: "🎰",
    imageSrc: "/game-tiles/slot.jpg",
    nameKey: "expenses.gameNameSlot",
    blurbKey: "expenses.gameBlurbSlot",
    howKey: "expenses.gameHowSlot",
  },
  {
    id: "scratch",
    category: "luck",
    emoji: "🎫",
    imageSrc: "/game-tiles/scratch.jpg",
    nameKey: "expenses.gameNameScratch",
    blurbKey: "expenses.gameBlurbScratch",
    howKey: "expenses.gameHowScratch",
  },
  {
    id: "balloon",
    category: "luck",
    emoji: "🎈",
    imageSrc: "/game-tiles/balloon.jpg",
    nameKey: "expenses.gameNameBalloon",
    blurbKey: "expenses.gameBlurbBalloon",
    howKey: "expenses.gameHowBalloon",
  },
  {
    id: "duckrace",
    category: "luck",
    emoji: "🦆",
    imageSrc: "/game-tiles/duck-race.jpg",
    nameKey: "expenses.gameNameDuckRace",
    blurbKey: "expenses.gameBlurbDuckRace",
    howKey: "expenses.gameHowDuckRace",
  },
  {
    // 🎲 already belongs to the lottery, so the cup gets the tumbler.
    id: "dicecup",
    category: "luck",
    emoji: "🥃",
    imageSrc: "/game-tiles/dice-cup.jpg",
    nameKey: "expenses.gameNameDice",
    blurbKey: "expenses.gameBlurbDice",
    howKey: "expenses.gameHowDice",
  },
  {
    id: "pegboard",
    category: "luck",
    emoji: "🎱",
    imageSrc: "/game-tiles/pegboard.jpg",
    nameKey: "expenses.gameNamePegboard",
    blurbKey: "expenses.gameBlurbPegboard",
    howKey: "expenses.gameHowPegboard",
  },
  {
    id: "tictactoe",
    category: "skill",
    emoji: "⭕",
    imageSrc: "/game-tiles/tic-tac-toe.jpg",
    nameKey: "expenses.gameNameTicTacToe",
    blurbKey: "expenses.gameBlurbTicTacToe",
    howKey: "expenses.gameHowTicTacToe",
  },
  {
    id: "connectfour",
    category: "skill",
    emoji: "🔴",
    imageSrc: "/game-tiles/connect-four.jpg",
    nameKey: "expenses.gameNameConnectFour",
    blurbKey: "expenses.gameBlurbConnectFour",
    howKey: "expenses.gameHowConnectFour",
  },
  {
    id: "memory",
    category: "skill",
    emoji: "🧠",
    imageSrc: "/game-tiles/memory.jpg",
    nameKey: "expenses.gameNameMemory",
    blurbKey: "expenses.gameBlurbMemory",
    howKey: "expenses.gameHowMemory",
  },
  {
    id: "reaction",
    category: "skill",
    emoji: "⚡",
    imageSrc: "/game-tiles/reaction.jpg",
    nameKey: "expenses.gameNameReaction",
    blurbKey: "expenses.gameBlurbReaction",
    howKey: "expenses.gameHowReaction",
  },
  {
    id: "rps",
    category: "skill",
    emoji: "✊",
    imageSrc: "/game-tiles/rock-paper-scissors.jpg",
    nameKey: "expenses.gameNameRps",
    blurbKey: "expenses.gameBlurbRps",
    howKey: "expenses.gameHowRps",
  },
  {
    id: "nim",
    category: "skill",
    emoji: "🥢",
    imageSrc: "/game-tiles/nim.jpg",
    nameKey: "expenses.gameNameNim",
    blurbKey: "expenses.gameBlurbNim",
    howKey: "expenses.gameHowNim",
  },
  {
    id: "dots",
    category: "skill",
    emoji: "✏️",
    imageSrc: "/game-tiles/dots-and-boxes.jpg",
    nameKey: "expenses.gameNameDots",
    blurbKey: "expenses.gameBlurbDots",
    howKey: "expenses.gameHowDots",
  },
  {
    // A skill game, but for the whole table at once — no duel, so the preview
    // skips the knockout-ladder callout (it asks `isDuelGameId`).
    id: "finger",
    category: "skill",
    emoji: "☝️",
    imageSrc: "/game-tiles/finger.jpg",
    nameKey: "expenses.gameNameFinger",
    blurbKey: "expenses.gameBlurbFinger",
    howKey: "expenses.gameHowFinger",
  },
];

export function splitGameInfo(id: SplitGameId): SplitGameInfo {
  const info = SPLIT_GAMES.find((game) => game.id === id);
  if (!info) throw new Error(`Unknown split game id: ${id}`);
  return info;
}
