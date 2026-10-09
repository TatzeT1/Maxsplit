import { isSplitGameId } from "@/lib/games/split-game-ids";
import type { ExpenseGame } from "@/lib/types";

/** Far above any real "Neu mischen" streak; only there to keep the field a small number. */
export const MAX_GAME_ATTEMPT = 999;
/** Every split game plays a pool of group members; no group comes near this. */
export const MAX_GAME_PLAYERS = 100;
/** A Firestore auto id, or anything shaped like one; no slash, dot or space, so it can't walk out of a document path. */
const ESTIMATE_ROUND_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Checks the game record a client sends with a game-decided expense and
 * returns what to store. The record feeds statistics and the group chat, so
 * it has to hold together: a known game, real members of this group, and
 * everyone who pays among the players — a non-player can't have lost.
 *
 * `null`/absent input is fine (a manual split, or an old client); anything
 * malformed is `"invalid-game"`.
 *
 * The stored `game` is exactly `{ gameId, playerUids, attempt }`. Two fields
 * an estimate game adds never reach it: `estimate` (the audit) is written by
 * the server alone, so a client-sent one is dropped; `estimateRoundId` (the
 * one-phone round this expense claims, verified by `addExpense`) comes back
 * beside the record, because `editExpense` stores `game` verbatim and an id
 * inside it would be persisted unverified.
 */
export function normalizeExpenseGame(
  input: unknown,
  context: { memberUids: Iterable<string>; payerUids: string[] },
):
  | { ok: true; game: ExpenseGame | null; estimateRoundId?: string }
  | { ok: false; error: "invalid-game" } {
  if (input === null || input === undefined) return { ok: true, game: null };
  if (typeof input !== "object") return { ok: false, error: "invalid-game" };
  const { gameId, playerUids, attempt, estimateRoundId } = input as Record<string, unknown>;

  if (!isSplitGameId(gameId)) return { ok: false, error: "invalid-game" };
  if (estimateRoundId !== undefined) {
    if (
      gameId !== "estimate" ||
      typeof estimateRoundId !== "string" ||
      !ESTIMATE_ROUND_ID.test(estimateRoundId)
    ) {
      return { ok: false, error: "invalid-game" };
    }
  }
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
  const game: ExpenseGame = { gameId, playerUids: players, attempt };
  return typeof estimateRoundId === "string"
    ? { ok: true, game, estimateRoundId }
    : { ok: true, game };
}
