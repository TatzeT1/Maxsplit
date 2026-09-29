import { describe, expect, it } from "vitest";
import { ruleHasMissingMembers, ruleMemberUids, ruleNamesMember } from "./rule-members";

const rule = {
  paidBy: { max: 6000 },
  splits: {
    max: { rawValue: 1, amountMinor: 3000 },
    lea: { rawValue: 1, amountMinor: 3000 },
  },
};

describe("ruleMemberUids", () => {
  it("lists payers and participants once each", () => {
    expect(ruleMemberUids(rule).sort()).toEqual(["lea", "max"]);
  });
});

describe("ruleNamesMember", () => {
  it("finds a participant who doesn't pay", () => {
    expect(ruleNamesMember(rule, "lea")).toBe(true);
  });

  it("finds a payer who isn't a participant", () => {
    expect(ruleNamesMember({ paidBy: { tom: 100 }, splits: {} }, "tom")).toBe(true);
  });

  it("is false for someone the rule doesn't name", () => {
    expect(ruleNamesMember(rule, "tom")).toBe(false);
  });
});

describe("ruleHasMissingMembers", () => {
  it("is false while everyone named is still a member", () => {
    expect(ruleHasMissingMembers(rule, { max: {}, lea: {}, tom: {} })).toBe(false);
  });

  it("is true once a named participant has left", () => {
    expect(ruleHasMissingMembers(rule, { max: {} })).toBe(true);
  });

  it("is true for a placeholder id that was claimed away before claims rewrote rules", () => {
    const stale = { paidBy: { max: 100 }, splits: { ph_lea: { rawValue: 1, amountMinor: 100 } } };
    expect(ruleHasMissingMembers(stale, { max: {}, lea: {} })).toBe(true);
  });
});
