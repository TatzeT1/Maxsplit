import { describe, expect, it } from "vitest";
import { monthKeyOfDate, previousMonthKey, summarizeMonths } from "./month-summary";

const expense = (
  date: string,
  amountMinor: number,
  mine: number | null,
  deletedAt: string | null = null,
) => ({
  date,
  amountMinor,
  deletedAt,
  splits:
    mine === null
      ? { b: { amountMinor } }
      : { a: { amountMinor: mine }, b: { amountMinor: amountMinor - mine } },
});

describe("summarizeMonths", () => {
  it("sums totals and your share per month, newest first", () => {
    const result = summarizeMonths(
      [
        expense("2026-10-30", 2000, 1000),
        expense("2026-11-02", 3000, 1500),
        expense("2026-11-04", 1000, null),
        expense("2026-11-05", 9999, 9999, "deleted"),
      ] as never,
      "a",
    );
    expect([...result.keys()]).toEqual(["2026-11", "2026-10"]);
    expect(result.get("2026-11")).toEqual({
      monthKey: "2026-11",
      totalMinor: 4000,
      shareMinor: 1500,
      count: 2,
    });
  });

  it("nets credits out", () => {
    const result = summarizeMonths(
      [expense("2026-11-01", 3000, 1500), expense("2026-11-02", -1000, -500)] as never,
      "a",
    );
    expect(result.get("2026-11")).toMatchObject({ totalMinor: 2000, shareMinor: 1000 });
  });
});

describe("month keys", () => {
  it("formats and steps back across a year", () => {
    expect(monthKeyOfDate(new Date(2026, 0, 15))).toBe("2026-01");
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-11")).toBe("2026-10");
  });
});
