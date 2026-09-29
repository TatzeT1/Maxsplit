// Limits and checks for the free-form fields of ledger entries (expenses,
// settlements, recurring rules, groups), shared by the Server Actions that
// enforce them and the form inputs that mirror them — "define once, used by
// both sides that must agree", like MAX_MESSAGE_LENGTH for chat. A TypeScript
// parameter type is compile-time only: a hand-crafted request can send any
// string, so the server checks every one of these itself.

/** Expense and recurring-rule descriptions, and a game's auto-booked bill. */
export const MAX_DESCRIPTION_LENGTH = 200;

/** A settlement's optional note. */
export const MAX_NOTE_LENGTH = 200;

/** Group names and placeholder members' names — the same cap as a user's own display name. */
export const MAX_NAME_LENGTH = 60;

/**
 * An expense's emoji override or a group's icon: one emoji, which can take up
 * to 11 UTF-16 units for a ZWJ family sequence — 16 leaves headroom without
 * letting a paragraph of text through.
 */
export const MAX_EMOJI_LENGTH = 16;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether `value` is a real calendar date written as yyyy-mm-dd, in a
 * plausible range. The range catches a year typed as "0026" into a date
 * field: well-formed, but as a recurring rule's start it would have the cron
 * booking periods back to the year 26, 24 a day.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  if (year < 2000 || year > 2099) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A non-blank description within MAX_DESCRIPTION_LENGTH. */
export function isValidDescription(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_DESCRIPTION_LENGTH
  );
}

/** No emoji (null), or a short string that can hold a single emoji — see MAX_EMOJI_LENGTH. */
export function isValidEmoji(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && value.length > 0 && value.length <= MAX_EMOJI_LENGTH)
  );
}

/** A non-blank name within MAX_NAME_LENGTH. */
export function isValidName(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= MAX_NAME_LENGTH
  );
}
