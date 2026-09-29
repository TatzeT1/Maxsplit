import { describe, expect, it } from "vitest";
import { addPeriod, firstRunOnOrAfter, utcToday } from "./schedule";

describe("addPeriod", () => {
  it("adds 7 days for a weekly rule", () => {
    expect(addPeriod("2026-03-10", "2026-03-10", "weekly")).toBe("2026-03-17");
  });

  it("rolls a weekly rule across a month boundary", () => {
    expect(addPeriod("2026-03-28", "2026-03-28", "weekly")).toBe("2026-04-04");
  });

  it("advances a monthly rule by one month on a normal day", () => {
    expect(addPeriod("2026-03-15", "2026-03-15", "monthly")).toBe("2026-04-15");
  });

  it("clamps a monthly rule anchored on the 31st into a shorter month", () => {
    expect(addPeriod("2026-01-31", "2026-01-31", "monthly")).toBe("2026-02-28");
  });

  it("re-expands back to the anchor day once the month is long enough again", () => {
    expect(addPeriod("2026-02-28", "2026-01-31", "monthly")).toBe("2026-03-31");
  });

  it("handles a leap-year February for a 29th-anchored rule", () => {
    expect(addPeriod("2028-01-29", "2028-01-29", "monthly")).toBe("2028-02-29");
  });

  it("clamps a 29th-anchored rule in a non-leap February", () => {
    expect(addPeriod("2026-01-29", "2026-01-29", "monthly")).toBe("2026-02-28");
  });

  it("rolls a monthly rule from December into January of the next year", () => {
    expect(addPeriod("2026-12-15", "2026-12-15", "monthly")).toBe("2027-01-15");
  });
});

describe("firstRunOnOrAfter", () => {
  it("leaves a date that is still ahead untouched", () => {
    expect(firstRunOnOrAfter("2026-10-01", "2026-01-01", "monthly", "2026-09-29")).toBe(
      "2026-10-01",
    );
  });

  it("keeps a period that falls on today, so it's still booked", () => {
    expect(firstRunOnOrAfter("2026-09-29", "2026-09-29", "weekly", "2026-09-29")).toBe(
      "2026-09-29",
    );
  });

  it("skips every monthly period that passed while the rule was paused", () => {
    // Paused before June's rent, resumed on 29 Sep: June–September are skipped.
    expect(firstRunOnOrAfter("2026-06-01", "2026-01-01", "monthly", "2026-09-29")).toBe(
      "2026-10-01",
    );
  });

  it("keeps the 31st anchor while skipping through short months", () => {
    expect(firstRunOnOrAfter("2026-01-31", "2026-01-31", "monthly", "2026-04-15")).toBe(
      "2026-04-30",
    );
    expect(firstRunOnOrAfter("2026-01-31", "2026-01-31", "monthly", "2026-05-01")).toBe(
      "2026-05-31",
    );
  });

  it("walks a weekly rule forward in whole weeks from its own dates", () => {
    expect(firstRunOnOrAfter("2026-09-01", "2026-09-01", "weekly", "2026-09-20")).toBe(
      "2026-09-22",
    );
  });
});

describe("utcToday", () => {
  it("uses the UTC calendar day, not the local one", () => {
    expect(utcToday(new Date("2026-09-29T23:30:00-02:00"))).toBe("2026-09-30");
    expect(utcToday(new Date("2026-09-30T00:30:00+02:00"))).toBe("2026-09-29");
  });
});
