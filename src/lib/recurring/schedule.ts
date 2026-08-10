import type { RecurringFrequency } from "@/lib/types";

/**
 * Advances an ISO date (yyyy-mm-dd) by one period.
 *
 * Monthly rollovers target the anchor day-of-month from the rule's
 * `startDate`, clamped to the target month's length (Jan 31 -> Feb 28) and
 * re-expanding once a month is long enough again (Feb 28 -> Mar 31 for a
 * rule anchored on the 31st). Anchoring to `startDate` rather than advancing
 * from the previous `nextRunDate` avoids permanently drifting the day down
 * after the first short month.
 */
export function addPeriod(
  nextRunDate: string,
  startDate: string,
  frequency: RecurringFrequency,
): string {
  const [year, month, day] = nextRunDate.split("-").map(Number);

  if (frequency === "weekly") {
    return new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
  }

  const anchorDay = Number(startDate.split("-")[2]);
  const targetMonthIndex = month; // 0-based index of the month after nextRunDate's month
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(anchorDay, lastDayOfTargetMonth);
  return new Date(Date.UTC(year, targetMonthIndex, targetDay)).toISOString().slice(0, 10);
}
