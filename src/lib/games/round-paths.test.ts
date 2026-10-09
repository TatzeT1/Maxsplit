import { describe, expect, it } from "vitest";
import { estimatePlayPath, estimateRoundPath, gameRoundPath } from "@/lib/games/round-paths";
import { SPLIT_GAME_IDS } from "@/lib/games/split-game-ids";

describe("estimateRoundPath", () => {
  it("is the app page under the group", () => {
    expect(estimateRoundPath("g1", "r1")).toBe("/groups/g1/estimate/r1");
  });
});

describe("estimatePlayPath", () => {
  it("is the public share entry", () => {
    expect(estimatePlayPath("g1", "r1")).toBe("/play/g1/estimate/r1");
  });
});

describe("gameRoundPath", () => {
  it("sends a scratch card to /rounds/", () => {
    expect(gameRoundPath("g1", "scratch", "r1")).toBe("/groups/g1/rounds/r1");
  });

  it("sends the estimate game to /estimate/", () => {
    expect(gameRoundPath("g1", "estimate", "r1")).toBe("/groups/g1/estimate/r1");
    expect(gameRoundPath("g1", "estimate", "r1")).toBe(estimateRoundPath("g1", "r1"));
  });

  it("keeps every other game on the luck-round route", () => {
    for (const gameId of SPLIT_GAME_IDS) {
      if (gameId === "estimate") continue;
      expect(gameRoundPath("g1", gameId, "r1")).toBe("/groups/g1/rounds/r1");
    }
  });
});
