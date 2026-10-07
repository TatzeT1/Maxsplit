import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translate";
import { expenseCardMessage, isSilentCard, settlementCardMessage } from "./cards";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate("de", key, vars).replace(/ /g, " ");
const nameOf = (uid: string) => ({ max: "Max", lea: "Lea", ben: "Ben" })[uid] ?? "?";

describe("expenseCardMessage", () => {
  const message = expenseCardMessage({
    t,
    senderUid: "max",
    expenseId: "e1",
    expense: {
      description: "Pizza",
      amountMinor: 3600,
      currency: "EUR",
      paidBy: { lea: 3600, ben: 0 },
      splits: {
        max: { rawValue: 1200, amountMinor: 1200 },
        lea: { rawValue: 1200, amountMinor: 1200 },
        ben: { rawValue: 1200, amountMinor: 1200 },
      },
    },
    nameOf,
    now: "2026-10-07T10:00:00.000Z",
  });

  it("carries the figures the card shows, without the zero entries", () => {
    expect(message.expenseCard).toEqual({
      expenseId: "e1",
      description: "Pizza",
      amountMinor: 3600,
      currency: "EUR",
      paidBy: { lea: 3600 },
      shares: { max: 1200, lea: 1200, ben: 1200 },
    });
  });

  it("keeps a plain sentence as the text, for previews", () => {
    expect(message.text).toBe("Max hat „Pizza“ (36,00 €) eingetragen");
    expect(message.senderUid).toBe("max");
  });
});

describe("settlementCardMessage", () => {
  const message = settlementCardMessage({
    t,
    senderUid: "max",
    settlementId: "s1",
    settlement: { fromUid: "lea", toUid: "ben", amountMinor: 5250, currency: "EUR" },
    nameOf,
    now: "2026-10-07T10:00:00.000Z",
  });

  it("names who paid whom", () => {
    expect(message.text).toBe("Lea hat Ben 52,50 € gezahlt");
    expect(message.settlementCard).toEqual({
      settlementId: "s1",
      fromUid: "lea",
      toUid: "ben",
      amountMinor: 5250,
      currency: "EUR",
    });
  });
});

describe("isSilentCard", () => {
  it("is true for bookkeeping cards only", () => {
    expect(isSilentCard({ expenseCard: undefined, settlementCard: undefined })).toBe(false);
    expect(
      isSilentCard(
        settlementCardMessage({
          t,
          senderUid: "max",
          settlementId: "s1",
          settlement: { fromUid: "lea", toUid: "ben", amountMinor: 1, currency: "EUR" },
          nameOf,
          now: "x",
        }),
      ),
    ).toBe(true);
  });
});
