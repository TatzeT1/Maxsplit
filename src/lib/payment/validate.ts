const IBAN_FORMAT = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
