import { formatMoney } from "@/lib/format/money";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import type { TranslationKey } from "@/lib/i18n/translate";
import type { ChatGameResult, ChatMessage } from "@/lib/types";

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

/**
 * A decided game in one sentence — "Lea zahlt „Pizza“ (36,00 €)", "Lea
 * gewinnt gegen Ben", "… — im 2. Versuch". The chat card renders it with
 * the group's current names; the stored message text is the same sentence
 * behind the game's emoji, for previews that only show text.
 */
export function gameResultSentence(
  t: Translate,
  result: ChatGameResult,
  nameOf: (uid: string) => string,
): string {
  const one = result.loserUids.length === 1;
  const losers = listFormatter.format(result.loserUids.map(nameOf));
  const sentence = result.amount
    ? t(one ? "chat.gameResultPaysOne" : "chat.gameResultPaysMany", {
        names: losers,
        description: result.amount.description,
        amount: formatMoney(result.amount.amountMinor, result.amount.currency),
      })
    : one && result.winnerUid
      ? t("chat.gameResultWins", { winner: nameOf(result.winnerUid), loser: losers })
      : t(one ? "chat.gameResultLosesOne" : "chat.gameResultLosesMany", { names: losers });
  return result.attempt > 1
    ? t("chat.gameResultAttempt", { text: sentence, count: result.attempt })
    : sentence;
}

/** The automatic chat message for a decided game — written by the server in the same write as the result. */
export function gameResultMessage(input: {
  t: Translate;
  senderUid: string;
  result: ChatGameResult;
  nameOf: (uid: string) => string;
  now: string;
}): Omit<ChatMessage, "id"> {
  const { t, senderUid, result, nameOf, now } = input;
  return {
    senderUid,
    text: `${SPLIT_GAME_META[result.gameId].emoji} ${gameResultSentence(t, result, nameOf)}`,
    createdAt: now,
    gameResult: result,
  };
}
