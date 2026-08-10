import { describe, expect, it } from "vitest";
import { addPeriod } from "./schedule";

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
