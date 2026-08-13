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
