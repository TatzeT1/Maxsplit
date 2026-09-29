import { describe, expect, it } from "vitest";
import { moveMemberAmount, moveMemberInLedgerEntry, moveMemberSplit } from "./move-member";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe("moveMemberAmount", () => {
  it("renames the key and keeps the amount", () => {
    expect(moveMemberAmount({ ph_lea: 3000, max: 1000 }, "ph_lea", "lea")).toEqual({
      max: 1000,
      lea: 3000,
    });
  });

  it("returns null when the source uid isn't there", () => {
    expect(moveMemberAmount({ max: 1000 }, "ph_lea", "lea")).toBeNull();
  });

  it("adds onto an existing entry for the target instead of overwriting it", () => {
    const paidBy = { ph_lea: 3000, lea: 1500, max: 500 };
    const moved = moveMemberAmount(paidBy, "ph_lea", "lea");
    expect(moved).toEqual({ lea: 4500, max: 500 });
    expect(sum(Object.values(moved!))).toBe(sum(Object.values(paidBy)));
  });
});

describe("moveMemberSplit", () => {
  it("renames the key and keeps the share", () => {
    expect(
      moveMemberSplit({ ph_lea: { rawValue: 1, amountMinor: 1500 } }, "ph_lea", "lea"),
    ).toEqual({ lea: { rawValue: 1, amountMinor: 1500 } });
  });

  it("returns null when the source uid isn't there", () => {
    expect(moveMemberSplit({ max: { rawValue: 1, amountMinor: 1 } }, "ph_lea", "lea")).toBeNull();
  });

  it("merges into an existing share so the split still sums to the expense", () => {
    const splits = {
      ph_lea: { rawValue: 2, amountMinor: 2000 },
      lea: { rawValue: 1, amountMinor: 1000 },
      max: { rawValue: 1, amountMinor: 1000 },
    };
    const moved = moveMemberSplit(splits, "ph_lea", "lea")!;
    expect(moved).toEqual({
      lea: { rawValue: 3, amountMinor: 3000 },
      max: { rawValue: 1, amountMinor: 1000 },
    });
    expect(sum(Object.values(moved).map((split) => split.amountMinor))).toBe(4000);
  });
});

describe("moveMemberInLedgerEntry", () => {
  const entry = {
    paidBy: { max: 4000 },
    splits: {
      max: { rawValue: 1, amountMinor: 2000 },
      ph_lea: { rawValue: 1, amountMinor: 2000 },
    },
  };

  it("only includes the fields that actually change", () => {
    expect(moveMemberInLedgerEntry(entry, "ph_lea", "lea")).toEqual({
      splits: {
        max: { rawValue: 1, amountMinor: 2000 },
        lea: { rawValue: 1, amountMinor: 2000 },
      },
    });
  });

  it("returns null for an entry that doesn't mention the member", () => {
    expect(moveMemberInLedgerEntry(entry, "ph_tom", "tom")).toBeNull();
  });
});
