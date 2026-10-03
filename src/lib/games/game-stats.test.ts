import { describe, expect, it } from "vitest";
import {
  duelStats,
  favoriteGames,
  gameExpensesInPeriod,
  localDay,
  periodStartDay,
  recentRounds,
} from "@/lib/games/game-stats";
import type { Expense, Tournament, TournamentMatch } from "@/lib/types";

function expense(id: string, date: string, extra: Partial<Expense> = {}): Expense {
  return {
    id,
    description: "Pizza",
    amountMinor: 3000,
    currency: "EUR",
    date,
    category: null,
    paidBy: { max: 3000 },
    splitMode: "exact",
    splits: { lea: { rawValue: 3000, amountMinor: 3000 } },
    createdBy: "max",
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    deletedAt: null,
    viaLottery: true,
    ...extra,
  };
}

function match(
  id: string,
  winnerUid: string,
  loserUid: string,
  finishedAt: string,
): TournamentMatch {
  return {
    id,
    treeIndex: 0,
    round: 1,
    sources: [
      { kind: "entrant", uid: winnerUid },
      { kind: "entrant", uid: loserUid },
    ],
    players: [winnerUid, loserUid],
    next: null,
    status: "done",
    claim: null,
    result: { winnerUid, loserUid, attempts: 1, reportedBy: winnerUid, finishedAt },
  };
}

function tournament(
  id: string,
  matches: TournamentMatch[],
  extra: Partial<Tournament> = {},
): Tournament {
  const finishedAt = matches.at(-1)?.result?.finishedAt ?? null;
  return {
    id,
    gameId: "rps",
    status: "finished",
    createdBy: "max",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: finishedAt ?? "2026-01-01T00:00:00.000Z",
    finishedAt,
    cancelledAt: null,
    cancelledBy: null,
    entrants: {},
    seedOrder: [],
    targetLoserCount: 1,
    advance: "winner",
    trees: [],
    matches: Object.fromEntries(matches.map((m) => [m.id, m])),
    loserUids: matches.map((m) => m.result!.loserUid),
    stake: null,
    ...extra,
  };
}

describe("periods", () => {
  const now = new Date(2026, 9, 3, 15, 0);

  it("start on the first of the month or the year, or not at all", () => {
    expect(periodStartDay("month", now)).toBe("2026-10-01");
    expect(periodStartDay("year", now)).toBe("2026-01-01");
    expect(periodStartDay("all", now)).toBeNull();
  });

  it("filter game expenses by their day and skip manual splits", () => {
    const expenses = [
      expense("a", "2026-10-02"),
      expense("b", "2026-09-30"),
      expense("c", "2026-10-03", { viaLottery: false }),
    ];
    expect(gameExpensesInPeriod(expenses, "2026-10-01").map((e) => e.id)).toEqual(["a"]);
    expect(gameExpensesInPeriod(expenses, null).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("read a timestamp as a local day", () => {
    const iso = new Date(2026, 9, 1, 0, 30).toISOString();
    expect(localDay(iso)).toBe("2026-10-01");
  });
});

describe("duelStats", () => {
  const oct = new Date(2026, 9, 2, 20).toISOString();
  const sep = new Date(2026, 8, 20, 20).toISOString();
  const tournaments = [
    tournament("t1", [match("m1", "lea", "max", sep)]),
    tournament("t2", [match("m1", "max", "lea", oct), match("m2", "max", "ben", oct)]),
    tournament("t3", [match("m1", "lea", "max", oct)], { status: "cancelled" }),
  ];

  it("counts every decided match of a finished tournament", () => {
    const { records, pairs, matchCount } = duelStats(tournaments, null);
    expect(matchCount).toBe(3);
    expect(records).toEqual([
      { uid: "max", wins: 2, losses: 1 },
      { uid: "lea", wins: 1, losses: 1 },
      { uid: "ben", wins: 0, losses: 1 },
    ]);
    expect(pairs[0]).toEqual({ uids: ["lea", "max"], wins: [1, 1] });
    expect(pairs[1]).toEqual({ uids: ["ben", "max"], wins: [0, 1] });
  });

  it("keeps to the period", () => {
    const { records, matchCount } = duelStats(tournaments, "2026-10-01");
    expect(matchCount).toBe(2);
    expect(records.find((r) => r.uid === "lea")).toEqual({ uid: "lea", wins: 0, losses: 1 });
  });
});

describe("rounds across expenses and tournaments", () => {
  const oct = (day: number) => new Date(2026, 9, day, 20).toISOString();
  const expenses = [
    expense("e1", "2026-10-01", {
      game: { gameId: "wheel", playerUids: ["max", "lea"], attempt: 1 },
    }),
    expense("e2", "2026-10-02", {
      game: { gameId: "wheel", playerUids: ["max", "lea"], attempt: 2 },
    }),
    // Booked by t-booked: counted as this expense, not twice.
    expense("e3", "2026-10-03", {
      game: { gameId: "memory", playerUids: ["max", "lea"], attempt: 1 },
    }),
    // Older, no record of which game it was; saved after e3.
    expense("e4", "2026-10-03", { createdAt: "2026-10-03T13:00:00.000Z" }),
  ];
  const tournaments = [
    tournament("t-free", [match("m1", "lea", "max", oct(4))]),
    tournament("t-booked", [match("m1", "lea", "max", oct(3))], {
      gameId: "memory",
      expenseId: "e3",
    }),
    // Booked an expense that was deleted since: the round still happened.
    tournament("t-orphan", [match("m1", "lea", "max", oct(2))], {
      gameId: "nim",
      expenseId: "gone",
    }),
  ];

  it("ranks the games by rounds, without counting a booked tournament twice", () => {
    expect(favoriteGames(expenses, tournaments, null)).toEqual([
      { gameId: "wheel", rounds: 2 },
      { gameId: "memory", rounds: 1 },
      { gameId: "rps", rounds: 1 },
      { gameId: "nim", rounds: 1 },
    ]);
  });

  it("lists the newest rounds of both kinds", () => {
    const rounds = recentRounds(expenses, tournaments, null, 4);
    expect(rounds.map((r) => (r.kind === "expense" ? r.expense.id : r.tournament.id))).toEqual([
      "t-free",
      "e4",
      "e3",
      "t-orphan",
    ]);
  });
});
