import { describe, expect, it } from "vitest";
import { REACTION_TIE_WINDOW_MS, judgeReaction } from "./reaction-duel";

describe("judgeReaction", () => {
  it("returns null when neither player has tapped", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [null, null] })).toBeNull();
  });

  it("the sole tapper wins if their tap came after the signal", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [1050, null] })).toEqual({
      kind: "win",
      winner: 0,
      reason: "faster",
    });
  });

  it("the sole tapper loses as a false start if their tap came before the signal", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [null, 950] })).toEqual({
      kind: "win",
      winner: 0,
      reason: "falseStart",
    });
  });

  it("any tap before the signal even appears is a false start", () => {
    expect(judgeReaction({ signalAt: null, taps: [500, null] })).toEqual({
      kind: "win",
      winner: 1,
      reason: "falseStart",
    });
  });

  it("the earlier valid tap wins outright when the gap is clear", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [1050, 1200] })).toEqual({
      kind: "win",
      winner: 0,
      reason: "faster",
    });
  });

  it("is too close to call when both valid taps land within the tie window", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [1050, 1050 + REACTION_TIE_WINDOW_MS] })).toEqual({
      kind: "tooClose",
    });
  });

  it("is decisive once the gap exceeds the tie window", () => {
    expect(
      judgeReaction({ signalAt: 1000, taps: [1050, 1050 + REACTION_TIE_WINDOW_MS + 1] }),
    ).toEqual({ kind: "win", winner: 0, reason: "faster" });
  });

  it("the earlier false-starter loses even if the other tap came later and was valid", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [900, 1100] })).toEqual({
      kind: "win",
      winner: 1,
      reason: "falseStart",
    });
  });

  it("is too close to call when both false-start within the tie window of each other", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [900, 900 + REACTION_TIE_WINDOW_MS] })).toEqual({
      kind: "tooClose",
    });
  });

  it("the earlier of two false starts loses even when they aren't within the tie window", () => {
    expect(judgeReaction({ signalAt: 1000, taps: [700, 900] })).toEqual({
      kind: "win",
      winner: 1,
      reason: "falseStart",
    });
  });
});
