import { describe, expect, it } from "vitest";
import type { Expense, GroupMember, TournamentMatch } from "@/lib/types";
import {
  challengePushes,
  chatPushes,
  estimateChallengePushes,
  estimateLastCallPushes,
  estimateNotBookedPushes,
  estimateStechenPushes,
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

describe("chatPushes", () => {
  it("tells every other member with an account, one collapsing tag per chat", () => {
    const pushes = chatPushes({
      groupId: "g1",
      group,
      text: "Wer kauft\n  Milch?",
      actorUid: "max",
    });
    expect(pushes.map((push) => push.uid)).toEqual(["lea", "ben"]);
    expect(de(pushes[0])).toEqual({
      title: "Chat in WG Küche",
      body: "Max: Wer kauft Milch?",
      url: "/groups/g1/chat",
      tag: "chat-g1",
    });
    expect(pushes[0].event).toBe("chat");
  });

  it("shortens a long message", () => {
    const [push] = chatPushes({ groupId: "g1", group, text: "x".repeat(500), actorUid: "max" });
    expect(de(push).body.length).toBeLessThan(140);
    expect(de(push).body.endsWith("…")).toBe(true);
  });
});

describe("estimate pushes", () => {
  // Max owns the group, Lea administers it, Ben is a plain member, Tom is a placeholder.
  const roleGroup = {
    name: "WG Küche",
    members: {
      max: { ...member("Max"), role: "owner" as const },
      lea: { ...member("Lea"), role: "admin" as const },
      ben: member("Ben"),
      tom: member("Tom", true),
    },
    memberUids: ["max", "lea", "ben"],
  };
  const stake = { description: "Pizza", amountMinor: 3600, currency: "EUR" };

  // Everything a push may interpolate. A question, a truth or a guess is not on this list: the
  // builders are not even handed one, and this pins that it stays that way.
  const ALLOWED_VARS = ["name", "game", "stake", "minutes", "group", "names", "description"];
  const varNames = (pushes: ReturnType<typeof estimateChallengePushes>) =>
    pushes.flatMap((push) => [
      ...(push.title.vars ? Object.keys(push.title.vars) : []),
      ...push.body.flatMap((text) => (text.vars ? Object.keys(text.vars) : [])),
    ]);

  describe("estimateChallengePushes", () => {
    const challenge = (overrides: Partial<Parameters<typeof estimateChallengePushes>[0]> = {}) =>
      estimateChallengePushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stake,
        poolUids: ["max", "lea", "ben", "tom"],
        actorUid: "max",
        minutes: 5,
        ...overrides,
      });

    it("invites everyone in the pool with an account, not whoever started it", () => {
      const pushes = challenge();
      expect(pushes.map((push) => push.uid)).toEqual(["lea", "ben"]);
      expect(pushes.every((push) => push.event === "challenge")).toBe(true);
    });

    it("states the stake, the window and the consequence, in each device's language", () => {
      const [push] = challenge();
      expect(de(push)).toEqual({
        title: "Herausforderung in WG Küche",
        body: "Max lädt dich zu Schätzfragen ein – es geht um Pizza · 36,00 €. 5 Min. Zeit, wer nicht tippt, zahlt zuerst. Ohne Googeln!",
        url: "/groups/g1/estimate/r1",
        tag: "challenge-r1",
      });
      expect(render(push, "en").body).toBe(
        "Max invites you to Estimates – it's about Pizza · 36,00 €. 5 min to guess; anyone who doesn't pays first. No googling!",
      );
    });

    it("goes stale with the window", () => {
      expect(challenge({ minutes: 5 })[0].ttlSeconds).toBe(300);
      expect(challenge({ minutes: 60 })[0].ttlSeconds).toBe(3600);
      expect(de(challenge({ minutes: 15 })[0]).body).toContain("15 Min. Zeit");
    });

    it("sends one push per person, even if the pool names someone twice", () => {
      expect(challenge({ poolUids: ["lea", "lea", "ben"] }).map((push) => push.uid)).toEqual([
        "lea",
        "ben",
      ]);
    });

    it("skips uids that are no member at all", () => {
      expect(
        challenge({ poolUids: ["lea", "ghost", "constructor"] }).map((push) => push.uid),
      ).toEqual(["lea"]);
    });

    it("sends nothing when nobody but the starter has an account", () => {
      expect(challenge({ poolUids: ["max", "tom"] })).toEqual([]);
    });
  });

  describe("estimateStechenPushes", () => {
    const stechen = (uids: string[]) =>
      estimateStechenPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex: 1,
        uids,
      });

    it("asks only the contenders with an account to guess again", () => {
      const pushes = stechen(["lea", "tom", "ben"]);
      expect(pushes.map((push) => push.uid)).toEqual(["lea", "ben"]);
      expect(pushes.every((push) => push.event === "turn")).toBe(true);
    });

    it("is a plain turn: goes stale in ten minutes and is not held back for a watching player", () => {
      const [push] = stechen(["lea"]);
      expect(push.ttlSeconds).toBe(600);
      expect(push).not.toHaveProperty("unlessWatching");
      expect(de(push)).toEqual({
        title: "Du bist dran",
        body: "Gleichstand! Eine Stechfrage wartet auf dich – Schätzfragen in WG Küche",
        url: "/groups/g1/estimate/r1",
        tag: "estimate-stechen-r1-1",
      });
      expect(render(push, "en").body).toBe(
        "A tie! A tiebreaker is waiting for you – Estimates in WG Küche",
      );
    });

    it("has one tag per stage, so a second Stechfrage replaces nothing", () => {
      const first = stechen(["lea"])[0];
      const [second] = estimateStechenPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex: 2,
        uids: ["lea"],
      });
      expect(first.tag).not.toBe(second.tag);
      expect(second.tag).toBe("estimate-stechen-r1-2");
    });

    it("says nothing about the question or the numbers", () => {
      expect(de(stechen(["lea"])[0]).body).not.toMatch(/\d/);
    });
  });

  describe("estimateLastCallPushes", () => {
    const lastCall = (uids: string[], stageIndex = 0) =>
      estimateLastCallPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex,
        uids,
        minutes: 2,
      });

    it("reminds only the players still without a guess, and says what it costs", () => {
      const pushes = lastCall(["ben", "tom"]);
      expect(pushes.map((push) => push.uid)).toEqual(["ben"]);
      expect(pushes[0].event).toBe("turn");
      expect(pushes[0].ttlSeconds).toBe(300);
      expect(de(pushes[0])).toEqual({
        title: "Du bist dran",
        body: "Letzte Chance: Schätzfragen in WG Küche wird in 2 Min. ausgewertet — wer nicht tippt, zahlt zuerst.",
        url: "/groups/g1/estimate/r1",
        tag: "estimate-lastcall-r1-0",
      });
      expect(render(pushes[0], "en").body).toBe(
        "Last call: Estimates in WG Küche is scored in 2 min — anyone who doesn't guess pays first.",
      );
    });

    it("never shares a tag with the Stechfrage push of the same stage", () => {
      const lastCallTag = lastCall(["lea"], 1)[0].tag;
      const [stechen] = estimateStechenPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex: 1,
        uids: ["lea"],
      });
      expect(lastCallTag).toBe("estimate-lastcall-r1-1");
      expect(lastCallTag).not.toBe(stechen.tag);
    });

    it("only ever names the minutes left", () => {
      expect(de(lastCall(["lea"])[0]).body.replace("2 Min.", "")).not.toMatch(/\d/);
    });
  });

  describe("estimateNotBookedPushes", () => {
    const notBooked = (overrides: Partial<Parameters<typeof estimateNotBookedPushes>[0]> = {}) =>
      estimateNotBookedPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        actorUid: "ben",
        names: "Lea und Ben",
        description: "Pizza",
        ...overrides,
      });

    it("goes to the creator and the managers with an account, once each", () => {
      // Ben created the round (a plain member); Max owns the group and Lea administers it.
      expect(notBooked().map((push) => push.uid)).toEqual(["max", "lea", "ben"]);
      // A manager who is also the creator is not told twice.
      expect(notBooked({ actorUid: "max" }).map((push) => push.uid)).toEqual(["max", "lea"]);
    });

    it("skips a placeholder creator and a creator who left, but still tells the managers", () => {
      expect(notBooked({ actorUid: "tom" }).map((push) => push.uid)).toEqual(["max", "lea"]);
      expect(notBooked({ actorUid: "gone" }).map((push) => push.uid)).toEqual(["max", "lea"]);
    });

    it("asks for the booking by hand and links to the round", () => {
      const [push] = notBooked();
      expect(push.event).toBe("challenge");
      expect(push.ttlSeconds).toBe(24 * 60 * 60);
      expect(de(push)).toEqual({
        title: "WG Küche",
        body: "Schätzfragen ist ausgewertet, aber nicht gebucht: Lea und Ben zahlen Pizza. Bitte manuell eintragen.",
        url: "/groups/g1/estimate/r1",
        tag: "estimate-notbooked-r1",
      });
      expect(render(push, "en").body).toBe(
        "Estimates is scored but not booked: Lea und Ben pay Pizza. Please add it by hand.",
      );
    });
  });

  it("interpolates nothing but names, the game, the stake, the group and a time", () => {
    const all = [
      ...estimateChallengePushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stake,
        poolUids: ["lea"],
        actorUid: "max",
        minutes: 5,
      }),
      ...estimateStechenPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex: 1,
        uids: ["lea"],
      }),
      ...estimateLastCallPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        stageIndex: 0,
        uids: ["lea"],
        minutes: 2,
      }),
      ...estimateNotBookedPushes({
        groupId: "g1",
        group: roleGroup,
        roundId: "r1",
        actorUid: "ben",
        names: "Lea",
        description: "Pizza",
      }),
    ];
    expect(all.length).toBeGreaterThan(0);
    for (const name of varNames(all)) expect(ALLOWED_VARS).toContain(name);
  });
});
