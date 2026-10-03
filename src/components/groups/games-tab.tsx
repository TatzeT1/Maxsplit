"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { SectionHeading } from "@/components/groups/section-heading";
import { StartGameButton } from "@/components/groups/start-game-button";
import { GameAvatar } from "@/components/groups/split-game/game-avatar";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryColorClasses, categoryIconElement } from "@/lib/categories";
import { gameResultSentence } from "@/lib/chat/game-result";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import {
  duelStats,
  favoriteGames,
  gameExpensesInPeriod,
  periodStartDay,
  recentRounds,
  type GameRoundEntry,
  type StatsPeriod,
} from "@/lib/games/game-stats";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useFinishedTournaments } from "@/lib/games/use-tournament";
import type { TranslationKey } from "@/lib/i18n/translate";
import { computeLotteryTotals } from "@/lib/money/lottery-totals";
import { cn } from "@/lib/utils";
import type { Expense, Group, Tournament } from "@/lib/types";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const RECENT_ROUNDS = 5;
const HEAD_TO_HEAD_SHOWN = 5;
const FAVORITES_SHOWN = 3;
const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

const PERIODS: readonly { id: StatsPeriod; labelKey: TranslationKey }[] = [
  { id: "month", labelKey: "expenses.gamesPeriodMonth" },
  { id: "year", labelKey: "expenses.gamesPeriodYear" },
  { id: "all", labelKey: "expenses.gamesPeriodAll" },
];

interface RankedLoser {
  uid: string;
  name: string;
  amountMinor: number;
  roundsLost: number;
}

/** Podium steps encode rank only — the amounts are printed, never read off the heights. */
const PODIUM_STEP = ["h-20", "h-14", "h-10"];
/**
 * Classic podium order — second, first, third — applied with CSS `order`, so
 * the DOM (and a screen reader) still goes first, second, third.
 */
const PODIUM_PLACE = ["order-2", "order-1", "order-3"];

function Podium({
  top,
  currency,
  firstTitle,
}: {
  top: RankedLoser[];
  currency: string;
  /** A title over first place, e.g. "Pechvogel des Monats". */
  firstTitle?: string;
}) {
  const t = useT();

  return (
    // Flex with fixed thirds rather than a grid, so one or two losers still
    // stand centered on the podium instead of hugging its left edge.
    <ol className="flex items-end justify-center gap-2">
      {top.map((entry, rank) => {
        return (
          <li
            key={entry.uid}
            className={cn(
              "animate-rise flex w-1/3 min-w-0 flex-col items-center gap-1.5 text-center",
              PODIUM_PLACE[rank],
            )}
            style={{ "--stagger": rank === 0 ? 2 : rank === 1 ? 1 : 3 } as CSSProperties}
          >
            {rank === 0 && firstTitle && (
              <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-[10px] leading-tight font-semibold">
                {firstTitle}
              </span>
            )}
            <span aria-hidden="true" className="text-xl leading-none">
              {RANK_MEDALS[rank]}
            </span>
            <GameAvatar
              name={entry.name}
              className={cn(
                "ring-card shadow-e1 ring-2",
                rank === 0 ? "size-14 text-xl" : "size-11 text-base",
              )}
            />
            <span className="w-full truncate text-sm font-medium">{entry.name}</span>
            <span
              className={cn(
                "font-heading tabular-money leading-none font-semibold",
                rank === 0 ? "text-xl" : "text-base",
              )}
            >
              {formatMoney(entry.amountMinor, currency)}
            </span>
            <span className="text-muted-foreground text-[11px] leading-tight">
              {entry.roundsLost === 1
                ? t("expenses.lotteryRoundsLostOne")
                : t("expenses.lotteryRoundsLost", { count: entry.roundsLost })}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "bg-muted ring-foreground/10 font-heading text-muted-foreground mt-1 flex w-full items-start justify-center rounded-t-lg pt-1.5 text-lg font-semibold ring-1",
                PODIUM_STEP[rank],
              )}
            >
              {rank + 1}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Month / year / all time — one choice for the whole tab. */
function PeriodPicker({
  value,
  onChange,
}: {
  value: StatsPeriod;
  onChange: (value: StatsPeriod) => void;
}) {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("expenses.gamesPeriodLabel")}
      className="bg-muted grid grid-cols-3 gap-1 rounded-xl p-1"
    >
      {PERIODS.map((period) => (
        <button
          key={period.id}
          type="button"
          role="radio"
          aria-checked={value === period.id}
          onClick={() => onChange(period.id)}
          className={cn(
            "focus-visible:ring-ring/50 h-9 rounded-lg text-[13px] font-medium transition-[background-color,color,box-shadow] duration-(--duration-fast) outline-none focus-visible:ring-3",
            value === period.id
              ? "bg-card text-foreground shadow-e1"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t(period.labelKey)}
        </button>
      ))}
    </div>
  );
}

/**
 * Wins and losses from online duels and tournaments, then the closest
 * rivalries. One-phone ladder duels aren't recorded match by match, so they
 * only count in the rounds — the footnote says so.
 */
function DuelSection({
  tournaments,
  errorCode,
  cachedEmpty,
  start,
  nameOf,
  currentUid,
}: {
  tournaments: Tournament[] | null;
  errorCode: string | null;
  cachedEmpty: boolean;
  start: string | null;
  nameOf: (uid: string) => string;
  currentUid: string;
}) {
  const t = useT();
  const stats = useMemo(
    () => (tournaments ? duelStats(tournaments, start) : null),
    [tournaments, start],
  );

  let body: React.ReactNode;
  if (errorCode) {
    // Per AGENTS.md: a failed listener must never pass for "no duels".
    body = (
      <div className="border-destructive/50 text-destructive flex flex-col gap-0.5 rounded-xl border p-3">
        <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
        <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
      </div>
    );
  } else if (cachedEmpty) {
    body = <p className="text-muted-foreground text-sm">{t("expenses.gamesDuelOffline")}</p>;
  } else if (!stats) {
    body = <Skeleton className="h-24 w-full rounded-xl" />;
  } else if (stats.matchCount === 0) {
    body = <p className="text-muted-foreground text-sm">{t("expenses.gamesDuelEmpty")}</p>;
  } else {
    body = (
      <>
        <ol className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
          {stats.records.map((record) => {
            const played = record.wins + record.losses;
            const share = Math.round((record.wins / played) * 100);
            return (
              <li key={record.uid} className="flex flex-col gap-1.5 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <GameAvatar name={nameOf(record.uid)} className="size-6 text-[11px]" />
                  <span className="min-w-0 flex-1 truncate">
                    {nameOf(record.uid)}
                    {record.uid === currentUid && t("groups.selfSuffix")}
                  </span>
                  <span className="font-heading shrink-0 font-semibold tabular-nums">
                    {record.wins} : {record.losses}
                  </span>
                </div>
                <div className="flex items-center gap-3 pl-9">
                  <div
                    aria-hidden="true"
                    className="bg-destructive/20 h-1.5 flex-1 overflow-hidden rounded-full"
                  >
                    <div
                      className="bg-success h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {record.wins === 1
                      ? t("expenses.gamesDuelWinsOne")
                      : t("expenses.gamesDuelWins", { count: record.wins })}
                    {" · "}
                    {record.losses === 1
                      ? t("expenses.gamesDuelLossesOne")
                      : t("expenses.gamesDuelLosses", { count: record.losses })}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
        {stats.pairs.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
              {t("expenses.gamesHeadToHeadTitle")}
            </span>
            <ul className="flex flex-col gap-1.5">
              {stats.pairs.slice(0, HEAD_TO_HEAD_SHOWN).map((pair) => (
                <li
                  key={pair.uids.join("|")}
                  className="bg-muted/50 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg px-3 py-2 text-sm"
                >
                  <span
                    className={cn(
                      "truncate text-right",
                      pair.wins[0] > pair.wins[1] && "font-semibold",
                    )}
                  >
                    {nameOf(pair.uids[0])}
                  </span>
                  <span className="font-heading font-semibold tabular-nums">
                    {pair.wins[0]} : {pair.wins[1]}
                  </span>
                  <span className={cn("truncate", pair.wins[1] > pair.wins[0] && "font-semibold")}>
                    {nameOf(pair.uids[1])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>{t("expenses.gamesDuelTitle")}</SectionHeading>
      {body}
      <p className="text-muted-foreground text-[11px]">{t("expenses.gamesDuelFootnote")}</p>
    </section>
  );
}

function RecentRound({ entry, group }: { entry: GameRoundEntry; group: Group }) {
  const t = useT();
  const nameOf = (uid: string) =>
    group.members[uid]?.displayName ??
    (entry.kind === "tournament" ? entry.tournament.entrants[uid]?.displayName : undefined) ??
    "?";

  if (entry.kind === "tournament") {
    const { tournament } = entry;
    const meta = SPLIT_GAME_META[tournament.gameId];
    const loserUids = tournament.loserUids ?? [];
    const winners = Object.keys(tournament.entrants).filter((uid) => !loserUids.includes(uid));
    return (
      <li className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden="true"
          className="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base"
        >
          {meta.emoji}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{t(meta.nameKey)}</span>
          <span className="text-muted-foreground truncate text-xs">
            {gameResultSentence(
              t,
              {
                gameId: tournament.gameId,
                loserUids,
                winnerUid: winners.length === 1 ? winners[0] : null,
                amount: null,
                attempt: 1,
                tournamentId: tournament.id,
              },
              nameOf,
            )}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-muted-foreground text-xs">
            {tournament.stake && tournament.stake.amountMinor > 0
              ? formatMoney(tournament.stake.amountMinor, tournament.stake.currency)
              : t("expenses.gamesRoundFree")}
          </span>
          <span className="text-muted-foreground text-[11px]">
            {formatDate(new Date(entry.at))}
          </span>
        </span>
      </li>
    );
  }

  const { expense } = entry;
  const loserNames = Object.entries(expense.splits)
    .filter(([, split]) => split.amountMinor > 0)
    .map(([uid]) => nameOf(uid));
  const game = expense.game;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          categoryColorClasses(expense.category),
        )}
      >
        {expense.emoji ? (
          <span className="text-base leading-none">{expense.emoji}</span>
        ) : (
          categoryIconElement(expense.category, "h-4 w-4")
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{expense.description}</span>
        <span className="text-muted-foreground truncate text-xs">
          {game && `${SPLIT_GAME_META[game.gameId].emoji} `}
          {loserNames.length === 1
            ? t("expenses.gamesRoundLostOne", { name: loserNames[0] })
            : t("expenses.gamesRoundLostMany", { names: listFormatter.format(loserNames) })}
          {game && game.attempt > 1 && (
            <span className="text-foreground font-semibold">
              {` · ${t("expenses.gameAttemptNth", { count: game.attempt })}`}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="tabular-money text-sm font-semibold">
          {formatMoney(expense.amountMinor, expense.currency)}
        </span>
        <span className="text-muted-foreground text-[11px]">
          {formatDate(new Date(expense.date))}
        </span>
      </span>
    </li>
  );
}

/**
 * The Spiele tab: who lost how much, the duel record, the favourite games
 * and the latest rounds — for this month, this year or all time. The group
 * told us the games are something they come back to.
 *
 * Money comes from game-decided expenses (`viaLottery`, every game, only
 * flagged going forward); duels also from finished tournaments, which
 * include the ones played just for fun. See `lib/games/game-stats.ts` for
 * how the two are joined without counting a game twice.
 */
export function GamesTab({
  expenses,
  group,
  currentUid,
  active = true,
}: {
  expenses: Expense[];
  group: Group;
  currentUid: string;
  /** Whether the tab is on screen: the finished tournaments load the first time it is. */
  active?: boolean;
}) {
  const t = useT();
  const currency = group.currency;
  const [period, setPeriod] = useState<StatsPeriod>("all");
  const [activated, setActivated] = useState(active);
  if (active && !activated) setActivated(true);
  const { tournaments, errorCode, cachedEmpty } = useFinishedTournaments(group.id, activated);

  const start = useMemo(() => periodStartDay(period, new Date()), [period]);
  const nameOf = (uid: string) => group.members[uid]?.displayName ?? "?";

  const rounds = useMemo(() => gameExpensesInPeriod(expenses, start), [expenses, start]);
  const ranked = useMemo(() => {
    const totals = computeLotteryTotals(rounds);
    return Object.entries(group.members)
      .map(([uid, member]) => ({
        uid,
        name: member.displayName,
        amountMinor: totals[uid]?.amountMinor ?? 0,
        roundsLost: totals[uid]?.roundsLost ?? 0,
      }))
      .sort((a, b) => b.amountMinor - a.amountMinor || b.roundsLost - a.roundsLost);
  }, [rounds, group.members]);
  const losers = ranked.filter((entry) => entry.roundsLost > 0);
  const spared = ranked.filter((entry) => entry.roundsLost === 0);
  const totalLostMinor = losers.reduce((sum, entry) => sum + entry.amountMinor, 0);

  const favorites = useMemo(
    () => favoriteGames(expenses, tournaments ?? [], start).slice(0, FAVORITES_SHOWN),
    [expenses, tournaments, start],
  );
  const recent = useMemo(
    () => recentRounds(expenses, tournaments ?? [], start, RECENT_ROUNDS),
    [expenses, tournaments, start],
  );

  const everPlayed = expenses.some((expense) => expense.viaLottery) || !!tournaments?.length;
  // Until the tournaments are in, "nothing played" isn't known yet.
  const tournamentsSettled = tournaments !== null || errorCode !== null || cachedEmpty;

  if (!everPlayed) {
    if (!tournamentsSettled) return <Skeleton className="h-40 w-full rounded-2xl" />;
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center">
        <span aria-hidden="true" className="text-4xl">
          🎲
        </span>
        <p className="font-heading text-lg font-medium">{t("expenses.gamesEmptyTitle")}</p>
        <p className="text-muted-foreground max-w-xs text-sm text-pretty">
          {t("expenses.gamesEmptyBody")}
        </p>
        <StartGameButton groupId={group.id} group={group} currentUid={currentUid} />
        {errorCode && (
          <p role="alert" className="text-destructive text-xs">
            {t("errors.errorCode", { code: errorCode })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <StartGameButton
          groupId={group.id}
          group={group}
          currentUid={currentUid}
          className="w-full"
        />
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <SectionHeading>{t("expenses.lotteryOverviewTitle")}</SectionHeading>
          <p className="text-muted-foreground text-xs">
            {rounds.length === 0
              ? t("expenses.gamesPeriodEmpty")
              : rounds.length === 1
                ? t("expenses.gamesSummaryOne", { amount: formatMoney(totalLostMinor, currency) })
                : t("expenses.gamesSummary", {
                    count: rounds.length,
                    amount: formatMoney(totalLostMinor, currency),
                  })}
          </p>
        </div>

        {losers.length > 0 && (
          <div className="bg-card ring-foreground/10 shadow-e1 flex flex-col gap-4 rounded-2xl px-4 pt-5 ring-1">
            <Podium
              top={losers.slice(0, 3)}
              currency={currency}
              firstTitle={period === "month" ? t("expenses.gamesBadLuckOfMonth") : undefined}
            />
          </div>
        )}

        {losers.length > 3 && (
          <ol className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
            {losers.slice(3).map((entry, index) => (
              <li key={entry.uid} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-muted-foreground w-6 shrink-0 text-xs tabular-nums">
                  #{index + 4}
                </span>
                <GameAvatar name={entry.name} className="size-6 text-[11px]" />
                <span className="min-w-0 flex-1 truncate">
                  {entry.name}
                  {entry.uid === currentUid && t("groups.selfSuffix")}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tabular-money font-medium">
                    {formatMoney(entry.amountMinor, currency)}
                  </span>
                  <span className="text-muted-foreground text-[11px]">
                    {entry.roundsLost === 1
                      ? t("expenses.lotteryRoundsLostOne")
                      : t("expenses.lotteryRoundsLost", { count: entry.roundsLost })}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}

        {losers.length > 0 && spared.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-xs">
            <span className="text-muted-foreground">{t("expenses.gamesSpared")}</span>
            {spared.map((entry) => (
              <span key={entry.uid} className="flex items-center gap-1.5">
                <GameAvatar name={entry.name} className="size-5 text-[10px]" />
                {entry.name}
              </span>
            ))}
          </div>
        )}
      </section>

      <DuelSection
        tournaments={tournaments}
        errorCode={errorCode}
        cachedEmpty={cachedEmpty}
        start={start}
        nameOf={nameOf}
        currentUid={currentUid}
      />

      {favorites.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{t("expenses.gamesFavoritesTitle")}</SectionHeading>
          <ol className="grid grid-cols-3 gap-2">
            {favorites.map((favorite) => {
              const meta = SPLIT_GAME_META[favorite.gameId];
              return (
                <li
                  key={favorite.gameId}
                  className="bg-card ring-foreground/10 shadow-e1 flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-3 text-center ring-1"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">
                    {meta.emoji}
                  </span>
                  <span className="w-full truncate text-xs font-medium">{t(meta.nameKey)}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {favorite.rounds === 1
                      ? t("expenses.gamesFavoriteRoundsOne")
                      : t("expenses.gamesFavoriteRounds", { count: favorite.rounds })}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeading>{t("expenses.gamesRecentTitle")}</SectionHeading>
          <ul className="bg-card ring-foreground/10 shadow-e1 divide-border/70 flex flex-col divide-y rounded-xl ring-1">
            {recent.map((entry) => (
              <RecentRound
                key={entry.kind === "expense" ? entry.expense.id : entry.tournament.id}
                entry={entry}
                group={group}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
