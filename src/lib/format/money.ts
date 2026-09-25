const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const cached = formatterCache.get(currency);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat("de-DE", { style: "currency", currency });
  formatterCache.set(currency, formatter);
  return formatter;
}

/**
 * Formats an integer minor-units amount (e.g. cents) as a German-locale currency
 * string, e.g. `formatMoney(123456, "EUR")` -> "1.234,56 €". Respects each
 * currency's actual minor-unit exponent (EUR/USD: 2, JPY: 0) via Intl's
 * resolved fraction digits, rather than assuming "divide by 100" universally.
 */
export function formatMoney(amountMinor: number, currency: string): string {
  const formatter = getFormatter(currency);
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const amountMajor = amountMinor / 10 ** digits;
  return formatter.format(amountMajor);
}

/**
 * Converts an integer minor-units amount to a plain major-units number (e.g.
 * 2550 -> 25.5 for EUR), respecting each currency's actual minor-unit
 * exponent the same way formatMoney does. For feeding a raw amount into
 * something that isn't Intl-formatted, like buildPaypalMeLink.
 */
export function minorToMajor(amountMinor: number, currency: string): number {
  const formatter = getFormatter(currency);
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return amountMinor / 10 ** digits;
}

/**
 * Parses a German-locale money input like "12,50" or "1.234,56" into integer
 * minor units (1250, 123456). Returns null for anything that isn't a plain
 * non-negative amount with at most two decimal digits — never guesses.
 */
export function parseMoneyInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  return Math.round(Number.parseFloat(normalized) * 100);
}

/** Formats an integer minor-units amount as an editable German-locale decimal string, e.g. `moneyToInput(2550)` -> "25,50". The inverse of `parseMoneyInput`. */
export function moneyToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2).replace(".", ",");
}
