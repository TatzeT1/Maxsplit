"use client";

import { useLocale, useT } from "@/components/locale-provider";
import { formatEstimateWithUnit } from "@/lib/games/estimate-input";
import { cn } from "@/lib/utils";
import type { EstimateCategory, EstimatePublicQuestion } from "@/lib/types";

/** The category chip: decoration only (the question text says everything). */
const CATEGORY_EMOJI: Record<EstimateCategory, string> = {
  geography: "🌍",
  nature: "🌿",
  animals: "🐾",
  body: "🫀",
  space: "🚀",
  science: "🔬",
  technology: "💻",
  history: "🏛️",
  culture: "🎭",
  food: "🍕",
  sport: "⚽",
  everyday: "🧺",
};

/**
 * The question of a stage, in the viewer's language: category chip, the text,
 * "Gesucht: Meter" / "Gesucht: eine Jahreszahl", the allowed range and — for a
 * Stechfrage — its badge. Everything on it comes from the PUBLIC question, so
 * it can never show a value, a source or a year of the answer.
 *
 * `compact` is the variant inside the keyboard frame (`EstimateGuessPanel`): no
 * chip and no range hint (the form prints the range itself), tighter spacing.
 * Pass `min-h-0 flex-1 overflow-y-auto` as `className` there so the question is
 * the part that scrolls, never the input or the lock button.
 */
export function EstimateQuestionCard({
  question,
  stageIndex,
  stageKind,
  compact = false,
  className,
}: {
  question: EstimatePublicQuestion;
  stageIndex: number;
  stageKind: "main" | "stechen";
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const stechen = stageKind === "stechen";
  const answer =
    question.format === "year"
      ? t("expenses.estimateAnswerYear")
      : t("expenses.estimateAnswerIn", { unit: question.unit[locale] });

  return (
    <div
      data-slot="estimate-question-card"
      className={cn(
        "bg-card ring-foreground/10 flex flex-col rounded-xl ring-1",
        compact ? "gap-1.5 px-3 py-2.5" : "gap-2 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {!compact && (
          <span
            aria-hidden="true"
            className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full text-base"
          >
            {CATEGORY_EMOJI[question.category]}
          </span>
        )}
        <span
          className={cn(
            "text-xs font-medium tracking-wide uppercase",
            stechen
              ? "bg-primary/10 text-primary rounded-full px-2 py-0.5"
              : "text-muted-foreground",
          )}
        >
          {stechen
            ? t("expenses.estimateStageStechen", { count: stageIndex })
            : t("expenses.estimateStageMain")}
        </span>
      </div>
      <p
        className={cn(
          "font-heading leading-snug font-medium text-balance",
          compact ? "text-base" : "text-xl",
        )}
      >
        {question.text[locale]}
      </p>
      <p className="text-muted-foreground text-sm">{answer}</p>
      {!compact && (
        <p className="text-muted-foreground tabular-money text-xs">
          {t("expenses.estimateRange", {
            min: formatEstimateWithUnit(question.bounds.minMilli, question, locale),
            max: formatEstimateWithUnit(question.bounds.maxMilli, question, locale),
          })}
        </p>
      )}
    </div>
  );
}
