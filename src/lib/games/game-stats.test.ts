import { describe, expect, it } from "vitest";
import {
  duelStats,
  favoriteGames,
  gameExpensesInPeriod,
  localDay,
  luckIndex,
  periodStartDay,
  recentRounds,
} from "@/lib/games/game-stats";
import { isLuckGameId } from "@/lib/games/split-game-ids";
import type { Expense, SplitGameId, Tournament, TournamentMatch } from "@/lib/types";

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

describe("luckIndex", () => {
  /** A game-decided expense: `paid` is each payer's split; the bill is their sum unless given. */
  function round(
    id: string,
    gameId: SplitGameId,
    playerUids: string[],
    paid: Record<string, number>,
    extra: Partial<Expense> = {},
  ): Expense {
    const amountMinor = Object.values(paid).reduce((sum, amount) => sum + amount, 0);
    return expense(id, "2026-10-02", {
      amountMinor,
      paidBy: { max: amountMinor },
      splits: Object.fromEntries(
        Object.entries(paid).map(([uid, amount]) => [
          uid,
          { rawValue: amount, amountMinor: amount },
        ]),
      ),
      game: { gameId, playerUids, attempt: 1 },
      ...extra,
    });
  }
  const four = ["lea", "max", "ben", "mia"];

  it("compares what each player paid with the bill divided by everyone who played", () => {
    // Lea pays all three 40-€ bills; a fair share would have been 10 € each time.
    const expenses = [1, 2, 3].map((n) => round(`r${n}`, "wheel", four, { lea: 4000 }));
    expect(luckIndex(expenses, null)).toEqual([
      { uid: "lea", rounds: 3, paidMinor: 12000, expectedMinor: 3000, differenceMinor: 9000 },
      { uid: "ben", rounds: 3, paidMinor: 0, expectedMinor: 3000, differenceMinor: -3000 },
      { uid: "max", rounds: 3, paidMinor: 0, expectedMinor: 3000, differenceMinor: -3000 },
      { uid: "mia", rounds: 3, paidMinor: 0, expectedMinor: 3000, differenceMinor: -3000 },
    ]);
  });

  it("treats several payers and the slot's uneven charges like any other split", () => {
    const expenses = [
      round("r1", "lottery", four, { lea: 2000, max: 2000 }),
      round("r2", "slot", four, { lea: 2500, ben: 1000, mia: 500 }),
      round("r3", "balloon", four, { mia: 4000 }),
    ];
    const byUid = Object.fromEntries(luckIndex(expenses, null).map((e) => [e.uid, e]));
    expect(byUid.lea.differenceMinor).toBe(4500 - 3000);
    expect(byUid.max.differenceMinor).toBe(2000 - 3000);
    expect(byUid.ben.differenceMinor).toBe(1000 - 3000);
    expect(byUid.mia.differenceMinor).toBe(4500 - 3000);
  });

  it("keeps fractions of a cent exact until the end", () => {
    // 10 € among three, three times, everyone pays once: exactly even. Rounding
    // each share to 3,33 € first would have everyone 1 cent "unlucky".
    const three = ["lea", "max", "ben"];
    const even = [
      round("r1", "dicecup", three, { lea: 1000 }),
      round("r2", "dicecup", three, { max: 1000 }),
      round("r3", "dicecup", three, { ben: 1000 }),
    ];
    for (const entry of luckIndex(even, null)) {
      expect(entry).toMatchObject({ paidMinor: 1000, expectedMinor: 1000, differenceMinor: 0 });
    }

    // Mixed pool sizes: 1000/3 + 1000/3 + 1001/2 = 1167.17 → 11,67 €, and the
    // printed numbers add up.
    const mixed = [
      round("r1", "pegboard", three, { lea: 1000 }),
      round("r2", "pegboard", three, { max: 1000 }),
      round("r3", "duckrace", ["lea", "max"], { max: 1001 }),
    ];
    expect(luckIndex(mixed, null)).toEqual([
      { uid: "max", rounds: 3, paidMinor: 2001, expectedMinor: 1167, differenceMinor: 834 },
      { uid: "lea", rounds: 3, paidMinor: 1000, expectedMinor: 1167, differenceMinor: -167 },
    ]);
  });

  it("lists a person only from three rounds in the period on", () => {
    const expenses = [
      round("r1", "scratch", ["lea", "max"], { lea: 1000 }),
      round("r2", "scratch", ["lea", "max"], { lea: 1000 }),
      round("r3", "scratch", ["lea", "max", "ben"], { lea: 900 }),
      round("r4", "scratch", ["lea", "max"], { max: 1000 }, { date: "2026-09-30" }),
    ];
    expect(luckIndex(expenses, null).map((e) => [e.uid, e.rounds])).toEqual([
      ["lea", 4],
      ["max", 4],
    ]);
    expect(luckIndex(expenses, "2026-10-01").map((e) => [e.uid, e.rounds])).toEqual([
      ["lea", 3],
      ["max", 3],
    ]);
    expect(luckIndex(expenses, null, 1).map((e) => e.uid)).toContain("ben");
  });

  it("counts only luck rounds that record their game and hold together", () => {
    const counted = [1, 2, 3].map((n) => round(`ok${n}`, "wheel", ["lea", "max"], { lea: 1000 }));
    const skipped = [
      // A duel is won, not drawn.
      round("duel", "memory", ["lea", "max"], { max: 1000 }),
      // From before the game record, and split by hand since.
      round("old", "wheel", ["lea", "max"], { max: 1000 }, { game: undefined }),
      round("edited", "wheel", ["lea", "max"], { max: 1000 }, { game: null }),
      // Not game-decided at all.
      round("manual", "wheel", ["lea", "max"], { max: 1000 }, { viaLottery: false }),
      // A claimed placeholder: the split moved to "max", the record still names "ph_max".
      round("claimed", "wheel", ["lea", "ph_max"], { max: 1000 }),
    ];
    expect(luckIndex([...counted, ...skipped], null)).toEqual([
      { uid: "lea", rounds: 3, paidMinor: 3000, expectedMinor: 1500, differenceMinor: 1500 },
      { uid: "max", rounds: 3, paidMinor: 0, expectedMinor: 1500, differenceMinor: -1500 },
    ]);
  });

  it("knows which games are luck games", () => {
    expect(isLuckGameId("balloon")).toBe(true);
    expect(isLuckGameId("slot")).toBe(true);
    expect(isLuckGameId("rps")).toBe(false);
  });
});
