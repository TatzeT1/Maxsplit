import { describe, expect, it } from "vitest";
import type { Expense, GroupMember, TournamentMatch } from "@/lib/types";
import {
  challengePushes,
  expensePushes,
  newlyReadyMatches,
  settlementPushes,
  turnPush,
} from "./messages";
import { renderPayload } from "./render";

const member = (displayName: string, isPlaceholder = false): GroupMember => ({
  displayName,
  photoURL: "",
  joinedAt: "2026-01-01T00:00:00.000Z",
  role: "member",
  isPlaceholder,
});

const group = {
  name: "WG Küche",
  members: { max: member("Max"), lea: member("Lea"), ben: member("Ben"), tom: member("Tom", true) },
  memberUids: ["max", "lea", "ben"],
};

function expense(
  paidBy: Record<string, number>,
  shares: Record<string, number>,
): Pick<Expense, "description" | "currency" | "paidBy" | "splits"> {
  return {
    description: "Einkauf",
    currency: "EUR",
    paidBy,
    splits: Object.fromEntries(
      Object.entries(shares).map(([uid, value]) => [uid, { rawValue: value, amountMinor: value }]),
    ),
  };
}

/** Rendered as a German device gets it; money comes with a no-break space before "€", written plainly here. */
function render(push: Parameters<typeof renderPayload>[0], locale: "de" | "en" = "de") {
  const payload = renderPayload(push, locale);
  return { ...payload, body: payload.body.replace(/\u00a0/g, " ") };
}
const de = (push: Parameters<typeof renderPayload>[0]) => render(push);

describe("expensePushes", () => {
  it("tells everyone involved but the person who entered it what it means for them", () => {
    const pushes = expensePushes({
      groupId: "g1",
      group,
      expenseId: "e1",
      expense: expense({ lea: 9000 }, { max: 3000, lea: 3000, ben: 3000 }),
      origin: "added",
      actorUid: "max",
    });
    expect(pushes.map((push) => push.uid).sort()).toEqual(["ben", "lea"]);
    const byUid = Object.fromEntries(pushes.map((push) => [push.uid, de(push)]));
    expect(byUid.lea).toEqual({
      title: "WG Küche",
      body: "Max hat „Einkauf“ eingetragen – du bekommst 60,00 € zurück",
      url: "/groups/g1",
      tag: "expense-e1",
    });
    expect(byUid.ben.body).toBe("Max hat „Einkauf“ eingetragen – du schuldest dafür 30,00 €");
  });

  it("never pushes to placeholders, or to someone the expense leaves untouched", () => {
    const pushes = expensePushes({
      groupId: "g1",
      group,
      expenseId: "e1",
      expense: expense({ max: 2000 }, { max: 1000, tom: 1000, ben: 0 }),
      origin: "added",
      actorUid: "max",
    });
    expect(pushes).toEqual([]);
  });

  it("leaves out the balance part when it evens out for the person", () => {
    const [push] = expensePushes({
      groupId: "g1",
      group,
      expenseId: "e1",
      expense: expense({ lea: 1500, max: 1500 }, { lea: 1500, max: 1500 }),
      origin: "added",
      actorUid: "max",
    });
    expect(de(push).body).toBe("Max hat „Einkauf“ eingetragen");
  });

  it("includes the rule's own creator for a booking the cron made", () => {
    const pushes = expensePushes({
      groupId: "g1",
      group,
      expenseId: "rec_r1_2026-10-01",
      expense: expense({ max: 80000 }, { max: 40000, lea: 40000 }),
      origin: "recurring",
      actorUid: null,
    });
    expect(pushes.map((push) => push.uid).sort()).toEqual(["lea", "max"]);
    expect(de(pushes.find((push) => push.uid === "lea")!).body).toBe(
      "„Einkauf“ wurde automatisch gebucht – du schuldest dafür 400,00 €",
    );
  });

  it("skips the players of the game that booked it — they watched it happen", () => {
    const pushes = expensePushes({
      groupId: "g1",
      group,
      expenseId: "e9",
      expense: expense({ max: 3000 }, { lea: 1500, ben: 1500 }),
      origin: "game",
      actorUid: null,
      skip: ["lea", "ben"],
    });
    expect(pushes.map((push) => push.uid)).toEqual(["max"]);
    expect(de(pushes[0]).body).toBe(
      "„Einkauf“ wurde nach dem Spiel gebucht – du bekommst 30,00 € zurück",
    );
  });
});

describe("settlementPushes", () => {
  const settlement = { fromUid: "ben", toUid: "lea", amountMinor: 2000, currency: "EUR" };

  it("tells the receiver when someone else entered the payment", () => {
    const [push] = settlementPushes({
      groupId: "g1",
      group,
      settlementId: "s1",
      settlement,
      actorUid: "ben",
    });
    expect(push.uid).toBe("lea");
    expect(de(push)).toEqual({
      title: "WG Küche",
      body: "Ben hat dir 20,00 € gezahlt",
      url: "/groups/g1?tab=balances",
      tag: "settlement-s1",
    });
  });

  it("stays quiet when the receiver entered it, or has no account", () => {
    expect(
      settlementPushes({ groupId: "g1", group, settlementId: "s1", settlement, actorUid: "lea" }),
    ).toEqual([]);
    expect(
      settlementPushes({
        groupId: "g1",
        group,
        settlementId: "s1",
        settlement: { ...settlement, toUid: "tom" },
        actorUid: "ben",
      }),
    ).toEqual([]);
  });
});

describe("challengePushes", () => {
  it("challenges everyone in the pool with an account, not the challenger", () => {
    const pushes = challengePushes({
      groupId: "g1",
      group,
      tournamentId: "t1",
      gameId: "connectfour",
      stake: { description: "Pizza", amountMinor: 3600, currency: "EUR" },
      poolUids: ["max", "lea", "ben", "tom"],
      actorUid: "max",
    });
    expect(pushes.map((push) => push.uid)).toEqual(["lea", "ben"]);
    expect(de(pushes[0])).toEqual({
      title: "Herausforderung in WG Küche",
      body: "Max fordert dich zu Vier gewinnt heraus – es geht um Pizza · 36,00 €",
      url: "/groups/g1/tournaments/t1",
      tag: "challenge-t1",
    });
    // Each device reads it in its own language, the game's name included.
    expect(render(pushes[0], "en").body).toBe(
      "Max challenges you to Connect Four – the stake: Pizza · 36,00 €",
    );
  });
});

describe("turnPush", () => {
  it("is skipped while the player watches the game, and goes stale fast", () => {
    const push = turnPush({
      uid: "lea",
      opponentName: "Max",
      reason: "move",
      groupId: "g1",
      group,
      tournamentId: "t1",
      matchId: "m1",
      gameId: "tictactoe",
    });
    expect(push.unlessWatching).toEqual({ groupId: "g1", tournamentId: "t1" });
    expect(push.ttlSeconds).toBe(600);
    expect(de(push)).toEqual({
      title: "Du bist dran",
      body: "Max hat gezogen – Tic-Tac-Toe in WG Küche",
      url: "/groups/g1/tournaments/t1",
      tag: "turn-t1-m1",
    });
  });
});

describe("newlyReadyMatches", () => {
  const match = (id: string, status: TournamentMatch["status"]): TournamentMatch => ({
    id,
    treeIndex: 0,
    round: 1,
    sources: [
      { kind: "entrant", uid: "a" },
      { kind: "entrant", uid: "b" },
    ],
    players: ["a", "b"],
    next: null,
    status,
    claim: null,
    result: null,
  });

  it("finds only the matches this update made playable", () => {
    const before = {
      m1: match("m1", "playing"),
      m2: match("m2", "waiting"),
      m3: match("m3", "ready"),
    };
    const after = { m1: match("m1", "done"), m2: match("m2", "ready"), m3: match("m3", "ready") };
    expect(newlyReadyMatches(before, after).map((m) => m.id)).toEqual(["m2"]);
  });
});
