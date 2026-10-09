"use client";

import { useLocale, useT } from "@/components/locale-provider";
import { estimateErrorLabel } from "@/components/groups/split-game/estimate/estimate-format";
import { describeEstimateDistances, formatEstimateWithUnit } from "@/lib/games/estimate-input";
import type { EstimateChatSummary } from "@/lib/types";

/**
 * What a decided estimate round adds under its chat card: per question that
 * produced a payer, "„Wie hoch ist die Zugspitze?“ — richtig: 2.962 m", then one
 * line per payer — "Lea: 1.200 m (Faktor 2,5 zu niedrig)", "Ben: kein Tipp",
 * "Tom: per Los bestimmt". Names are the summary's snapshots, so a claimed
 * placeholder or a departed member never renders as "?". The card's stored text
 * stays the one-sentence result (previews); this is only the detail below it.
 *
 * The summary holds the payers only, so a line never names the nearest player who
 * did not pay.
 */
export function EstimateChatLines({ summary }: { summary: EstimateChatSummary }) {
  const t = useT();
  const { locale } = useLocale();

  return (
    <div data-slot="estimate-chat-lines" className="flex flex-col gap-2 text-xs">
      {summary.lines.map((line, index) => {
        const texts = describeEstimateDistances(
          line.payers.map((payer) => ({ uid: payer.uid, distance: payer.distance })),
          line,
          locale,
        );
        return (
          <div key={index} className="flex flex-col gap-0.5">
            <p className="text-foreground font-medium">
              {t("chat.estimateResultTruth", {
                question: line.text[locale],
                truth: formatEstimateWithUnit(line.truthMilli, line, locale),
              })}
            </p>
            <ul className="text-muted-foreground flex flex-col gap-0.5">
              {line.payers.map((payer) => {
                const text = texts[payer.uid] ?? null;
                const sentence = payer.byLot
                  ? t("chat.estimateResultLot", { name: payer.name })
                  : payer.guessMilli === null || text === null
                    ? t("chat.estimateResultNoGuess", { name: payer.name })
                    : t("chat.estimateResultGuess", {
                        name: payer.name,
                        guess: formatEstimateWithUnit(payer.guessMilli, line, locale),
                        error: estimateErrorLabel(t, text),
                      });
                return (
                  <li key={payer.uid} className="tabular-money">
                    {sentence}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
