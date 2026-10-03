import { describe, expect, it } from "vitest";
import { SPLIT_GAMES } from "@/components/groups/split-game/game-catalog";
import { MAX_GAME_ATTEMPT, normalizeExpenseGame } from "@/lib/games/expense-game";
import { SPLIT_GAME_IDS } from "@/lib/games/split-game-ids";

const context = { memberUids: ["a", "b", "c", "d"], payerUids: ["b"] };

describe("normalizeExpenseGame", () => {
  it("stores nothing for a manual split", () => {
    expect(normalizeExpenseGame(null, context)).toEqual({ ok: true, game: null });
    expect(normalizeExpenseGame(undefined, context)).toEqual({ ok: true, game: null });
  });

  it("keeps a sound record, players deduplicated", () => {
    expect(
      normalizeExpenseGame({ gameId: "wheel", playerUids: ["a", "b", "a"], attempt: 2 }, context),
    ).toEqual({ ok: true, game: { gameId: "wheel", playerUids: ["a", "b"], attempt: 2 } });
  });

  it.each([
    ["an unknown game", { gameId: "poker", playerUids: ["a", "b"], attempt: 1 }],
    ["a stranger as player", { gameId: "wheel", playerUids: ["a", "b", "x"], attempt: 1 }],
    ["a payer who didn't play", { gameId: "wheel", playerUids: ["a", "c"], attempt: 1 }],
    ["a single player", { gameId: "wheel", playerUids: ["b"], attempt: 1 }],
    ["players that aren't strings", { gameId: "wheel", playerUids: ["b", 3], attempt: 1 }],
    ["attempt zero", { gameId: "wheel", playerUids: ["a", "b"], attempt: 0 }],
    ["a fractional attempt", { gameId: "wheel", playerUids: ["a", "b"], attempt: 1.5 }],
    ["a huge attempt", { gameId: "wheel", playerUids: ["a", "b"], attempt: MAX_GAME_ATTEMPT + 1 }],
    ["a string", "wheel"],
  ])("rejects %s", (_label, input) => {
    expect(normalizeExpenseGame(input, context)).toEqual({ ok: false, error: "invalid-game" });
  });
});

describe("split game ids", () => {
  it("are exactly the games the picker offers", () => {
    expect([...SPLIT_GAME_IDS].sort()).toEqual(SPLIT_GAMES.map((game) => game.id).sort());
  });
});
