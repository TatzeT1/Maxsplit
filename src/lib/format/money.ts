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
