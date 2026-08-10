import { formatMoney } from "@/lib/format/money";
import { t } from "@/lib/i18n/de";
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
      return amountMinor > 0
        ? t("balances.youOwe", { name, amount: formatMoney(amountMinor, currency) })
        : t("balances.owesYou", { name, amount: formatMoney(-amountMinor, currency) });
    });

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <h2 className="text-sm font-medium">{t("balances.title")}</h2>
      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("balances.settledUp")}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {lines.map((line) => (
            <li key={line} className="text-sm">
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
