/**
 * Builds a PayPal.Me payment link that pre-fills the amount, e.g.
 * `buildPaypalMeLink("maxrobin", 25.5)` -> "https://paypal.me/maxrobin/25.50EUR".
 * `handle` must already be validated (see isValidPaypalMeHandle in
 * ./validate) — this does not re-check or encode it. `amount` is major units
 * (euros, not cents) and is always rendered with a dot decimal separator and
 * exactly two fraction digits, per PayPal's own link format.
 */
export function buildPaypalMeLink(handle: string, amount: number, currency = "EUR"): string {
  return `https://paypal.me/${handle}/${amount.toFixed(2)}${currency}`;
}
