"use client";

import { useT } from "@/components/locale-provider";
import { cn } from "@/lib/utils";

/**
 * "Ausgabe | Gutschrift": whether the entry is a bill or money the group gets
 * back (a deposit slip, a refund), which is booked negative. A toggle rather
 * than a typed minus: the amount fields use `inputMode="decimal"`, and the
 * iPhone's decimal keypad has no minus key.
 */
export function ExpenseKindToggle({
  credit,
  onChange,
}: {
  credit: boolean;
  onChange: (credit: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label={t("expenses.kindLabel")}
        className="flex gap-1 rounded-lg border p-1"
      >
        {([false, true] as const).map((isCredit) => (
          <button
            key={String(isCredit)}
            type="button"
            role="radio"
            aria-checked={credit === isCredit}
            onClick={() => onChange(isCredit)}
            className={cn(
              "flex-1 rounded-md px-2 py-2 text-sm font-medium transition-all duration-200 active:scale-95",
              credit === isCredit
                ? "bg-card text-foreground shadow-e1"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {isCredit ? `↩️ ${t("expenses.kindCredit")}` : t("expenses.kindExpense")}
          </button>
        ))}
      </div>
      {credit && <p className="text-muted-foreground text-sm">{t("expenses.creditHint")}</p>}
    </div>
  );
}
