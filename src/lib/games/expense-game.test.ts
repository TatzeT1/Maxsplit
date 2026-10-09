import { describe, expect, it } from "vitest";
import { SPLIT_GAMES } from "@/components/groups/split-game/game-catalog";
import { MAX_GAME_ATTEMPT, normalizeExpenseGame } from "@/lib/games/expense-game";
import {
  isLuckGameId,
  isQuizGameId,
  isSplitGameId,
  QUIZ_GAME_IDS,
  SPLIT_GAME_IDS,
  SPLIT_GAME_META,
} from "@/lib/games/split-game-ids";

const context = { memberUids: ["a", "b", "c", "d"], payerUids: ["b"] };

describe("normalizeExpenseGame", () => {
  it("stores nothing for a manual split", () => {
    expect(normalizeExpenseGame(null, context)).toEqual({ ok: true, game: null });
    expect(normalizeExpenseGame(undefined, context)).toEqual({ ok: true, game: null });
  });

  it("accepts the whole-table finger game like any other", () => {
    expect(
      normalizeExpenseGame({ gameId: "finger", playerUids: ["a", "b", "c"], attempt: 1 }, context),
    ).toEqual({ ok: true, game: { gameId: "finger", playerUids: ["a", "b", "c"], attempt: 1 } });
  });

  it("keeps a sound record, players deduplicated", () => {
    expect(
      normalizeExpenseGame({ gameId: "wheel", playerUids: ["a", "b", "a"], attempt: 2 }, context),
    ).toEqual({ ok: true, game: { gameId: "wheel", playerUids: ["a", "b"], attempt: 2 } });
  });

  describe("an estimate game", () => {
    const estimate = { gameId: "estimate", playerUids: ["a", "b", "c"], attempt: 1 };
    const stored = { gameId: "estimate", playerUids: ["a", "b", "c"], attempt: 1 };

    it("is a known game like any other", () => {
      expect(normalizeExpenseGame(estimate, context)).toEqual({ ok: true, game: stored });
    });

    it("hands the claimed round's id back beside a game that never holds it", () => {
      const result = normalizeExpenseGame({ ...estimate, estimateRoundId: "abc" }, context);
      expect(result).toEqual({ ok: true, game: stored, estimateRoundId: "abc" });
      if (!result.ok) throw new Error("expected ok");
      expect(result.game).not.toBeNull();
      expect(Object.keys(result.game!).sort()).toEqual(["attempt", "gameId", "playerUids"]);
    });

    it("has no estimateRoundId key at all when none was sent", () => {
      const result = normalizeExpenseGame(estimate, context);
      expect(result).not.toHaveProperty("estimateRoundId");
    });

    it("drops a client-sent audit instead of copying it", () => {
      const forged = {
        rulesVersion: 1,
        roundId: "abc",
        booked: { amountMinor: 1, currency: "EUR", loserUids: ["b"] },
      };
      const result = normalizeExpenseGame({ ...estimate, estimate: forged }, context);
      expect(result).toEqual({ ok: true, game: stored });
      if (!result.ok) throw new Error("expected ok");
      expect(result.game).not.toHaveProperty("estimate");
    });

    it("drops the audit even next to a round id", () => {
      const result = normalizeExpenseGame(
        { ...estimate, estimateRoundId: "r1", estimate: { forged: true } },
        context,
      );
      expect(result).toEqual({ ok: true, game: stored, estimateRoundId: "r1" });
    });

    it("accepts the characters of a Firestore auto id, up to 128", () => {
      for (const id of ["a", "Ab3_-xY", "x".repeat(128)]) {
        expect(normalizeExpenseGame({ ...estimate, estimateRoundId: id }, context)).toEqual({
          ok: true,
          game: stored,
          estimateRoundId: id,
        });
      }
    });

    it.each([
      ["a path", "../x"],
      ["a nested path", "a/b"],
      ["a dot", "a.b"],
      ["a space", "a b"],
      ["an empty id", ""],
      ["an over-long id", "x".repeat(129)],
      ["a number", 5],
      ["null", null],
      ["an object", { id: "abc" }],
      ["an array", ["abc"]],
    ])("rejects %s as the round id", (_label, estimateRoundId) => {
      expect(normalizeExpenseGame({ ...estimate, estimateRoundId }, context)).toEqual({
        ok: false,
        error: "invalid-game",
      });
    });
  });

  it.each([
    ["a luck game", "wheel"],
    ["a table game", "finger"],
    ["a duel", "tictactoe"],
  ])("rejects a round id on %s", (_label, gameId) => {
    expect(
      normalizeExpenseGame(
        { gameId, playerUids: ["a", "b", "c"], attempt: 1, estimateRoundId: "abc" },
        context,
      ),
    ).toEqual({ ok: false, error: "invalid-game" });
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

  it("list every game once", () => {
    expect(new Set(SPLIT_GAME_IDS).size).toBe(SPLIT_GAME_IDS.length);
  });

  it("put the estimate game in its own quiz group: not luck, not a duel", () => {
    expect(QUIZ_GAME_IDS).toEqual(["estimate"]);
    expect(isQuizGameId("estimate")).toBe(true);
    expect(isQuizGameId("finger")).toBe(false);
    expect(isQuizGameId("wheel")).toBe(false);
    expect(isSplitGameId("estimate")).toBe(true);
    // so the Glücks-Index (game-stats) never counts it
    expect(isLuckGameId("estimate")).toBe(false);
  });

  it("name the estimate game with the target emoji, used by no other game", () => {
    expect(SPLIT_GAME_META.estimate).toEqual({
      emoji: "🎯",
      nameKey: "expenses.gameNameEstimate",
    });
    const emojis = Object.values(SPLIT_GAME_META).map((meta) => meta.emoji);
    expect(emojis.filter((emoji) => emoji === "🎯")).toHaveLength(1);
  });

  it("carry the picker's emoji and name everywhere else", () => {
    for (const game of SPLIT_GAMES) {
      expect(SPLIT_GAME_META[game.id]).toEqual({ emoji: game.emoji, nameKey: game.nameKey });
    }
  });
});
