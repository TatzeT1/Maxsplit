const IBAN_FORMAT = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// PayPal.me handles are 1-20 characters, letters and digits only.
const PAYPAL_ME_HANDLE_FORMAT = /^[A-Za-z0-9]{1,20}$/;
// Matches a full PayPal.Me profile link a user would paste — with or
// without a scheme, "www.", or a trailing slash — capturing just the
// username. Case-insensitive on the domain only; the captured handle keeps
// whatever case the user typed, since PayPal.Me usernames are case-sensitive.
const PAYPAL_ME_URL_FORMAT = /^(?:https?:\/\/)?(?:www\.)?paypal\.me\/([A-Za-z0-9]{1,20})\/?$/i;

export function normalizeIban(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

/**
 * Format check plus the ISO 7064 mod-97-10 checksum every real IBAN
 * satisfies, so typos are caught here instead of surfacing as a failed
 * payment for whoever pastes it later.
 */
export function isValidIban(input: string): boolean {
  const iban = normalizeIban(input);
  if (!IBAN_FORMAT.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));

  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function isValidEmail(input: string): boolean {
  return EMAIL_FORMAT.test(input.trim());
}

export function isValidPaypalMeHandle(input: string): boolean {
  return PAYPAL_ME_HANDLE_FORMAT.test(input.trim());
}

/**
 * Pulls the username out of a full PayPal.Me link pasted by the user (e.g.
 * "https://www.paypal.me/MaximilianTietz448") so the app can keep working
 * with a bare handle internally (see buildPaypalMeLink). A bare handle
 * passes through unchanged. Anything that matches neither shape is returned
 * as-is, trimmed, so isValidPaypalMeHandle still rejects it with a clear
 * error rather than this function silently swallowing bad input — same
 * split as normalizeIban/isValidIban.
 */
export function normalizePaypalMeHandle(input: string): string {
  const trimmed = input.trim();
  const withoutQuery = trimmed.split(/[?#]/)[0];
  const match = withoutQuery.match(PAYPAL_ME_URL_FORMAT);
  return match ? match[1] : trimmed;
}
