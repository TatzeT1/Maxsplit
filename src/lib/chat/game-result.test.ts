import { describe, expect, it } from "vitest";
import { gameResultMessage, gameResultSentence } from "@/lib/chat/game-result";
import { formatMoney } from "@/lib/format/money";
import { translate } from "@/lib/i18n/translate";
import type { ChatGameResult } from "@/lib/types";

const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) =>
  translate("de", key, vars);
const names: Record<string, string> = { lea: "Lea", ben: "Ben", max: "Max" };
const nameOf = (uid: string) => names[uid] ?? "?";
// Intl puts a no-break space before the €.
const euro36 = formatMoney(3600, "EUR");

const bill: ChatGameResult = {
  gameId: "wheel",
  loserUids: ["lea"],
  winnerUid: null,
  amount: { description: "Pizza", amountMinor: 3600, currency: "EUR" },
  attempt: 1,
  tournamentId: null,
};

describe("gameResultSentence", () => {
  it("says who pays what", () => {
    expect(gameResultSentence(t, bill, nameOf)).toBe(`Lea zahlt „Pizza“ (${euro36})`);
    expect(gameResultSentence(t, { ...bill, loserUids: ["lea", "ben"] }, nameOf)).toBe(
      `Lea und Ben zahlen „Pizza“ (${euro36})`,
    );
  });

  it("never hides a reshuffle", () => {
    expect(gameResultSentence(t, { ...bill, attempt: 3 }, nameOf)).toBe(
      `Lea zahlt „Pizza“ (${euro36}) — im 3. Versuch`,
    );
  });

  it("names winner and loser of a duel played for fun", () => {
    const duel = { ...bill, gameId: "rps" as const, amount: null, winnerUid: "ben" };
    expect(gameResultSentence(t, duel, nameOf)).toBe("Ben gewinnt gegen Lea");
    expect(
      gameResultSentence(t, { ...duel, loserUids: ["lea", "max"], winnerUid: null }, nameOf),
    ).toBe("Lea und Max verlieren");
  });
});

describe("gameResultMessage", () => {
  it("puts the game's emoji in front of the text and keeps the structure", () => {
    const message = gameResultMessage({ t, senderUid: "max", result: bill, nameOf, now: "x" });
    expect(message).toEqual({
      senderUid: "max",
      text: `🎡 Lea zahlt „Pizza“ (${euro36})`,
      createdAt: "x",
      gameResult: bill,
    });
  });
});
