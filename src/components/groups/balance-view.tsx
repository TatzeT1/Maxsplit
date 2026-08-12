"use client";

import { Check, CheckCircle2, Copy, Download, Scale, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { getOrCreateSettlementShareToken } from "@/lib/actions/settlement-share";
import { formatMoney } from "@/lib/format/money";
import { simplifyDebts } from "@/lib/money/balances";
import { avatarGradient, cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

function MemberChip({ name }: { name: string }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-[10px] font-semibold text-white",
        avatarGradient(name),
      )}
    >
      {name.charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function BalanceView({
  groupId,
  net,
  balances,
  members,
  currentUid,
  currency,
}: {
  groupId: string;
  net: Record<string, Record<string, number>>;
  balances: Record<string, number>;
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
}) {
  const [showSimplified, setShowSimplified] = useState(false);
  const [pdfState, setPdfState] = useState<"idle" | "pending" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const t = useT();

  const myNet = net[currentUid] ?? {};
  const lines = Object.keys(members)
    .filter((uid) => uid !== currentUid && (myNet[uid] ?? 0) !== 0)
    .map((uid) => {
      const amountMinor = myNet[uid];
      const name = members[uid].displayName;
      return {
        uid,
        name,
        youOwe: amountMinor > 0,
        text:
          amountMinor > 0
            ? t("balances.youOwe", { name, amount: formatMoney(amountMinor, currency) })
            : t("balances.owesYou", { name, amount: formatMoney(-amountMinor, currency) }),
      };
    });

  // "Before" count: every outstanding debtor->creditor pair in the group,
  // not just the current user's — this is what simplification is compared
  // against. Each unresolved pair has exactly one positive side, so summing
  // positive entries counts each pair once without a separate dedupe pass.
  const pairwiseCount = useMemo(() => {
    let count = 0;
    for (const row of Object.values(net)) {
      for (const amount of Object.values(row)) {
        if (amount > 0) count++;
      }
    }
    return count;
  }, [net]);

  const simplifiedTransfers = useMemo(() => simplifyDebts(balances), [balances]);
  const canSimplify = pairwiseCount > simplifiedTransfers.length;

  const totalNet = Object.values(myNet).reduce((sum, amount) => sum + amount, 0);
  const isSettled = lines.length === 0;
  const youAreOwed = !isSettled && totalNet < 0;

  async function handleDownloadPdf() {
    setPdfState("pending");
    const result = await getOrCreateSettlementShareToken({ groupId });
    if (!result.ok) {
      setPdfState("error");
      return;
    }
    const url = `${window.location.origin}/share/settlement/${groupId}/${result.data.token}`;
    setShareUrl(url);
    setPdfState("idle");
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleCopyShareLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  return (
    <div
      className={cn(
        "animate-pop-in relative flex flex-col gap-3 overflow-hidden rounded-xl border-l-4 p-4 ring-1 transition-colors",
        isSettled
          ? "bg-card ring-foreground/10 border-l-success"
          : youAreOwed
            ? "bg-success/5 ring-foreground/10 border-l-success"
            : "bg-destructive/5 ring-foreground/10 border-l-destructive",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-medium">
          <Scale className="h-4 w-4" />
          {t("balances.title")}
        </h2>
        {canSimplify && (
          <Button
            type="button"
            variant={showSimplified ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setShowSimplified((current) => !current)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("balances.simplifyDebts")}
          </Button>
        )}
      </div>

      {lines.length === 0 ? (
        <div className="text-success flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4" />
          {t("balances.settledUp")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((line) => (
            <li
              key={line.uid}
              className={cn(
                "font-heading flex items-center gap-2 text-base font-medium",
                line.youOwe ? "text-destructive" : "text-success",
              )}
            >
              <MemberChip name={line.name} />
              {line.text}
            </li>
          ))}
        </ul>
      )}

      {showSimplified && canSimplify && (
        <div className="border-border/70 flex flex-col gap-2 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            {t("balances.simplifyDebtsHint")} {t("balances.simplifyPreview")}: {pairwiseCount} →{" "}
            {simplifiedTransfers.length}
          </p>
          <ul className="flex flex-col gap-1.5">
            {simplifiedTransfers.map((transfer, index) => (
              <li key={index} className="flex items-center gap-2 text-sm">
                <MemberChip name={members[transfer.fromUid]?.displayName ?? "?"} />
                {t("balances.transferSuggestion", {
                  from: members[transfer.fromUid]?.displayName ?? "?",
                  to: members[transfer.toUid]?.displayName ?? "?",
                  amount: formatMoney(transfer.amountMinor, currency),
                })}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-1.5 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={pdfState === "pending"}
              onClick={handleDownloadPdf}
            >
              <Download className="h-3.5 w-3.5" />
              {pdfState === "pending"
                ? t("balances.downloadPdfPending")
                : t("balances.downloadPdf")}
            </Button>
            {pdfState === "error" && (
              <p className="text-destructive text-xs">{t("balances.downloadPdfError")}</p>
            )}
            {shareUrl && (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={handleCopyShareLink}
                  className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-xs"
                >
                  {linkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {linkCopied ? t("balances.linkCopied") : t("balances.copyLink")}
                </button>
                <p className="text-muted-foreground text-xs">{t("balances.shareLinkHint")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
