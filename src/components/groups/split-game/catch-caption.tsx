"use client";

import { type ReactNode } from "react";
import { useT } from "@/components/locale-provider";
import { formatMoney } from "@/lib/format/money";
import type { GameStake } from "@/lib/games/payers";

/**
 * What a luck game prints below the slip's tear line: what this payer pays
 * and for what ("zahlt 23,90 € · Pizza"), over the game's own line about the
 * catch (the roll, the place, "2 von 3 entschieden").
 *
 * `share` is display only — the caller takes it from `stakeShares` /
 * `stakeShareAt`, i.e. from the same `splitEqual` the form books with. It is
 * `null` whenever there is nothing to show yet: no amount typed, or (in the
 * lottery) a payer set that isn't final.
 */
export function CatchCaption({
  share,
  stake,
  detail,
}: {
  share?: number | null;
  stake?: GameStake | null;
  detail?: ReactNode;
}) {
  const t = useT();
  const amount = share != null && stake ? formatMoney(share, stake.currency) : null;
  const description = stake?.description.trim() ?? "";
  return (
    <span className="flex max-w-full flex-col items-center gap-0.5">
      {amount && (
        <span className="font-heading tabular-money line-clamp-2 text-base leading-snug font-medium text-balance">
          {description
            ? t("expenses.gameSlipPays", { amount, description })
            : t("expenses.gameSlipPaysAmount", { amount })}
        </span>
      )}
      {detail && <span className="text-muted-foreground text-sm font-medium">{detail}</span>}
    </span>
  );
}
