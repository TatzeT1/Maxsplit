/**
 * The currencies a group can keep its books in. The currency picker in the
 * create/edit group dialogs and the server's check in createGroup/updateGroup
 * both read this one list, so the UI can't offer a code the server rejects —
 * or the server accept one `Intl.NumberFormat` throws on, which used to be
 * able to crash the group page for every member.
 */
export const SUPPORTED_CURRENCIES = ["EUR", "USD", "CHF", "GBP"] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
