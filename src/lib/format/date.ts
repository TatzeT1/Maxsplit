const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

/** Formats a date as "12.08.2026". */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Formats a date's weekday as "Mo", "Di", … "So". */
export function formatWeekday(date: Date): string {
  return weekdayFormatter.format(date);
}
