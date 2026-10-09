"use client";

import { Check, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useLocale, useT } from "@/components/locale-provider";
import {
  estimateErrorLabel,
  type Translate,
} from "@/components/groups/split-game/estimate/estimate-format";
import { formatMoney } from "@/lib/format/money";
import { compareEstimateAuditToExpense, verifyEstimateAudit } from "@/lib/games/estimate-audit";
import {
  describeEstimateDistances,
  formatEstimateWithUnit,
  type EstimateLocale,
} from "@/lib/games/estimate-input";
import { classifyEstimate, lotPicks } from "@/lib/games/estimate-rules";
import { cn } from "@/lib/utils";
import type { EstimateAudit, EstimateAuditStage, EstimatePrecedes, Expense } from "@/lib/types";

type Fate = "pays" | "safe" | "contested";

interface AuditRow {
  uid: string;
  guess: number | null;
  errorText: string | null;
  fate: Fate;
}

interface AuditStageView {
  stage: EstimateAuditStage;
  /** `null` when the stage cannot be replayed (a tampered or impossible audit): the table says so instead of guessing. */
  rows: AuditRow[] | null;
  lotUids: string[];
}

function nameOf(audit: EstimateAudit, uid: string): string {
  return Object.hasOwn(audit.names, uid) ? audit.names[uid].name : "?";
}

/** Only ever link http(s): the URL comes from a stored document, and a `javascript:` link would run in the app's origin. */
function safeHref(url: string): string | null {
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Re-runs the classifier stage by stage, carrying `precedes` forward exactly like
 * the server does, so each fate in the table is RECOMPUTED from the guesses, not
 * read from a stored verdict.
 */
function replayStages(
  audit: EstimateAudit,
  t: Translate,
  locale: EstimateLocale,
): AuditStageView[] {
  const views: AuditStageView[] = [];
  let precedes: readonly EstimatePrecedes[] = [];
  let broken = false;
  audit.stages.forEach((stage, index) => {
    if (broken) {
      views.push({ stage, rows: null, lotUids: [] });
      return;
    }
    try {
      const contenders = Object.keys(stage.guessesMilli);
      const classification = classifyEstimate({
        scale: stage.scale,
        truth: stage.truthMilli,
        tolerance: stage.tolerance,
        entries: contenders.map((uid) => ({ uid, guess: stage.guessesMilli[uid] })),
        payerCount: stage.slots,
        precedes,
      });
      const isLast = index === audit.stages.length - 1;
      const lotUids =
        isLast && audit.shuffled !== null && classification.contested.length > 0
          ? lotPicks(audit.shuffled, classification.precedes, classification.slots)
          : [];
      const texts = describeEstimateDistances(
        classification.ranked.map((row) => ({ uid: row.uid, distance: row.distance })),
        stage,
        locale,
      );
      const payers = new Set(classification.payers);
      const safe = new Set(classification.safe);
      const lot = new Set(lotUids);
      views.push({
        stage,
        lotUids,
        rows: classification.ranked.map((row) => {
          const text = texts[row.uid];
          let fate: Fate = "contested";
          if (payers.has(row.uid) || lot.has(row.uid)) fate = "pays";
          else if (safe.has(row.uid) || (lotUids.length > 0 && !lot.has(row.uid))) fate = "safe";
          return {
            uid: row.uid,
            guess: row.guess,
            errorText: text ? estimateErrorLabel(t, text) : null,
            fate,
          };
        }),
      });
      precedes = classification.precedes;
    } catch {
      broken = true;
      views.push({ stage, rows: null, lotUids: [] });
    }
  });
  return views;
}

/**
 * "Protokoll anzeigen": the record of a finished estimate round on its expense,
 * as a `<details>` disclosure. Per stage the question, the truth with its source,
 * year and definition, and a table of who guessed what, how far off and what that
 * meant — recomputed from the stored guesses by the same classifier the server
 * used — and a check line that says in words whether the replay and the live
 * expense agree.
 *
 * The check proves the ARITHMETIC (these guesses and truths produce these
 * payers; the bill is split equally between them), never that a one-phone table
 * guessed honestly — so the wording never says "verified", and a local round
 * names whoever typed the guesses.
 *
 * This is the ONLY component allowed to import `estimate-rules` / `estimate-audit`
 * (ESLint, D.7): it is loaded with `next/dynamic` from `game-record.tsx`, so the
 * group page's chunk never contains the classifier.
 */
export function EstimateAuditTable({
  audit,
  expense,
  roundHref,
}: {
  audit: EstimateAudit;
  expense?: Pick<Expense, "amountMinor" | "currency" | "splits">;
  roundHref?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const stages = replayStages(audit, t, locale);

  // The check: the replay matches the booking, and the live expense still matches both.
  const replayOk = verifyEstimateAudit(audit);
  const comparison = expense ? compareEstimateAuditToExpense(audit, expense) : null;
  let check: { tone: "ok" | "bad" | "note"; text: string };
  if (!replayOk || (comparison && !comparison.payers)) {
    check = { tone: "bad", text: t("expenses.estimateAuditMismatch") };
  } else if (comparison && !comparison.equalSplit) {
    check = { tone: "bad", text: t("expenses.estimateAuditAmountsChanged") };
  } else if (comparison && expense && comparison.amountChanged) {
    check = {
      tone: "note",
      text: t("expenses.estimateAuditAmountEdited", {
        from: formatMoney(audit.booked.amountMinor, audit.booked.currency),
        to: formatMoney(expense.amountMinor, expense.currency),
      }),
    };
  } else {
    check = { tone: "ok", text: t("expenses.estimateAuditChecked") };
  }

  const typist = nameOf(audit, audit.createdBy);

  return (
    <details data-slot="estimate-audit" className="bg-muted/60 group rounded-xl px-3 py-2 text-sm">
      <summary className="cursor-pointer py-1 text-sm font-medium select-none">
        {t("expenses.estimateAuditShow")}
      </summary>
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h4 className="font-heading text-base font-medium">{t("expenses.estimateAuditTitle")}</h4>
          {audit.mode === "local" && (
            <p className="text-muted-foreground text-xs">
              {t("expenses.estimateAuditEnteredBy", { name: typist })}
            </p>
          )}
        </div>

        {stages.map(({ stage, rows, lotUids }, index) => {
          const href = safeHref(stage.sourceUrl);
          return (
            <section key={index} data-slot="estimate-audit-stage" className="flex flex-col gap-2">
              <p className="font-medium">{stage.text[locale]}</p>
              <p className="tabular-money">
                {t("expenses.estimateTruthLabel")}{" "}
                <span className="font-semibold">
                  {formatEstimateWithUnit(stage.truthMilli, stage, locale)}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {t("expenses.estimateAuditSources")}:{" "}
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-2"
                  >
                    {stage.sourceLabel}
                  </a>
                ) : (
                  stage.sourceLabel
                )}{" "}
                · {stage.asOf}
              </p>
              <p className="text-muted-foreground text-xs">
                {t("expenses.estimateAuditDefinition")}: <span lang="en">{stage.definition}</span>
              </p>
              {rows ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th scope="col" className="py-1 pr-2 font-medium">
                          {t("expenses.estimateAuditColPlayer")}
                        </th>
                        <th scope="col" className="py-1 pr-2 font-medium">
                          {t("expenses.estimateAuditColGuess")}
                        </th>
                        <th scope="col" className="py-1 pr-2 font-medium">
                          {t("expenses.estimateAuditColError")}
                        </th>
                        <th scope="col" className="py-1 font-medium">
                          {t("expenses.estimateAuditColResult")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const typedBy = Object.hasOwn(stage.enteredBy, row.uid)
                          ? nameOf(audit, stage.enteredBy[row.uid])
                          : null;
                        return (
                          <tr key={row.uid} className="border-foreground/10 border-t align-top">
                            <td className="py-1 pr-2">
                              {nameOf(audit, row.uid)}
                              {typedBy && (
                                <span className="text-muted-foreground block text-[10px]">
                                  {t("expenses.estimateEnteredBy", { name: typedBy })}
                                </span>
                              )}
                            </td>
                            <td className="tabular-money py-1 pr-2">
                              {row.guess === null
                                ? t("expenses.estimateNoGuess")
                                : formatEstimateWithUnit(row.guess, stage, locale)}
                            </td>
                            <td className="py-1 pr-2">{row.errorText ?? "—"}</td>
                            <td
                              className={cn(
                                "py-1 font-medium",
                                row.fate === "pays" && "text-destructive",
                              )}
                            >
                              {row.fate === "pays"
                                ? t("expenses.estimatePays")
                                : row.fate === "safe"
                                  ? t("expenses.estimateSafe")
                                  : t("expenses.estimateContested")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-destructive text-xs">{t("expenses.estimateAuditMismatch")}</p>
              )}
              {lotUids.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  {t("expenses.estimateAuditLot", {
                    names: lotUids.map((uid) => nameOf(audit, uid)).join(", "),
                  })}
                </p>
              )}
            </section>
          );
        })}

        <p
          data-slot="estimate-audit-check"
          data-check={check.tone}
          className={cn(
            "flex items-start gap-1.5 text-xs font-medium",
            check.tone === "bad" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {check.tone === "bad" ? (
            <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          ) : (
            <Check aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          )}
          <span>{check.text}</span>
        </p>
        {roundHref && (
          <Link
            href={roundHref}
            className="text-primary text-xs font-medium underline-offset-2 hover:underline"
          >
            {t("expenses.estimateAuditOpenRound")}
          </Link>
        )}
      </div>
    </details>
  );
}
