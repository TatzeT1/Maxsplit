"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { useReceiptScanEnabled } from "@/components/groups/receipt-scan-context";
import { SectionHeading } from "@/components/groups/section-heading";
import { useLocale, useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { classifyGroupExpenses } from "@/lib/actions/products";
import { callAction } from "@/lib/call-action";
import { formatMoney } from "@/lib/format/money";
import {
  needsProductClass,
  productFamilyEmoji,
  productFamilyLabelKey,
} from "@/lib/products/products";
import { computeProductTotals, shiftPeriod, type Period, type Total } from "@/lib/products/totals";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { Expense, Group, ProductFamilyId } from "@/lib/types";

type PeriodKind = Period["kind"];

/** Steps of "Jetzt einordnen" per tap: a long history in a few round trips, never an endless loop. */
const MAX_CLASSIFY_STEPS = 8;

function currentPeriod(kind: PeriodKind): Period {
  const now = new Date();
  if (kind === "all") return { kind: "all" };
  if (kind === "year") return { kind: "year", year: now.getFullYear() };
  return { kind: "month", year: now.getFullYear(), month: now.getMonth() + 1 };
}

function usePeriodLabel(period: Period): string {
  const { locale } = useLocale();
  const t = useT();
  if (period.kind === "all") return t("insights.allTime");
  if (period.kind === "year") return String(period.year);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    new Date(period.year, period.month - 1, 1),
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="bg-muted/80 ring-foreground/5 flex w-full gap-0.5 rounded-xl p-1 ring-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "focus-visible:ring-ring/50 min-h-9 flex-1 touch-manipulation rounded-lg px-2 text-[13px] font-medium transition-[color,background-color,box-shadow] duration-(--duration-fast) outline-none focus-visible:ring-3",
            option.value === value
              ? "bg-card text-foreground shadow-e1"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * 📊 Auswertung: what the group spent on what — "Fleisch & Wurst 61,20 €,
 * of it Mett 38,40 €" — in a month, a year or overall, for the whole group
 * or for one person's share. Receipts count by their lines (each line's
 * part of the booked amount, tip and discount spread), every other expense
 * by its own class. What nobody has classified yet is a visible row with
 * the button that fixes it, never silently left out of the total.
 */
export function InsightsTab({
  groupId,
  expenses,
  group,
  currentUid,
}: {
  groupId: string;
  expenses: Expense[];
  group: Group;
  currentUid: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const online = useOnline();
  const aiEnabled = useReceiptScanEnabled();
  const [period, setPeriod] = useState<Period>(() => currentPeriod("month"));
  const [viewUid, setViewUid] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<ProductFamilyId>>(new Set());
  const [classifying, setClassifying] = useState(false);
  const [classifyMessage, setClassifyMessage] = useState<string | null>(null);
  const periodLabel = usePeriodLabel(period);

  const totals = useMemo(
    () => computeProductTotals(expenses, period, viewUid),
    [expenses, period, viewUid],
  );
  const waiting = useMemo(() => expenses.filter(needsProductClass).length, [expenses]);
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  const nameOf = (uid: string) => group.members[uid]?.displayName ?? "?";
  const share = (amountMinor: number) =>
    totals.amountMinor > 0 ? amountMinor / totals.amountMinor : 0;
  const shareLabel = (amountMinor: number) => {
    const value = share(amountMinor);
    return value > 0 && value < 0.01 ? "<1 %" : percent.format(value);
  };

  const viewMembers = Object.entries(group.members)
    .filter(([uid]) => uid !== currentUid)
    .sort(([, a], [, b]) => a.displayName.localeCompare(b.displayName, locale));

  function toggle(family: ProductFamilyId) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  async function classify() {
    setClassifying(true);
    setClassifyMessage(null);
    let message = t("insights.classifyStuck");
    for (let step = 0; step < MAX_CLASSIFY_STEPS; step++) {
      const result = await callAction(() => classifyGroupExpenses({ groupId }));
      if (!result.ok) {
        message =
          result.error === "classify-limit"
            ? t("insights.classifyLimit")
            : result.error === "ai-limit"
              ? t("insights.classifyAiLimit")
              : result.error === "scan-unavailable"
                ? t("insights.classifyUnavailable")
                : result.error === "network"
                  ? t("errors.network")
                  : t("common.somethingWentWrong");
        break;
      }
      if (result.data.remaining === 0) {
        message = t("insights.classifyDone");
        break;
      }
      // Nothing moved: the model is down or can't make sense of what is left.
      if (result.data.classified === 0) break;
      message = "";
    }
    setClassifying(false);
    setClassifyMessage(message || null);
  }

  const entriesLabel = (count: number) =>
    count === 1 ? t("insights.entriesOne") : t("insights.entries", { count });
  const totalLabel =
    viewUid === null
      ? t("insights.totalGroup")
      : viewUid === currentUid
        ? t("insights.totalMine")
        : t("insights.totalOf", { name: nameOf(viewUid) });
  const emptyLabel =
    viewUid === null
      ? t("insights.empty")
      : viewUid === currentUid
        ? t("insights.emptyMine")
        : t("insights.emptyOf", { name: nameOf(viewUid) });

  function chip(active: boolean) {
    return cn(
      "flex h-9 shrink-0 touch-manipulation items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-[background-color,border-color,color] duration-(--duration-fast) outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      active
        ? "bg-foreground text-background border-foreground"
        : "bg-card border-border hover:bg-muted",
    );
  }

  /** "Anna 3,20 € · Ben 1,10 €" — only in the group view, where it says who had what. */
  function byPerson(total: Total) {
    if (viewUid !== null) return null;
    const entries = Object.entries(total.byUid)
      .filter(([, amount]) => amount > 0)
      .sort(([, a], [, b]) => b - a);
    if (entries.length < 2) return null;
    return (
      <span className="text-muted-foreground block text-xs leading-snug">
        {entries
          // No break inside "Lea 3,65 €", only between people.
          .map(([uid, amount]) => `${nameOf(uid)}\u00a0${formatMoney(amount, group.currency)}`)
          .join(" · ")}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("insights.intro")}</p>

      <div className="flex flex-col gap-2">
        <Segmented<PeriodKind>
          label={t("insights.periodLabel")}
          value={period.kind}
          options={[
            { value: "month", label: t("insights.periodMonth") },
            { value: "year", label: t("insights.periodYear") },
            { value: "all", label: t("insights.periodAll") },
          ]}
          onChange={(kind) => setPeriod(currentPeriod(kind))}
        />
        <div className="flex min-h-10 items-center justify-between gap-2">
          {period.kind !== "all" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("insights.previous")}
              onClick={() => setPeriod((current) => shiftPeriod(current, -1))}
            >
              <ChevronLeft />
            </Button>
          ) : (
            <span className="size-9" aria-hidden="true" />
          )}
          <span className="font-medium" aria-live="polite">
            {periodLabel}
          </span>
          {period.kind !== "all" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("insights.next")}
              onClick={() => setPeriod((current) => shiftPeriod(current, 1))}
            >
              <ChevronRight />
            </Button>
          ) : (
            <span className="size-9" aria-hidden="true" />
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label={t("insights.viewLabel")}
        className="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] px-4 pb-1 [&::-webkit-scrollbar]:hidden"
      >
        <button
          type="button"
          aria-pressed={viewUid === null}
          className={chip(viewUid === null)}
          onClick={() => setViewUid(null)}
        >
          {t("insights.viewGroup")}
        </button>
        <button
          type="button"
          aria-pressed={viewUid === currentUid}
          className={chip(viewUid === currentUid)}
          onClick={() => setViewUid(currentUid)}
        >
          {t("insights.viewMe")}
        </button>
        {viewMembers.map(([uid, member]) => (
          <button
            key={uid}
            type="button"
            aria-pressed={viewUid === uid}
            className={chip(viewUid === uid)}
            onClick={() => setViewUid(uid)}
          >
            {member.displayName}
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="insights-total">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span id="insights-total" className="text-muted-foreground text-xs">
              {totalLabel}
            </span>
            <span className="font-heading tabular-money text-3xl font-medium">
              {formatMoney(totals.amountMinor, group.currency)}
            </span>
          </div>
          {totals.count > 0 && (
            <span className="text-muted-foreground pb-1 text-xs">{entriesLabel(totals.count)}</span>
          )}
        </div>

        {totals.count === 0 ? (
          <p className="text-muted-foreground bg-card ring-foreground/10 rounded-xl p-4 text-sm ring-1">
            {emptyLabel}
          </p>
        ) : (
          <div className="bg-card ring-foreground/10 shadow-e1 overflow-hidden rounded-xl ring-1">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-muted-foreground border-border/70 border-b text-[11px] tracking-wide uppercase">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    {t("insights.columnProduct")}
                  </th>
                  <th scope="col" className="w-24 px-2 py-2 text-right font-medium">
                    {t("insights.columnAmount")}
                  </th>
                  <th scope="col" className="w-14 py-2 pr-4 pl-1 text-right font-medium">
                    {t("insights.columnShare")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/70 divide-y">
                {totals.families.map((family) => {
                  const open = expanded.has(family.family);
                  const label = t(productFamilyLabelKey(family.family));
                  return (
                    <Fragment key={family.family}>
                      <tr data-testid="insights-family">
                        <th scope="row" className="p-0 text-left font-normal">
                          <button
                            type="button"
                            aria-expanded={open}
                            onClick={() => toggle(family.family)}
                            className="hover:bg-muted/60 focus-visible:ring-ring/50 flex w-full min-w-0 items-center gap-2 px-4 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-inset"
                          >
                            <span aria-hidden="true">{productFamilyEmoji(family.family)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block leading-snug font-medium break-words">
                                {label}
                              </span>
                              <span
                                aria-hidden="true"
                                className="bg-muted mt-1 block h-1 overflow-hidden rounded-full"
                              >
                                <span
                                  className="bg-primary block h-full rounded-full"
                                  style={{
                                    width: `${Math.max(share(family.amountMinor) * 100, 2)}%`,
                                  }}
                                />
                              </span>
                            </span>
                            <ChevronDown
                              aria-hidden="true"
                              className={cn(
                                "text-muted-foreground size-4 shrink-0 transition-transform",
                                open && "rotate-180",
                              )}
                            />
                          </button>
                        </th>
                        <td className="tabular-money px-2 py-2.5 text-right font-medium">
                          {formatMoney(family.amountMinor, group.currency)}
                        </td>
                        <td className="tabular-money text-muted-foreground py-2.5 pr-4 pl-1 text-right">
                          {shareLabel(family.amountMinor)}
                        </td>
                      </tr>
                      {open &&
                        family.kinds.map((kind) => (
                          <tr key={kind.kind} className="bg-muted/30" data-testid="insights-kind">
                            <th scope="row" className="py-2 pr-2 pl-11 text-left font-normal">
                              <span className="block truncate">
                                {kind.kind}
                                {kind.count > 1 && (
                                  <span className="text-muted-foreground">
                                    {" "}
                                    {t("insights.times", { count: kind.count })}
                                  </span>
                                )}
                              </span>
                              {byPerson(kind)}
                            </th>
                            <td className="tabular-money px-2 py-2 text-right align-top">
                              {formatMoney(kind.amountMinor, group.currency)}
                            </td>
                            <td className="tabular-money text-muted-foreground py-2 pr-4 pl-1 text-right align-top">
                              {shareLabel(kind.amountMinor)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
                {totals.unclassified.count > 0 && (
                  <tr data-testid="insights-unclassified">
                    <th
                      scope="row"
                      className="text-muted-foreground px-4 py-2.5 text-left font-normal"
                    >
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true">❔</span>
                        <span className="truncate">{t("insights.unclassified")}</span>
                      </span>
                    </th>
                    <td className="tabular-money text-muted-foreground px-2 py-2.5 text-right">
                      {formatMoney(totals.unclassified.amountMinor, group.currency)}
                    </td>
                    <td className="tabular-money text-muted-foreground py-2.5 pr-4 pl-1 text-right">
                      {shareLabel(totals.unclassified.amountMinor)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {aiEnabled && (waiting > 0 || classifyMessage) && (
        <section className="flex flex-col gap-2">
          <SectionHeading>{t("insights.unclassified")}</SectionHeading>
          {waiting > 0 && (
            <>
              <p className="text-muted-foreground text-sm">{t("insights.classifyHint")}</p>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={!online || classifying}
                onClick={classify}
              >
                <Sparkles />
                {classifying
                  ? t("insights.classifying")
                  : `${t("insights.classifyNow")} (${waiting})`}
              </Button>
            </>
          )}
          {classifyMessage && (
            <p className="text-muted-foreground text-sm" role="status">
              {classifyMessage}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
