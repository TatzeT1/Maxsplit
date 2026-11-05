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

const isoDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Formats a stored "yyyy-mm-dd" date as "12.08.2026". Parsed and formatted in
 * UTC (like formatMonthKey), so the device's offset can't move it a day.
 */
export function formatIsoDate(isoDate: string): string {
  return isoDateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(locale: string): Intl.RelativeTimeFormat {
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * How long ago a moment was, in calendar days of the device's time zone:
 * "heute", "gestern", "vor 3 Tagen", "vor 2 Wochen" — and the plain date
 * ("12.08.2026") from about a month on, where "vor 7 Wochen" stops helping.
 */
export function formatRelativeDay(at: Date, now: Date = new Date(), locale = "de-DE"): string {
  const startOfDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  const formatter = relativeFormatter(locale);
  if (days <= 0) return formatter.format(0, "day");
  if (days < 7) return formatter.format(-days, "day");
  if (days < 35) return formatter.format(-Math.floor(days / 7), "week");
  return formatDate(at);
}
