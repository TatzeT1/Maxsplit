"use client";

import { type CSSProperties, useId, useMemo } from "react";
import { SectionHeading } from "@/components/groups/section-heading";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import { formatSignedMoney } from "@/lib/format/money";
import { LUCK_INDEX_MIN_ROUNDS, luckIndex } from "@/lib/games/game-stats";
import { isLuckGameId } from "@/lib/games/split-game-ids";
import { cn } from "@/lib/utils";
import type { Expense, Group } from "@/lib/types";

/**
 * The Glücks-Index under the podium: what everyone paid in the period's luck
 * rounds against their fair share (`luckIndex`, lib/games/game-stats.ts), as
 * a diverging bar around zero — left and green paid less than expected,
 * right and red paid more. Bars are scaled to the biggest gap in the list;
 * the signed amount and the words beside it carry the meaning, never the
 * color alone.
 *
 * It renders from the same expenses as the podium, so it needs no listener
 * of its own and reads the offline cache like the rest of the tab. Hidden in
 * a group that has never played a luck game with a game record, where it
 * could only ever be empty.
 */
export function LuckIndexSection({
  expenses,
  start,
  group,
  currentUid,
}: {
  expenses: Expense[];
  /** The tab's period (`periodStartDay`). */
  start: string | null;
  group: Group;
  currentUid: string;
}) {
  const t = useT();
  const headingId = useId();
  const everPlayed = useMemo(
    () =>
      expenses.some(
        (expense) => expense.viaLottery && expense.game && isLuckGameId(expense.game.gameId),
      ),
    [expenses],
  );
  // Someone who has left the group still counts in the others' rounds, but
  // isn't listed — like the podium, which lists members only.
  const entries = useMemo(
    () => luckIndex(expenses, start).filter((entry) => group.members[entry.uid]),
    [expenses, start, group.members],
  );

  if (!everPlayed) return null;
  const scale = Math.max(1, ...entries.map((entry) => Math.abs(entry.differenceMinor)));

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionHeading id={headingId}>{t("expenses.gamesLuckIndexTitle")}</SectionHeading>
        <p className="text-muted-foreground text-xs text-pretty">
          {t("expenses.gamesLuckIndexIntro")}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("expenses.gamesLuckIndexEmpty")}</p>
      ) : (
        <div className="bg-card ring-foreground/10 shadow-e1 rounded-xl ring-1">
          {/* The axis, over the bars' track (which starts after the avatar). */}
          <div
            aria-hidden="true"
            className="flex justify-between pt-3 pr-4 pl-13 text-[11px] font-semibold tracking-[0.12em] uppercase"
          >
            <span className="text-success">◀ {t("expenses.gamesLuckIndexLuck")}</span>
            <span className="text-destructive">{t("expenses.gamesLuckIndexBadLuck")} ▶</span>
          </div>
          <ol aria-labelledby={headingId} className="divide-border/70 flex flex-col divide-y">
            {entries.map((entry, index) => {
              const name = group.members[entry.uid].displayName;
              const isSelf = entry.uid === currentUid;
              const difference = entry.differenceMinor;
              // Half the track per side; any gap at all shows at least a sliver.
              const width = difference === 0 ? 0 : Math.max(2, (Math.abs(difference) / scale) * 50);
              return (
                <li
                  key={entry.uid}
                  className="animate-rise flex flex-col gap-1.5 px-4 py-2.5"
                  style={{ "--stagger": Math.min(index, 8) } as CSSProperties}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <GameAvatar name={name} className="size-6 text-[11px]" />
                    <span className={cn("min-w-0 flex-1 truncate", isSelf && "font-semibold")}>
                      {name}
                      {isSelf && t("groups.selfSuffix")}
                    </span>
                    <span
                      className={cn(
                        "font-heading tabular-money shrink-0 font-semibold",
                        difference > 0
                          ? "text-destructive"
                          : difference < 0
                            ? "text-success"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatSignedMoney(difference, group.currency)}
                    </span>
                  </div>
                  <div aria-hidden="true" className="relative ml-9 h-2">
                    <span className="bg-border absolute inset-y-[-3px] left-1/2 w-px" />
                    {difference !== 0 && (
                      <span
                        className={cn(
                          "absolute inset-y-0 transition-[width] duration-(--duration-base)",
                          difference > 0
                            ? "bg-destructive left-1/2 rounded-r-full"
                            : "bg-success right-1/2 rounded-l-full",
                        )}
                        style={{ width: `${width}%` }}
                      />
                    )}
                  </div>
                  <p className="text-muted-foreground pl-9 text-[11px]">
                    {difference > 0
                      ? t("expenses.gamesLuckIndexMore")
                      : difference < 0
                        ? t("expenses.gamesLuckIndexLess")
                        : t("expenses.gamesLuckIndexEven")}
                    {" · "}
                    {entry.rounds === 1
                      ? t("expenses.gamesFavoriteRoundsOne")
                      : t("expenses.gamesFavoriteRounds", { count: entry.rounds })}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <p className="text-muted-foreground text-[11px]">
        {t("expenses.gamesLuckIndexFootnote", { count: LUCK_INDEX_MIN_ROUNDS })}
      </p>
    </section>
  );
}
