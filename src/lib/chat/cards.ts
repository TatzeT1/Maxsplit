import { formatMoney } from "@/lib/format/money";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { ChatExpenseCard, ChatMessage, ChatSettlementCard, Expense } from "@/lib/types";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** Keeps the entries that are more than zero — a member who laid out or owes nothing isn't on the card. */
function positive(amounts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(amounts).filter(([, minor]) => minor > 0));
}

/**
 * The automatic chat message for a newly entered expense — written by the
 * server in the same write as the expense, and silent: no chat push of its own
 * (the expense push already reaches everyone it touches).
 */
export function expenseCardMessage(input: {
  t: Translate;
  senderUid: string;
  expenseId: string;
  expense: Pick<Expense, "description" | "amountMinor" | "currency" | "paidBy" | "splits">;
  nameOf: (uid: string) => string;
  now: string;
}): Omit<ChatMessage, "id"> {
  const { t, senderUid, expenseId, expense, nameOf, now } = input;
  const expenseCard: ChatExpenseCard = {
    expenseId,
    description: expense.description,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    paidBy: positive(expense.paidBy),
    shares: positive(
      Object.fromEntries(
        Object.entries(expense.splits).map(([uid, split]) => [uid, split.amountMinor]),
      ),
    ),
  };
  return {
    senderUid,
    text: t("chat.expenseCardText", {
      name: nameOf(senderUid),
      description: expense.description,
      amount: formatMoney(expense.amountMinor, expense.currency),
    }),
    createdAt: now,
    expenseCard,
  };
}

/** The automatic, silent chat message for a recorded payment — see `expenseCardMessage`. */
export function settlementCardMessage(input: {
  t: Translate;
  senderUid: string;
  settlementId: string;
  settlement: Pick<ChatSettlementCard, "fromUid" | "toUid" | "amountMinor" | "currency">;
  nameOf: (uid: string) => string;
  now: string;
}): Omit<ChatMessage, "id"> {
  const { t, senderUid, settlementId, settlement, nameOf, now } = input;
  return {
    senderUid,
    text: t("chat.settlementCardText", {
      from: nameOf(settlement.fromUid),
      to: nameOf(settlement.toUid),
      amount: formatMoney(settlement.amountMinor, settlement.currency),
    }),
    createdAt: now,
    settlementCard: {
      settlementId,
      fromUid: settlement.fromUid,
      toUid: settlement.toUid,
      amountMinor: settlement.amountMinor,
      currency: settlement.currency,
    },
  };
}

/**
 * Whether a message is a bookkeeping card that never pings anyone — it doesn't
 * light the unread dot (the expense feed and the push already say it).
 */
export function isSilentCard(
  message: Pick<ChatMessage, "expenseCard" | "settlementCard">,
): boolean {
  return message.expenseCard !== undefined || message.settlementCard !== undefined;
}
