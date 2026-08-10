import { CheckCircle2, Scale } from "lucide-react";
import { formatMoney } from "@/lib/format/money";
import { t } from "@/lib/i18n/de";
import { cn } from "@/lib/utils";
import type { GroupMember } from "@/lib/types";

export function BalanceView({
  net,
  members,
  currentUid,
  currency,
}: {
  net: Record<string, Record<string, number>>;
  members: Record<string, GroupMember>;
  currentUid: string;
  currency: string;
}) {
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

  return (
    <div className="bg-card ring-foreground/10 flex flex-col gap-3 rounded-xl p-4 ring-1">
      <h2 className="flex items-center gap-1.5 text-sm font-medium">
        <Scale className="h-4 w-4" />
        {t("balances.title")}
      </h2>
      {lines.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          {t("balances.settledUp")}
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {lines.map((line) => (
            <li
              key={line.uid}
              className={cn(
                "text-sm font-medium",
                line.youOwe ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
              )}
            >
              {line.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
