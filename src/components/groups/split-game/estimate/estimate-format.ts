import type { EstimateErrorText } from "@/lib/games/estimate-input";
import type { TranslationKey } from "@/lib/i18n/translate";

/**
 * Text helpers shared by the estimate components (reveal, audit, chat card).
 * Pure: `estimate-input.ts` returns the error text STRUCTURED (no i18n there),
 * this file maps it to the dictionary. No clock, no randomness, no React.
 */

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** "Faktor 2,5 zu niedrig", "17 m zu hoch", "6 Jahre zu niedrig", "Genau richtig!". */
export function estimateErrorLabel(t: Translate, text: EstimateErrorText): string {
  switch (text.kind) {
    case "exact":
      return t("expenses.estimateErrExact");
    case "factor":
      return t(
        text.direction === "high"
          ? "expenses.estimateErrFactorHigh"
          : "expenses.estimateErrFactorLow",
        { factor: text.factor },
      );
    case "percent":
      return t(
        text.direction === "high"
          ? "expenses.estimateErrPercentHigh"
          : "expenses.estimateErrPercentLow",
        { percent: text.percent },
      );
    case "interval": {
      // A year row's amount is a bare number ("6"): the unit word comes from the dictionary.
      const amount = text.isYear
        ? text.amount === "1"
          ? t("expenses.estimateYearsOne")
          : t("expenses.estimateYearsMany", { count: text.amount })
        : text.amount;
      return t(
        text.direction === "high"
          ? "expenses.estimateErrIntervalHigh"
          : "expenses.estimateErrIntervalLow",
        { amount },
      );
    }
    case "fraction": {
      // Last resort when decimals cannot tell two errors apart: the exact factor as a fraction.
      const factor = `${text.hi}/${text.lo}`;
      return t(
        text.direction === "high"
          ? "expenses.estimateErrFactorHigh"
          : "expenses.estimateErrFactorLow",
        { factor },
      );
    }
  }
}

/** "12 s" below a minute, "2:05" from a minute on: a duration without words, so it needs no key. */
export function formatAnswerTime(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The example a malformed number is shown ("Beispiel: 1.234,5"): the locale's own marks. */
export function estimateExampleNumber(locale: "de" | "en"): string {
  return locale === "de" ? "1.234,5" : "1,234.5";
}
