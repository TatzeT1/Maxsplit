import { DUEL_GAME_IDS } from "@/lib/games/duel-game-ids";
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
