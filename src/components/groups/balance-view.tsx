"use client";

import { CheckCircle2, Scale, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import { simplifyDebts } from "@/lib/money/balances";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

export function BalanceView({
  net,
  balances,
  members,
  currentUid,
  currency,
}: {
  net: Record<string, Record<string, number>>;
  balances: Record<string, number>;
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
}) {
  const [showSimplified, setShowSimplified] = useState(false);
  const t = useT();

  const myNet = net[currentUid] ?? {};
  const lines = Object.keys(members)
    .filter((uid) => uid !== currentUid && (myNet[uid] ?? 0) !== 0)
    .map((uid) => {
      const amountMinor = myNet[uid];
      const name = members[uid].displayName;
      return {
        uid,
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
                "font-heading text-base font-medium",
                line.youOwe ? "text-destructive" : "text-success",
              )}
            >
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
              <li key={index} className="text-sm">
                {t("balances.transferSuggestion", {
                  from: members[transfer.fromUid]?.displayName ?? "?",
                  to: members[transfer.toUid]?.displayName ?? "?",
                  amount: formatMoney(transfer.amountMinor, currency),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
