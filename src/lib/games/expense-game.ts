import { isSplitGameId } from "@/lib/games/split-game-ids";
import type { ExpenseGame } from "@/lib/types";

/** Far above any real "Neu mischen" streak; only there to keep the field a small number. */
export const MAX_GAME_ATTEMPT = 999;
/** Every split game plays a pool of group members; no group comes near this. */
export const MAX_GAME_PLAYERS = 100;

/**
 * Checks the game record a client sends with a game-decided expense and
 * returns what to store. The record feeds statistics and the group chat, so
 * it has to hold together: a known game, real members of this group, and
 * everyone who pays among the players — a non-player can't have lost.
 *
 * `null`/absent input is fine (a manual split, or an old client); anything
 * malformed is `"invalid-game"`.
 */
export function normalizeExpenseGame(
  input: unknown,
  context: { memberUids: Iterable<string>; payerUids: string[] },
): { ok: true; game: ExpenseGame | null } | { ok: false; error: "invalid-game" } {
  if (input === null || input === undefined) return { ok: true, game: null };
  if (typeof input !== "object") return { ok: false, error: "invalid-game" };
  const { gameId, playerUids, attempt } = input as Record<string, unknown>;

  if (!isSplitGameId(gameId)) return { ok: false, error: "invalid-game" };
  if (!Array.isArray(playerUids) || !playerUids.every((uid) => typeof uid === "string")) {
    return { ok: false, error: "invalid-game" };
  }
  const players = [...new Set(playerUids as string[])];
  const members = new Set(context.memberUids);
  if (
    players.length < 2 ||
    players.length > MAX_GAME_PLAYERS ||
    !players.every((uid) => members.has(uid)) ||
    !context.payerUids.every((uid) => players.includes(uid))
  ) {
    return { ok: false, error: "invalid-game" };
  }
  if (
    typeof attempt !== "number" ||
    !Number.isInteger(attempt) ||
    attempt < 1 ||
    attempt > MAX_GAME_ATTEMPT
  ) {
    return { ok: false, error: "invalid-game" };
  }
  return { ok: true, game: { gameId, playerUids: players, attempt } };
}
