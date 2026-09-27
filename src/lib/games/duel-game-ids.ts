import type { DuelGameId } from "@/lib/types";

/** Runtime list mirroring the `DuelGameId` union, for validating a Server Action's input. */
export const DUEL_GAME_IDS: readonly DuelGameId[] = [
  "tictactoe",
  "connectfour",
  "memory",
  "reaction",
];

export function isDuelGameId(value: string): value is DuelGameId {
  return (DUEL_GAME_IDS as readonly string[]).includes(value);
}
