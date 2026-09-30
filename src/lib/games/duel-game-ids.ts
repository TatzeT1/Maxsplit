import type { DuelGameId } from "@/lib/types";
import type { TranslationKey } from "@/lib/i18n/translate";

/** Runtime list mirroring the `DuelGameId` union, for validating a Server Action's input. */
export const DUEL_GAME_IDS: readonly DuelGameId[] = [
  "tictactoe",
  "connectfour",
  "memory",
  "reaction",
  "rps",
  "nim",
  "dots",
];

export function isDuelGameId(value: string): value is DuelGameId {
  return (DUEL_GAME_IDS as readonly string[]).includes(value);
}

/** Emoji + title per duel game, for places that only need to *name* a game (chat invite, banner) without pulling in its board. */
export const DUEL_GAME_META: Record<DuelGameId, { emoji: string; titleKey: TranslationKey }> = {
  tictactoe: { emoji: "⭕", titleKey: "expenses.ticTacToeTitle" },
  connectfour: { emoji: "🔴", titleKey: "expenses.connectFourTitle" },
  memory: { emoji: "🧠", titleKey: "expenses.memoryTitle" },
  reaction: { emoji: "⚡", titleKey: "expenses.reactionTitle" },
  rps: { emoji: "✊", titleKey: "expenses.rpsTitle" },
  nim: { emoji: "🥢", titleKey: "expenses.nimTitle" },
  dots: { emoji: "✏️", titleKey: "expenses.dotsTitle" },
};
