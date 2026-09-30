import { describe, expect, it } from "vitest";
import {
  RPS_HANDS,
  RPS_ROUNDS_TO_WIN,
  isRpsHand,
  judgeRpsRound,
  rpsMatchWinner,
  rpsScore,
  type RpsHand,
  type RpsRound,
} from "./rock-paper-scissors";

describe("judgeRpsRound", () => {
  it("lets rock beat scissors, scissors beat paper and paper beat rock", () => {
    expect(judgeRpsRound("rock", "scissors")).toBe(0);
    expect(judgeRpsRound("scissors", "paper")).toBe(0);
    expect(judgeRpsRound("paper", "rock")).toBe(0);
  });

  it("gives the round to the second hand when it is the stronger one", () => {
    expect(judgeRpsRound("scissors", "rock")).toBe(1);
    expect(judgeRpsRound("paper", "scissors")).toBe(1);
    expect(judgeRpsRound("rock", "paper")).toBe(1);
  });

  it("calls the same hand twice a draw", () => {
    for (const hand of RPS_HANDS) expect(judgeRpsRound(hand, hand)).toBeNull();
  });

  it("is antisymmetric: swapping the hands swaps the winner", () => {
    for (const a of RPS_HANDS) {
      for (const b of RPS_HANDS) {
        const forward = judgeRpsRound(a, b);
        const backward = judgeRpsRound(b, a);
        if (forward === null) expect(backward).toBeNull();
        else expect(backward).toBe(forward === 0 ? 1 : 0);
      }
    }
  });
});

describe("isRpsHand", () => {
  it("accepts the three hands and nothing else", () => {
    for (const hand of RPS_HANDS) expect(isRpsHand(hand)).toBe(true);
    expect(isRpsHand("lizard")).toBe(false);
    expect(isRpsHand("")).toBe(false);
    expect(isRpsHand(1)).toBe(false);
    expect(isRpsHand(null)).toBe(false);
  });
});

function round(p0: RpsHand, p1: RpsHand): RpsRound {
  return { p0, p1 };
}

describe("rpsScore / rpsMatchWinner", () => {
  it("counts only decided rounds", () => {
    const rounds = [round("rock", "rock"), round("rock", "scissors"), round("paper", "paper")];
    expect(rpsScore(rounds)).toEqual([1, 0]);
    expect(rpsMatchWinner(rounds)).toBeNull();
  });

  it("ends the match at two round wins", () => {
    expect(RPS_ROUNDS_TO_WIN).toBe(2);
    expect(rpsMatchWinner([round("rock", "scissors"), round("paper", "rock")])).toBe(0);
    expect(rpsMatchWinner([round("scissors", "rock"), round("rock", "paper")])).toBe(1);
  });

  it("goes the distance at one round each", () => {
    const rounds = [round("rock", "scissors"), round("rock", "paper")];
    expect(rpsScore(rounds)).toEqual([1, 1]);
    expect(rpsMatchWinner(rounds)).toBeNull();
    expect(rpsMatchWinner([...rounds, round("paper", "rock")])).toBe(0);
    expect(rpsMatchWinner([...rounds, round("rock", "paper")])).toBe(1);
  });

  it("never ends a match before the first round is played", () => {
    expect(rpsScore([])).toEqual([0, 0]);
    expect(rpsMatchWinner([])).toBeNull();
  });
});
