import { beforeEach, describe, expect, it } from "vitest";
import {
  RECENT_GAMES_MAX,
  readRecentGames,
  readRememberedSetup,
  recordRecentGame,
  rememberSetup,
} from "@/lib/games/game-memory";

describe("remembered game setup", () => {
  beforeEach(() => window.localStorage.clear());

  it("has nothing to offer before a game was started", () => {
    expect(readRememberedSetup("g1", ["a", "b", "c"])).toBeNull();
  });

  it("returns the last pool and payer count of the same group", () => {
    rememberSetup("g1", { poolUids: ["c", "a"], loserCount: 2 });
    expect(readRememberedSetup("g1", ["a", "b", "c"])).toEqual({
      poolUids: ["a", "c"],
      loserCount: 2,
    });
    expect(readRememberedSetup("g2", ["a", "b", "c"])).toBeNull();
  });

  it("drops people who left and gives up below two players", () => {
    rememberSetup("g1", { poolUids: ["a", "b", "x"], loserCount: 1 });
    expect(readRememberedSetup("g1", ["a", "b", "c"])?.poolUids).toEqual(["a", "b"]);
    expect(readRememberedSetup("g1", ["a", "c"])).toBeNull();
  });

  it("keeps the stored payer count when a game has none", () => {
    rememberSetup("g1", { poolUids: ["a", "b", "c"], loserCount: 2 });
    rememberSetup("g1", { poolUids: ["a", "b"] });
    expect(readRememberedSetup("g1", ["a", "b", "c"])).toEqual({
      poolUids: ["a", "b"],
      loserCount: 2,
    });
  });

  it("survives garbage in storage", () => {
    window.localStorage.setItem("split:game-setup:g1", "{not json");
    expect(readRememberedSetup("g1", ["a", "b"])).toBeNull();
    window.localStorage.setItem("split:game-setup:g1", JSON.stringify({ poolUids: ["a", "b"] }));
    expect(readRememberedSetup("g1", ["a", "b"])?.loserCount).toBe(1);
  });

  it("does nothing without a group", () => {
    rememberSetup(undefined, { poolUids: ["a", "b"], loserCount: 1 });
    expect(readRememberedSetup(undefined, ["a", "b"])).toBeNull();
  });
});

describe("recently played games", () => {
  beforeEach(() => window.localStorage.clear());

  it("keeps the most recent first, without duplicates, capped", () => {
    recordRecentGame("g1", "wheel");
    recordRecentGame("g1", "slot");
    recordRecentGame("g1", "wheel");
    expect(readRecentGames("g1")).toEqual(["wheel", "slot"]);

    for (const id of ["dicecup", "nim", "memory"]) recordRecentGame("g1", id);
    expect(readRecentGames("g1")).toHaveLength(RECENT_GAMES_MAX);
    expect(readRecentGames("g1")[0]).toBe("memory");
    expect(readRecentGames("g2")).toEqual([]);
  });
});
