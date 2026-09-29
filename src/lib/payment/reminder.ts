import { formatMoney, minorToMajor } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import { buildPaypalMeLink } from "@/lib/payment/paypal-me";
import { formatIban } from "@/lib/payment/validate";
import type { GroupMember } from "@/lib/types";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * The text of a "you still owe me" reminder, as the creditor sends it by
 * WhatsApp: who, which group, how much — then every way to pay that the
 * creditor has set up, and a link back into the group.
 *
 * The amount is always written out, never left to the PayPal.Me link: PayPal
 * drops a link's pre-filled amount when its native app takes over, including
 * from an installed iOS PWA (the reason an earlier "pay with the amount
 * filled in" attempt was reverted), so the link is only ever a shortcut.
 */
export function buildReminderMessage(input: {
  t: Translate;
  debtorName: string;
  groupName: string;
  amountMinor: number;
  currency: string;
  creditor: Pick<GroupMember, "displayName" | "paypalMeHandle" | "iban" | "accountHolderName">;
  /** The group page, or null before the client knows its own origin. */
  groupUrl: string | null;
}): string {
  const { t, creditor } = input;
  const lines = [
    t("balances.remindText", {
      name: input.debtorName,
      group: input.groupName,
      amount: formatMoney(input.amountMinor, input.currency),
    }),
  ];
  if (creditor.paypalMeHandle) {
    const amount = minorToMajor(input.amountMinor, input.currency);
    lines.push(
      t("balances.remindPaypal", {
        link: buildPaypalMeLink(creditor.paypalMeHandle, amount, input.currency),
      }),
    );
  }
  if (creditor.iban) {
    lines.push(
      t("balances.remindIban", {
        iban: formatIban(creditor.iban),
        holder: creditor.accountHolderName || creditor.displayName,
      }),
    );
  }
  if (input.groupUrl) lines.push(t("balances.remindAppLink", { url: input.groupUrl }));
  return lines.join("\n");
}

/** A WhatsApp link that opens the share picker with `message` typed in (no number: they pick the chat). */
export function whatsAppShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
