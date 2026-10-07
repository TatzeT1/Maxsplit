import { describe, expect, it } from "vitest";
import { applyReactionOverrides, overrideKey, pruneReactionOverrides } from "./reactions";

const message = { id: "m1", reactions: { up: ["lea"], done: ["max", "lea"] } };

describe("applyReactionOverrides", () => {
  it("shows my pending tap on top of what the listener delivered", () => {
    expect(applyReactionOverrides(message, "max", { [overrideKey("m1", "up")]: true })).toEqual({
      up: ["lea", "max"],
      done: ["max", "lea"],
    });
    expect(applyReactionOverrides(message, "max", { [overrideKey("m1", "done")]: false })).toEqual({
      up: ["lea"],
      done: ["lea"],
    });
  });

  it("leaves other messages' overrides and an untouched message alone", () => {
    expect(applyReactionOverrides(message, "max", { [overrideKey("m2", "up")]: true })).toEqual(
      message.reactions,
    );
    expect(applyReactionOverrides({ id: "m3" }, "max", {})).toEqual({});
  });

  it("can start a reaction on a message that has none yet", () => {
    expect(
      applyReactionOverrides({ id: "m3" }, "max", { [overrideKey("m3", "heart")]: true }),
    ).toEqual({
      heart: ["max"],
    });
  });
});

describe("pruneReactionOverrides", () => {
  it("drops an override once the listener agrees with it", () => {
    const overrides = { [overrideKey("m1", "done")]: true, [overrideKey("m1", "up")]: true };
    expect(pruneReactionOverrides(overrides, [message], "max")).toEqual({
      [overrideKey("m1", "up")]: true,
    });
  });

  it("drops the override of a message that is gone", () => {
    expect(pruneReactionOverrides({ [overrideKey("gone", "up")]: true }, [message], "max")).toEqual(
      {},
    );
  });

  it("returns the same object when nothing changed", () => {
    const overrides = { [overrideKey("m1", "up")]: true };
    expect(pruneReactionOverrides(overrides, [message], "max")).toBe(overrides);
  });
});
