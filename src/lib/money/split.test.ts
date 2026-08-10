import { describe, expect, it } from "vitest";
import { distributeByWeights, splitEqual, validatePaidBy, validateSplits } from "./split";
import { AmountMismatchError } from "./errors";

describe("splitEqual", () => {
  it("splits evenly when the amount divides cleanly", () => {
    const result = splitEqual(900, ["a", "b", "c"]);
    expect(result).toEqual({ a: 300, b: 300, c: 300 });
  });

  it("distributes the remainder deterministically for an odd 3-way split", () => {
    const result = splitEqual(100, ["a", "b", "c"]);
    const sum = Object.values(result).reduce((total, v) => total + v, 0);
    expect(sum).toBe(100);
    // 100 / 3 = 33.33..., so one person gets the extra cent.
    expect(Object.values(result).sort()).toEqual([33, 33, 34]);
  });

  it("gives every cent to the single participant", () => {
    expect(splitEqual(501, ["a"])).toEqual({ a: 501 });
  });

  it("handles a zero amount", () => {
    expect(splitEqual(0, ["a", "b"])).toEqual({ a: 0, b: 0 });
  });

  it("sums to the total for many participants and an awkward amount", () => {
    const uids = Array.from({ length: 7 }, (_, i) => `u${i}`);
    const result = splitEqual(1000, uids);
    const sum = Object.values(result).reduce((total, v) => total + v, 0);
    expect(sum).toBe(1000);
  });
});

describe("distributeByWeights", () => {
  it("splits proportionally to shares with no remainder", () => {
    const result = distributeByWeights(1000, { a: 1, b: 2, c: 1 });
    expect(result).toEqual({ a: 250, b: 500, c: 250 });
  });

  it("splits proportionally to shares with a remainder distributed to largest fractions", () => {
    // total weight 3, amount 100 -> a: 33.33, b: 33.33, c: 33.33, 1 cent leftover
    const result = distributeByWeights(100, { a: 1, b: 1, c: 1 });
    const sum = Object.values(result).reduce((total, v) => total + v, 0);
    expect(sum).toBe(100);
  });

  it("splits by percent weights", () => {
    const result = distributeByWeights(10000, { a: 50, b: 30, c: 20 });
    expect(result).toEqual({ a: 5000, b: 3000, c: 2000 });
  });

  it("throws for non-integer amounts", () => {
    expect(() => distributeByWeights(10.5, { a: 1 })).toThrow();
  });

  it("throws for zero total weight", () => {
    expect(() => distributeByWeights(100, { a: 0 })).toThrow();
  });
});

describe("validatePaidBy", () => {
  it("passes when payer amounts sum to the total", () => {
    expect(() => validatePaidBy(1000, { a: 600, b: 400 })).not.toThrow();
  });

  it("throws AmountMismatchError when payer amounts don't sum to the total", () => {
    expect(() => validatePaidBy(1000, { a: 600, b: 399 })).toThrow(AmountMismatchError);
  });
});

describe("validateSplits", () => {
  it("passes when split amounts sum to the total", () => {
    expect(() => validateSplits(1000, { a: 500, b: 500 })).not.toThrow();
  });

  it("throws AmountMismatchError when split amounts don't sum to the total", () => {
    expect(() => validateSplits(1000, { a: 500, b: 499 })).toThrow(AmountMismatchError);
  });
});
