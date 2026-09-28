const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Formats a date as "12.08.2026". */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Formats a date's weekday as "Mo", "Di", … "So". */
export function formatWeekday(date: Date): string {
  return weekdayFormatter.format(date);
}

/** Formats a date's time as "14:05". */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

const dayMonthFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

/** Formats a date as "12.08." — for rows already grouped under their month. */
export function formatDayMonth(date: Date): string {
  return dayMonthFormatter.format(date);
}

const monthYearFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats a "YYYY-MM" month key as "August 2026". Built at UTC midnight and
 * formatted in UTC, so no local offset can tip the first of the month back
 * into the previous one.
 */
export function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return monthYearFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}
