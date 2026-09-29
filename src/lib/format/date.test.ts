import { describe, expect, it } from "vitest";
import { formatDayMonth, formatIsoDate, formatMonthKey } from "./date";

describe("formatMonthKey", () => {
  it("names the month in German with its year", () => {
    expect(formatMonthKey("2026-09")).toBe("September 2026");
    expect(formatMonthKey("2026-03")).toBe("März 2026");
  });

  it("never tips January back into the previous December", () => {
    // Built and formatted in UTC: a local negative offset can't move the 1st
    // of the month into the day before.
    expect(formatMonthKey("2027-01")).toBe("Januar 2027");
  });
});

describe("formatDayMonth", () => {
  it("formats day and month with leading zeros and a trailing dot", () => {
    expect(formatDayMonth(new Date(2026, 8, 5))).toBe("05.09.");
  });
});

describe("formatIsoDate", () => {
  it("formats a stored yyyy-mm-dd date the German way", () => {
    expect(formatIsoDate("2026-09-29")).toBe("29.09.2026");
    expect(formatIsoDate("2026-01-01")).toBe("01.01.2026");
  });
});
