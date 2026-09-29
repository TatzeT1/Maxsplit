import { describe, expect, it } from "vitest";
import { translate, type TranslationKey } from "@/lib/i18n/translate";
import { buildReminderMessage, whatsAppShareUrl } from "./reminder";

const t = (key: TranslationKey, vars?: Record<string, string | number>) =>
  translate("de", key, vars);

const base = {
  t,
  debtorName: "Lea",
  groupName: "WG Küche",
  amountMinor: 1250,
  currency: "EUR",
  groupUrl: "https://split.example/groups/g1",
};

describe("buildReminderMessage", () => {
  it("names the person, the group and the amount, written out", () => {
    const message = buildReminderMessage({ ...base, creditor: { displayName: "Max" } });
    expect(message.split("\n")[0]).toBe(
      "Hi Lea, kleine Erinnerung aus „WG Küche“: Du schuldest mir noch 12,50 €. 🙏",
    );
  });

  it("lists every way to pay the creditor has set up, then the group link", () => {
    const message = buildReminderMessage({
      ...base,
      creditor: {
        displayName: "Max",
        paypalMeHandle: "maxrobin",
        iban: "DE89370400440532013000",
        accountHolderName: "Max Tietz",
      },
    });
    expect(message.split("\n")).toEqual([
      expect.stringContaining("12,50"),
      "Per PayPal: https://paypal.me/maxrobin/12.50EUR",
      "Per Überweisung: DE89 3704 0044 0532 0130 00 (Max Tietz)",
      "Alle Details in Split: https://split.example/groups/g1",
    ]);
  });

  it("names the account by display name when no holder name is set", () => {
    const message = buildReminderMessage({
      ...base,
      creditor: { displayName: "Max", iban: "DE89370400440532013000" },
    });
    expect(message).toContain("(Max)");
    expect(message).not.toContain("PayPal");
  });

  it("leaves out the link while the origin isn't known yet", () => {
    const message = buildReminderMessage({
      ...base,
      groupUrl: null,
      creditor: { displayName: "Max" },
    });
    expect(message.split("\n")).toHaveLength(1);
  });
});

describe("whatsAppShareUrl", () => {
  it("encodes the whole message into wa.me's text parameter", () => {
    const url = whatsAppShareUrl("Hi Lea & Co\nZeile 2");
    expect(url).toBe("https://wa.me/?text=Hi%20Lea%20%26%20Co%0AZeile%202");
    expect(new URL(url).searchParams.get("text")).toBe("Hi Lea & Co\nZeile 2");
  });
});
