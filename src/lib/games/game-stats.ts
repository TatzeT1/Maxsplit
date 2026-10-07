import { isLuckGameId } from "@/lib/games/split-game-ids";
import type { Expense, SplitGameId, Tournament } from "@/lib/types";

/**
 * The Spiele tab's numbers, beyond "who lost how much": the luck index, duel
 * records, head-to-head scores, the group's favourite games and the latest
 * rounds. Pure, so the tab only renders.
 *
 * Two sources, joined without counting a game twice:
 * - game-decided expenses (`viaLottery`, and since 2026-10 `game`) — every
 *   luck game and every one-phone duel ladder;
 * - finished tournaments — online duels and brackets, including the ones
 *   played just for fun, which never become an expense. A tournament that
 *   booked an expense is that expense's round and is counted there.
 */

export type StatsPeriod = "month" | "year" | "all";

/** First day (`YYYY-MM-DD`, local) of the period `now` is in; `null` for all time. */
export function periodStartDay(period: StatsPeriod, now: Date): string | null {
  if (period === "all") return null;
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return period === "month" ? `${year}-${month}-01` : `${year}-01-01`;
}

/** The local calendar day of an ISO timestamp. */
export function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function inPeriod(day: string, start: string | null): boolean {
  return start === null || day >= start;
}

/** Game-decided expenses whose day falls in the period. */
export function gameExpensesInPeriod(expenses: Expense[], start: string | null): Expense[] {
  return expenses.filter((expense) => expense.viaLottery && inPeriod(expense.date, start));
}

function finishedInPeriod(tournaments: Tournament[], start: string | null): Tournament[] {
  return tournaments.filter(
    (tournament) =>
      tournament.status === "finished" &&
      tournament.finishedAt !== null &&
      inPeriod(localDay(tournament.finishedAt), start),
  );
}

/** Below this many luck rounds in the period a person isn't in the luck index — fewer is noise. */
export const LUCK_INDEX_MIN_ROUNDS = 3;

export interface LuckIndexEntry {
  uid: string;
  /** Luck rounds this person played in the period. */
  rounds: number;
  /** What they actually paid in those rounds. */
  paidMinor: number;
  /** Their fair share of those bills — each one divided by everyone who played it — rounded to minor units. */
  expectedMinor: number;
  /** `paidMinor - expectedMinor`: above zero they paid more than expected ("Pech"), below zero less ("Glück"). */
  differenceMinor: number;
}

/**
 * The luck index: per person, what the period's luck rounds cost them
 * against what chance would have them pay on average. In a round of `n`
 * players every one of them pays `amountMinor / n` in expectation — whether
 * one person pays it all or three split it, and the slot machine's uneven
 * charges are fair in expectation too — so the gap is chance (in the
 * balloon, chance and a little nerve). Most "Pech" first.
 *
 * Only luck games count (a duel is won, not drawn), and only expenses that
 * record their game: before 2026-10 an expense didn't say which game decided
 * it, and an edit that splits by hand stores `game: null`. A round also has
 * to hold together — its players paid exactly the bill between them — which
 * leaves out one whose split names someone outside the pool (a placeholder
 * claimed since moves the split to the new uid, not `playerUids`).
 *
 * Integer-safe: each share is a fraction of a cent, so bills are summed per
 * pool size in minor units and divided once at the end, then rounded for
 * display. The difference is taken from the rounded expectation, so
 * `paidMinor === expectedMinor + differenceMinor` holds exactly.
 */
export function luckIndex(
  expenses: Expense[],
  start: string | null,
  minRounds: number = LUCK_INDEX_MIN_ROUNDS,
): LuckIndexEntry[] {
  const tallies = new Map<
    string,
    { rounds: number; paidMinor: number; billsByPoolSize: Map<number, number> }
  >();

  for (const expense of gameExpensesInPeriod(expenses, start)) {
    const game = expense.game;
    if (!game || !isLuckGameId(game.gameId) || expense.amountMinor <= 0) continue;
    const players = new Set(game.playerUids);
    if (players.size < 2) continue;
    const paidByPlayers = [...players].reduce(
      (sum, uid) => sum + (expense.splits[uid]?.amountMinor ?? 0),
      0,
    );
    if (paidByPlayers !== expense.amountMinor) continue;

    for (const uid of players) {
      let tally = tallies.get(uid);
      if (!tally) {
        tally = { rounds: 0, paidMinor: 0, billsByPoolSize: new Map() };
        tallies.set(uid, tally);
      }
      tally.rounds += 1;
      tally.paidMinor += expense.splits[uid]?.amountMinor ?? 0;
      tally.billsByPoolSize.set(
        players.size,
        (tally.billsByPoolSize.get(players.size) ?? 0) + expense.amountMinor,
      );
    }
  }

  const entries: LuckIndexEntry[] = [];
  for (const [uid, tally] of tallies) {
    if (tally.rounds < minRounds) continue;
    let expected = 0;
    for (const [poolSize, billsMinor] of tally.billsByPoolSize) expected += billsMinor / poolSize;
    const expectedMinor = Math.round(expected);
    entries.push({
      uid,
      rounds: tally.rounds,
      paidMinor: tally.paidMinor,
      expectedMinor,
      differenceMinor: tally.paidMinor - expectedMinor,
    });
  }
  return entries.sort(
    (a, b) =>
      b.differenceMinor - a.differenceMinor || b.rounds - a.rounds || a.uid.localeCompare(b.uid),
  );
}

export interface DuelRecord {
  uid: string;
  wins: number;
  losses: number;
}

export interface HeadToHead {
  /** Sorted, so a pair has one key whoever won. */
  uids: [string, string];
  wins: [number, number];
}

/**
 * Wins and losses per person over every decided match of every finished
 * tournament — a bracket's early rounds count as much as its final — and
 * the same per pair of opponents. Best record first; most-played pair first.
 */
export function duelStats(
  tournaments: Tournament[],
  start: string | null,
): { records: DuelRecord[]; pairs: HeadToHead[]; matchCount: number } {
  const records = new Map<string, DuelRecord>();
  const pairs = new Map<string, HeadToHead>();
  let matchCount = 0;

  const record = (uid: string) => {
    let entry = records.get(uid);
    if (!entry) {
      entry = { uid, wins: 0, losses: 0 };
      records.set(uid, entry);
    }
    return entry;
  };

  for (const tournament of tournaments) {
    if (tournament.status !== "finished") continue;
    for (const match of Object.values(tournament.matches)) {
      const result = match.result;
      if (!result || !inPeriod(localDay(result.finishedAt), start)) continue;
      const { winnerUid, loserUid } = result;
      if (!winnerUid || !loserUid || winnerUid === loserUid) continue;
      matchCount += 1;
      record(winnerUid).wins += 1;
      record(loserUid).losses += 1;

      const uids = [winnerUid, loserUid].sort() as [string, string];
      const key = uids.join("|");
      let pair = pairs.get(key);
      if (!pair) {
        pair = { uids, wins: [0, 0] };
        pairs.set(key, pair);
      }
      pair.wins[uids[0] === winnerUid ? 0 : 1] += 1;
    }
  }

  const winRate = (entry: DuelRecord) => entry.wins / Math.max(entry.wins + entry.losses, 1);
  return {
    records: [...records.values()].sort(
      (a, b) => b.wins - a.wins || winRate(b) - winRate(a) || a.losses - b.losses,
    ),
    pairs: [...pairs.values()].sort((a, b) => b.wins[0] + b.wins[1] - (a.wins[0] + a.wins[1])),
    matchCount,
  };
}

/** Tournaments that aren't already counted through the expense they booked. */
function unbookedTournaments(tournaments: Tournament[], allExpenses: Expense[]): Tournament[] {
  const expenseIds = new Set(allExpenses.map((expense) => expense.id));
  return tournaments.filter(
    (tournament) => !tournament.expenseId || !expenseIds.has(tournament.expenseId),
  );
}

export interface GamePlayCount {
  gameId: SplitGameId;
  rounds: number;
}

/**
 * Rounds per game in the period, most played first. Older game-decided
 * expenses don't say which game they were (no `game` record) and aren't
 * counted here; a tournament always knows its game.
 */
export function favoriteGames(
  expenses: Expense[],
  tournaments: Tournament[],
  start: string | null,
): GamePlayCount[] {
  const counts = new Map<SplitGameId, number>();
  const add = (gameId: SplitGameId) => counts.set(gameId, (counts.get(gameId) ?? 0) + 1);
  for (const expense of gameExpensesInPeriod(expenses, start)) {
    if (expense.game) add(expense.game.gameId);
  }
  for (const tournament of finishedInPeriod(unbookedTournaments(tournaments, expenses), start)) {
    add(tournament.gameId);
  }
  return [...counts.entries()]
    .map(([gameId, rounds]) => ({ gameId, rounds }))
    .sort((a, b) => b.rounds - a.rounds);
}

export type GameRoundEntry =
  | { kind: "expense"; at: string; expense: Expense }
  | { kind: "tournament"; at: string; tournament: Tournament };

/** The latest rounds of the period, both kinds, newest first. */
export function recentRounds(
  expenses: Expense[],
  tournaments: Tournament[],
  start: string | null,
  limit: number,
): GameRoundEntry[] {
  const entries: GameRoundEntry[] = [
    ...gameExpensesInPeriod(expenses, start).map(
      (expense) => ({ kind: "expense", at: expense.createdAt, expense }) as const,
    ),
    ...finishedInPeriod(unbookedTournaments(tournaments, expenses), start).map(
      (tournament) => ({ kind: "tournament", at: tournament.finishedAt!, tournament }) as const,
    ),
  ];
  return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
