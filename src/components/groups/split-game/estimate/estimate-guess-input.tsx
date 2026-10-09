"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocale, useT } from "@/components/locale-provider";
import { EstimateQuestionCard } from "@/components/groups/split-game/estimate/estimate-question-card";
import { estimateExampleNumber } from "@/components/groups/split-game/estimate/estimate-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ESTIMATE_INPUT_MAX_CHARS,
  checkEstimateGuess,
  estimateAmbiguousReading,
  estimateUnitText,
  formatEstimateEcho,
  formatEstimateWithUnit,
  parseEstimateInput,
  type EstimateGuessProblem,
  type EstimateParseError,
} from "@/lib/games/estimate-input";
import type { TranslationKey } from "@/lib/i18n/translate";
import { useVisibleHeight } from "@/lib/use-visible-height";
import type { EstimatePublicQuestion } from "@/lib/types";

/** A `format` / `too-many-decimals` complaint waits this long after the last keystroke (or a blur): "1,2" must not flash red at "1,". */
export const ESTIMATE_ERROR_DELAY_MS = 600;

/** The parse errors that are final the moment they appear (more typing cannot cure them). */
const IMMEDIATE_PARSE_ERRORS: ReadonlySet<EstimateParseError> = new Set([
  "chars",
  "negative",
  "too-long",
]);

const PARSE_ERROR_KEYS: Record<Exclude<EstimateParseError, "empty">, TranslationKey> = {
  chars: "expenses.estimateParseChars",
  negative: "expenses.estimateParseNegative",
  format: "expenses.estimateParseFormat",
  "too-many-decimals": "expenses.estimateParseDecimals",
  "too-long": "expenses.estimateParseTooLong",
};

const PROBLEM_KEYS: Record<EstimateGuessProblem, TranslationKey> = {
  invalid: "expenses.estimateParseTooLong",
  zero: "expenses.estimateGuessZero",
  "not-whole": "expenses.estimateGuessNotWhole",
  "below-min": "expenses.estimateGuessBelowMin",
  "above-max": "expenses.estimateGuessAboveMax",
};

/**
 * The WHOLE keyboard frame of a guess screen (spec G.4): the compact question
 * card, the number field with its echo line, the ambiguous-reading line, the
 * range hint and the lock button, inside ONE wrapper capped with `maxHeight`
 * from `useVisibleHeight` — never `height` (without a keyboard the frame keeps
 * its natural size; with one it is capped at the visible band). The question
 * card is the part that scrolls; the field and the lock button are `shrink-0`,
 * so the button is always above the keyboard. An iPhone number pad has no Return
 * key: the lock button is the only way to lock there.
 *
 * Put seats, countdown and everything else AFTER the frame, never inside it, and
 * give the panel `key={`${roundId}:${stageIndex}:${uid}`}` so no state survives
 * into the next seat. No autofocus (a shared phone must not pop the keyboard on
 * hand-over); the field is the shared 16 px `Input`, and no bottom padding is
 * added anywhere (AGENTS.md, iOS rule 2).
 *
 * Locking calls `onLock(milli)` and then clears the field and blurs it, so a
 * guess never survives on screen or in the browser's form history.
 *
 * `keepOnError` is for an online lock, which is one's OWN phone and can fail
 * (no signal, a closed stage): the typed value then stays in the field, so a
 * retry is one tap rather than retyping. The parent unmounts the panel when the
 * lock succeeded (the guess is then on the server, not on screen); the field is
 * still blurred. One phone passes nothing: the next player must not see it.
 */
export function EstimateGuessPanel({
  question,
  stageIndex,
  stageKind,
  heading,
  busy = false,
  disabledReason = null,
  error = null,
  keepOnError = false,
  onLock,
}: {
  question: EstimatePublicQuestion;
  stageIndex: number;
  stageKind: "main" | "stechen";
  /** "Dein Tipp" | "Lea tippt". */
  heading: string;
  busy?: boolean;
  /** Why locking is not possible right now (e.g. offline); shown as a visible line and disables the button. */
  disabledReason?: string | null;
  /** The parent's own failure (a rejected action), shown as an alert under the button. */
  error?: string | null;
  /** Keep the typed value after `onLock`, so a failed online lock needs no retyping; the parent unmounts the panel on success. */
  keepOnError?: boolean;
  onLock: (milli: number) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const id = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set while the lock itself blurs the field, so that blur does not announce (or keep) the value just locked. */
  const lockingRef = useRef(false);
  const visible = useVisibleHeight(frameRef);

  const [text, setText] = useState("");
  /** The delayed errors may show: 600 ms after the last keystroke, or on blur / a lock attempt. */
  const [settled, setSettled] = useState(false);
  /** The echo, announced once on blur or a failed lock attempt (never per keystroke). */
  const [announcedEcho, setAnnouncedEcho] = useState("");

  useEffect(() => {
    if (text === "" || settled) return;
    const timer = setTimeout(() => setSettled(true), ESTIMATE_ERROR_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, settled]);

  const parsed = parseEstimateInput(text, locale);
  const problem = parsed.ok ? checkEstimateGuess(parsed.milli, question) : null;
  const valid = parsed.ok && problem === null;

  let errorText: string | null = null;
  if (!parsed.ok) {
    if (parsed.error !== "empty" && (IMMEDIATE_PARSE_ERRORS.has(parsed.error) || settled)) {
      errorText = t(PARSE_ERROR_KEYS[parsed.error], { example: estimateExampleNumber(locale) });
    }
  } else if (problem !== null && settled) {
    errorText = t(PROBLEM_KEYS[problem], {
      min: formatEstimateWithUnit(question.bounds.minMilli, question, locale),
      max: formatEstimateWithUnit(question.bounds.maxMilli, question, locale),
    });
  }

  // The echo is mandatory before the lock: exactly what the parser read, in the locale's own marks.
  const echo =
    parsed.ok && (problem === null || !settled)
      ? formatEstimateEcho(parsed.milli, question, locale)
      : null;
  const ambiguous = parsed.ok ? estimateAmbiguousReading(text, locale) : null;
  const unitText = estimateUnitText(question, locale);
  const unitAria = question.format === "year" ? null : question.unit[locale];
  const ariaLabel =
    unitAria === null
      ? t("expenses.estimateGuessAriaYear", { heading })
      : t("expenses.estimateGuessAria", { heading, unit: unitAria });
  const rangeText = t("expenses.estimateRange", {
    min: formatEstimateWithUnit(question.bounds.minMilli, question, locale),
    max: formatEstimateWithUnit(question.bounds.maxMilli, question, locale),
  });
  const describedBy = [`${id}-echo`, ambiguous ? `${id}-ambiguous` : null, `${id}-range`]
    .filter(Boolean)
    .join(" ");

  function handleChange(value: string) {
    setText(value);
    setSettled(false);
    setAnnouncedEcho("");
  }

  function handleBlur() {
    if (lockingRef.current || text === "") return;
    setSettled(true);
    setAnnouncedEcho(echo ?? "");
  }

  function handleLock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabledReason) return;
    if (!parsed.ok || problem !== null) {
      // A lock attempt on something that is not a guess: show why, and say so once.
      setSettled(true);
      setAnnouncedEcho(echo ?? "");
      return;
    }
    onLock(parsed.milli);
    if (!keepOnError) {
      // Shared-phone privacy: no value outlives the lock, on screen or in the field.
      setText("");
      setSettled(false);
      setAnnouncedEcho("");
    }
    lockingRef.current = true;
    inputRef.current?.blur();
    lockingRef.current = false;
  }

  return (
    <div
      ref={frameRef}
      data-slot="estimate-guess-frame"
      style={{ maxHeight: visible ?? undefined }}
      className="flex min-h-0 flex-col gap-3"
    >
      <EstimateQuestionCard
        compact
        question={question}
        stageIndex={stageIndex}
        stageKind={stageKind}
        className="min-h-0 flex-1 overflow-y-auto"
      />
      <form onSubmit={handleLock} className="flex shrink-0 flex-col gap-2" noValidate>
        <Label htmlFor={id}>{heading}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            ref={inputRef}
            type="text"
            inputMode={question.format === "year" ? "numeric" : "decimal"}
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={ESTIMATE_INPUT_MAX_CHARS}
            placeholder={t("expenses.estimateGuessPlaceholder")}
            value={text}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={handleBlur}
            aria-invalid={errorText !== null}
            aria-label={ariaLabel}
            aria-describedby={describedBy}
            className="h-12 flex-1 text-base md:text-sm"
          />
          {unitText && (
            <span aria-hidden="true" className="text-muted-foreground shrink-0 text-sm">
              {unitText}
            </span>
          )}
        </div>
        <p
          id={`${id}-echo`}
          aria-live="off"
          className={cn(
            "tabular-money min-h-6 text-base font-medium",
            errorText && "text-destructive",
          )}
        >
          {errorText ?? echo ?? ""}
        </p>
        {ambiguous && (
          <p id={`${id}-ambiguous`} className="text-muted-foreground text-xs">
            {t("expenses.estimateEchoAmbiguous", {
              value: formatEstimateWithUnit(ambiguous.value, question, locale),
              alt: formatEstimateWithUnit(ambiguous.alt, question, locale),
              altInput: ambiguous.altInput,
            })}
          </p>
        )}
        <p id={`${id}-range`} className="text-muted-foreground text-xs">
          {rangeText}
        </p>
        {/* Announced once: a new error after the debounce, the echo on blur. Never a value but the player's own typing. */}
        <p role="alert" className="sr-only">
          {settled && errorText ? errorText : ""}
        </p>
        <p role="status" className="sr-only">
          {announcedEcho}
        </p>
        <Button type="submit" size="lg" disabled={!valid || busy || !!disabledReason}>
          {t("expenses.estimateLock")}
        </Button>
        <p className="text-muted-foreground text-xs">{t("expenses.estimateLockHint")}</p>
        {disabledReason && (
          <p role="status" className="text-destructive text-sm">
            {disabledReason}
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
