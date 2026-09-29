"use client";

import { ArrowRight, Check, Copy, Download, FileSpreadsheet, RotateCcw } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { SectionHeading } from "@/components/groups/section-heading";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  getOrCreateSettlementShareToken,
  rotateSettlementShareToken,
} from "@/lib/actions/settlement-share";
import { buildGroupCsv, groupCsvFileName } from "@/lib/export/group-csv";
import { formatMoney } from "@/lib/format/money";
import {
  computeMemberTotals,
  computePairwiseDebts,
  simplifyDebts,
  type BalanceExpense,
} from "@/lib/money/balances";
import { utcToday } from "@/lib/recurring/schedule";
import { cn } from "@/lib/utils";
import type { Expense, GroupMember, Settlement } from "@/lib/types";

/**
 * Saves a file the browser built itself. A blob download never navigates the
 * tab — on a phone, especially as an installed standalone PWA, navigating to
 * a file strands the user there with no browser chrome and no way back.
 */
function saveBlob(blob: Blob, fileName: string) {
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

/** "+12,50 €" / "−12,50 €" — a real minus sign, so it lines up with the plus. */
function formatSigned(amountMinor: number, currency: string): string {
  const sign = amountMinor > 0 ? "+" : amountMinor < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(amountMinor), currency)}`;
}

/**
 * Everyone's net balance as a diverging bar around a zero line: right and
 * green for money still coming back, left and red for money still owed.
 * Bars are scaled to the largest balance in the group, so the picture is
 * "who's furthest out", at a glance. The signed amount is always printed
 * beside the bar in ink, so polarity never rests on color alone.
 */
function EveryoneChart({
  balances,
  members,
  currentUid,
  currency,
}: {
  balances: Record<string, number>;
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
}) {
  const t = useT();
  const rows = Object.entries(members)
    .map(([uid, member]) => ({ uid, name: member.displayName, amountMinor: balances[uid] ?? 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
  const scale = Math.max(1, ...rows.map((row) => Math.abs(row.amountMinor)));

  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((row, index) => {
        // Half the track per side; a non-zero balance always shows at least a sliver.
        const width =
          row.amountMinor === 0 ? 0 : Math.max(2, (Math.abs(row.amountMinor) / scale) * 50);
        return (
          <li
            key={row.uid}
            className="animate-rise flex flex-col gap-1.5"
            style={{ "--stagger": Math.min(index, 8) } as CSSProperties}
          >
            <div className="flex items-center gap-2 text-sm">
              <GameAvatar name={row.name} className="size-6 text-[11px]" />
              <span
                className={cn("min-w-0 flex-1 truncate", row.uid === currentUid && "font-semibold")}
              >
                {row.name}
                {row.uid === currentUid && t("groups.selfSuffix")}
              </span>
              <span className="tabular-money shrink-0 font-medium">
                {row.amountMinor === 0
                  ? formatMoney(0, currency)
                  : formatSigned(row.amountMinor, currency)}
              </span>
            </div>
            <div aria-hidden="true" className="relative h-2">
              <span className="bg-border absolute inset-y-[-3px] left-1/2 w-px" />
              {row.amountMinor !== 0 && (
                <span
                  className={cn(
                    "absolute inset-y-0",
                    row.amountMinor > 0
                      ? "bg-success left-1/2 rounded-r-full"
                      : "bg-destructive right-1/2 rounded-l-full",
                  )}
                  style={{ width: `${width}%` }}
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function BalancesTab({
  groupId,
  groupName,
  balances,
  expenses,
  balanceExpenses,
  settlements,
  members,
  currentUid,
  currency,
  hasShareLink,
  canManage,
}: {
  groupId: string;
  groupName: string;
  balances: Record<string, number>;
  /** Live expenses, for the CSV export — `balanceExpenses` has only the money. */
  expenses: Expense[];
  balanceExpenses: BalanceExpense[];
  settlements: Settlement[];
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
  /** Whether a public PDF link has ever been minted (`group.settlementShareToken`). */
  hasShareLink: boolean;
  /** Owners and admins may reset that link. */
  canManage: boolean;
}) {
  const t = useT();
  const [pdfState, setPdfState] = useState<"idle" | "pending" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [resetState, setResetState] = useState<"idle" | "pending" | "done" | "error">("idle");

  const transfers = useMemo(() => simplifyDebts(balances), [balances]);
  // "Before" count: every outstanding debtor->creditor pair in the whole
  // group. Each unresolved pair has exactly one positive side, so counting
  // positive entries counts each pair once.
  const pairwiseCount = useMemo(() => {
    let count = 0;
    for (const row of Object.values(computePairwiseDebts(balanceExpenses, settlements))) {
      for (const amount of Object.values(row)) if (amount > 0) count++;
    }
    return count;
  }, [balanceExpenses, settlements]);
  const memberTotals = useMemo(() => computeMemberTotals(balanceExpenses), [balanceExpenses]);
  const totalRows = Object.entries(members).filter(([uid]) => {
    const totals = memberTotals[uid];
    return totals && (totals.paidMinor > 0 || totals.shareMinor > 0);
  });

  async function handleDownloadPdf() {
    setPdfState("pending");
    const result = await getOrCreateSettlementShareToken({ groupId });
    if (!result.ok) {
      setPdfState("error");
      return;
    }
    const url = `${window.location.origin}/share/settlement/${groupId}/${result.data.token}`;
    setShareUrl(url);

    // Fetch-and-save via a blob URL instead of `window.open`/navigating to
    // the PDF: on mobile, especially installed as a standalone PWA (see
    // manifest.ts), navigating to an inline-rendered PDF strands the user
    // there with no browser chrome and no way back. A blob download never
    // navigates the tab at all, so there's nothing to return from.
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("PDF fetch failed");
      saveBlob(await response.blob(), "schuldenausgleich.pdf");
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  /** Built from what this page already has loaded — no server round trip, works offline. */
  function handleExportCsv() {
    const csv = buildGroupCsv({ expenses, settlements, members, currency, t });
    saveBlob(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
      groupCsvFileName(groupName, t("csvExport.fileName"), utcToday()),
    );
  }

  async function handleResetShareLink() {
    setResetState("pending");
    const result = await rotateSettlementShareToken({ groupId });
    if (!result.ok) {
      setResetState("error");
      return;
    }
    setShareUrl(`${window.location.origin}/share/settlement/${groupId}/${result.data.token}`);
    setLinkCopied(false);
    setResetState("done");
  }

  async function handleCopyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading>{t("balances.everyoneTitle")}</SectionHeading>
          <p className="text-muted-foreground text-xs">{t("balances.everyoneHint")}</p>
        </div>
        <div className="bg-card ring-foreground/10 shadow-e1 rounded-xl p-4 ring-1">
          <EveryoneChart
            balances={balances}
            members={members}
            currentUid={currentUid}
            currency={currency}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading>{t("balances.transfersTitle")}</SectionHeading>
          {pairwiseCount > transfers.length && (
            <p className="text-muted-foreground text-xs">
              {t("balances.transfersSimplified", {
                after: transfers.length,
                before: pairwiseCount,
              })}
            </p>
          )}
        </div>
        {transfers.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            {t("balances.transfersNone")}
          </p>
        ) : (
          <ul className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
            {transfers.map((transfer) => {
              const fromName = members[transfer.fromUid]?.displayName ?? "?";
              const toName = members[transfer.toUid]?.displayName ?? "?";
              const involvesYou = transfer.fromUid === currentUid || transfer.toUid === currentUid;
              return (
                <li
                  key={`${transfer.fromUid}-${transfer.toUid}`}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm",
                    involvesYou && "bg-primary/[0.06] first:rounded-t-xl last:rounded-b-xl",
                  )}
                >
                  <span className="sr-only">
                    {t("balances.transferSuggestion", {
                      from: fromName,
                      to: toName,
                      amount: formatMoney(transfer.amountMinor, currency),
                    })}
                  </span>
                  <span aria-hidden="true" className="contents">
                    <GameAvatar name={fromName} className="size-6 text-[11px]" />
                    <span className="min-w-0 truncate">{fromName}</span>
                    <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                    <GameAvatar name={toName} className="size-6 text-[11px]" />
                    <span className="min-w-0 flex-1 truncate">{toName}</span>
                    <span className="tabular-money shrink-0 font-semibold">
                      {formatMoney(transfer.amountMinor, currency)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {totalRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{t("analytics.byMember")}</SectionHeading>
          <div className="bg-card ring-foreground/10 shadow-e1 overflow-hidden rounded-xl ring-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-border/70 border-b text-[11px] tracking-wide uppercase">
                  <th scope="col" className="px-4 py-2 text-left font-medium">
                    {t("analytics.person")}
                  </th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">
                    {t("analytics.paid")}
                  </th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">
                    {t("analytics.share")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/70 divide-y">
                {totalRows.map(([uid, member]) => (
                  <tr key={uid}>
                    <th scope="row" className="px-4 py-2.5 text-left font-normal">
                      <span className="flex min-w-0 items-center gap-2">
                        <GameAvatar name={member.displayName} className="size-5 text-[10px]" />
                        <span className="truncate">{member.displayName}</span>
                      </span>
                    </th>
                    <td className="tabular-money px-2 py-2.5 text-right">
                      {formatMoney(memberTotals[uid].paidMinor, currency)}
                    </td>
                    <td className="tabular-money text-muted-foreground px-4 py-2.5 text-right">
                      {formatMoney(memberTotals[uid].shareMinor, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading>{t("balances.exportTitle")}</SectionHeading>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            disabled={pdfState === "pending"}
            onClick={handleDownloadPdf}
          >
            <Download />
            {pdfState === "pending" ? t("balances.downloadPdfPending") : t("balances.downloadPdf")}
          </Button>
          {pdfState === "error" && (
            <p className="text-destructive text-xs">{t("balances.downloadPdfError")}</p>
          )}
          <Button type="button" variant="outline" className="h-11 w-full" onClick={handleExportCsv}>
            <FileSpreadsheet />
            {t("csvExport.button")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("csvExport.hint")}</p>
          {shareUrl && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleCopyShareLink}
                className="text-muted-foreground hover:text-foreground flex min-h-8 w-fit items-center gap-1.5 text-xs"
              >
                {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {linkCopied ? t("balances.linkCopied") : t("balances.copyLink")}
              </button>
              <p className="text-muted-foreground text-xs">{t("balances.shareLinkHint")}</p>
            </div>
          )}
          {canManage && (hasShareLink || shareUrl) && (
            <div className="flex flex-col gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={resetState === "pending"}
                    className="text-muted-foreground hover:text-foreground flex min-h-8 w-fit items-center gap-1.5 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("balances.resetShareLink")}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("balances.resetShareLinkTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("balances.resetShareLinkBody")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={handleResetShareLink}>
                      {t("balances.resetShareLinkConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {resetState === "done" && (
                <p role="status" className="text-muted-foreground text-xs">
                  {t("balances.resetShareLinkDone")}
                </p>
              )}
              {resetState === "error" && (
                <p className="text-destructive text-xs">{t("balances.resetShareLinkError")}</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
