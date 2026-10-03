import { createECDH, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addExpense } from "@/lib/actions/expenses";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  updateNotificationPrefs,
} from "@/lib/actions/notifications";
import { recordSettlement } from "@/lib/actions/settlements";
import {
  createTournament,
  markTournamentPresence,
  nudgeOpponent,
  openOnlineMatch,
  playOnlineMove,
} from "@/lib/actions/tournaments";
import { adminDb } from "@/lib/firebase/admin";
import { deliverPushes, type PushSender } from "@/lib/push/deliver";
import { PUSH_SUBSCRIPTIONS, subscriptionRef } from "@/lib/push/store";
import type { PendingPush } from "@/lib/push/types";
import { materializeDueRecurringRules } from "@/lib/recurring/materialize";
import { placeholderMember, realMember, seedGroup, seedRecurringRule } from "@/test/fixtures";
import { sentPushes } from "@/test/push-mock";
import { signInAs } from "@/test/session-mock";

// Push notifications against the Firestore emulator: which actions queue
// which pushes (lib/push/notify is swapped for a recorder, see
// vitest.emulator.setup.ts), how subscriptions are stored, and how delivery
// honors preferences, presence and dead subscriptions.

const webPush = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webPush }));

/** A fresh P-256 key as base64url, the shape of both a VAPID key and a subscription's p256dh. */
function p256Key(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    publicKey: ecdh.getPublicKey().toString("base64url"),
    privateKey: ecdh.getPrivateKey().toString("base64url"),
  };
}

function deviceSubscription(
  endpoint = `https://fcm.googleapis.com/fcm/send/${randomBytes(8).toString("hex")}`,
) {
  return {
    endpoint,
    keys: { p256dh: p256Key().publicKey, auth: randomBytes(16).toString("base64url") },
  };
}

const savedEnv = { ...process.env };
beforeEach(() => {
  const vapid = p256Key();
  process.env.VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.VAPID_PRIVATE_KEY = vapid.privateKey;
  webPush.sendNotification.mockReset();
});
afterEach(() => {
  process.env = { ...savedEnv };
});

async function seedWg() {
  return seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
    tom: placeholderMember("Tom"),
  });
}

const pushesFor = (uid: string) => sentPushes.filter((push) => push.uid === uid);

describe("actions queue their pushes", () => {
  it("addExpense: everyone involved but the person entering it — placeholders never", async () => {
    await seedWg();
    signInAs({ uid: "max" });
    const result = await addExpense({
      groupId: "g1",
      description: "Einkauf",
      amountMinor: 9000,
      currency: "EUR",
      date: "2026-09-20",
      category: "groceries",
      emoji: null,
      paidBy: { lea: 9000 },
      splitMode: "equal",
      participantUids: ["max", "lea", "tom"],
      splitInputs: {},
      viaLottery: false,
    });
    if (!result.ok) throw new Error(result.error);

    expect(sentPushes.map((push) => push.uid)).toEqual(["lea"]);
    expect(sentPushes[0]).toMatchObject({
      event: "expense",
      tag: `expense-${result.data.expenseId}`,
      body: [
        { key: "push.expenseAdded", vars: { actor: "Max", description: "Einkauf" } },
        { key: "push.impactGetBack" },
      ],
    });
  });

  it("recordSettlement: the receiver hears about it, unless they entered it", async () => {
    await seedWg();
    signInAs({ uid: "ben" });
    const payment = {
      groupId: "g1",
      fromUid: "ben",
      toUid: "lea",
      amountMinor: 2000,
      currency: "EUR",
      date: "2026-09-21",
      note: "",
    };
    expect((await recordSettlement(payment)).ok).toBe(true);
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0]).toMatchObject({ uid: "lea", event: "settlement" });

    signInAs({ uid: "lea" });
    expect((await recordSettlement(payment)).ok).toBe(true);
    expect(sentPushes).toHaveLength(1);
  });

  it("an online duel: challenge, then 'your match is waiting', then 'your turn'", async () => {
    await seedWg();
    signInAs({ uid: "max" });
    const created = await createTournament({
      groupId: "g1",
      gameId: "tictactoe",
      poolUids: ["max", "lea"],
      targetLoserCount: 1,
      stake: null,
      playMode: "online",
    });
    if (!created.ok) throw new Error(created.error);
    const { tournamentId } = created.data;
    expect(sentPushes.map((push) => [push.uid, push.event])).toEqual([["lea", "challenge"]]);

    const tournamentRef = adminDb.doc(`groups/g1/tournaments/${tournamentId}`);
    const matchId = Object.keys((await tournamentRef.get()).get("matches"))[0];
    expect((await openOnlineMatch({ groupId: "g1", tournamentId, matchId })).ok).toBe(true);
    expect(pushesFor("lea").map((push) => push.event)).toEqual(["challenge", "turn"]);
    expect(pushesFor("lea")[1]).toMatchObject({
      body: [{ key: "push.turnReady", vars: { name: "Max" } }],
      unlessWatching: { groupId: "g1", tournamentId },
    });

    // Opening it again (the other phone arriving) is idempotent — no second push.
    expect((await openOnlineMatch({ groupId: "g1", tournamentId, matchId })).ok).toBe(true);
    expect(pushesFor("lea")).toHaveLength(2);

    const live = await tournamentRef.collection("liveMatches").doc(matchId).get();
    const [first, second] = live.get("players") as [string, string];
    signInAs({ uid: first });
    const moved = await playOnlineMove({
      groupId: "g1",
      tournamentId,
      matchId,
      move: { kind: "cell", index: 4 },
    });
    if (!moved.ok) throw new Error(moved.error);
    const last = sentPushes.at(-1)!;
    expect(last).toMatchObject({
      uid: second,
      event: "turn",
      tag: `turn-${tournamentId}-${matchId}`,
    });
    expect(last.body[0]).toMatchObject({ key: "push.turnMove" });
  });

  it("the recurring cron: a push for every booking, to everyone involved", async () => {
    const groupRef = await seedWg();
    await seedRecurringRule(groupRef, "max", ["max", "lea"]);
    await materializeDueRecurringRules("2026-09-01");
    expect(sentPushes.map((push) => push.uid).sort()).toEqual(["lea", "max"]);
    expect(sentPushes[0].body[0]).toMatchObject({ key: "push.expenseRecurring" });
  });
});

describe("subscriptions", () => {
  it("stores a device's subscription server-side, one account per endpoint", async () => {
    signInAs({ uid: "max" });
    const device = deviceSubscription();
    expect(await savePushSubscription({ ...device, locale: "en" })).toEqual({
      ok: true,
      data: null,
    });
    const stored = (await subscriptionRef(device.endpoint).get()).data();
    expect(stored).toMatchObject({ uid: "max", endpoint: device.endpoint, locale: "en" });

    // Someone else signs in on the same phone and turns push on: it changes hands.
    signInAs({ uid: "lea" });
    expect((await savePushSubscription({ ...device, locale: "de" })).ok).toBe(true);
    const all = await adminDb.collection(PUSH_SUBSCRIPTIONS).get();
    expect(all.docs.map((doc) => doc.get("uid"))).toEqual(["lea"]);
  });

  it("refuses endpoints outside the known push services, and malformed keys", async () => {
    signInAs({ uid: "max" });
    const device = deviceSubscription();
    for (const input of [
      { ...device, endpoint: "https://evil.example.com/push" },
      { ...device, endpoint: "http://fcm.googleapis.com/fcm/send/x" },
      { ...device, keys: { ...device.keys, auth: "short" } },
      { ...device, keys: { ...device.keys, p256dh: randomBytes(65).toString("base64url") } },
    ]) {
      expect(await savePushSubscription({ ...input, locale: "de" })).toEqual({
        ok: false,
        error: "invalid-subscription",
      });
    }
  });

  it("only removes your own", async () => {
    signInAs({ uid: "max" });
    const device = deviceSubscription();
    await savePushSubscription({ ...device, locale: "de" });
    signInAs({ uid: "lea" });
    await removePushSubscription({ endpoint: device.endpoint });
    expect((await subscriptionRef(device.endpoint).get()).exists).toBe(true);
    signInAs({ uid: "max" });
    await removePushSubscription({ endpoint: device.endpoint });
    expect((await subscriptionRef(device.endpoint).get()).exists).toBe(false);
  });

  it("is off without VAPID keys", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    signInAs({ uid: "max" });
    expect(await savePushSubscription({ ...deviceSubscription(), locale: "de" })).toEqual({
      ok: false,
      error: "push-not-configured",
    });
  });
});

describe("delivery", () => {
  const push = (uid: string, extra: Partial<PendingPush> = {}): PendingPush => ({
    uid,
    event: "expense",
    title: { key: "push.groupTitle", vars: { group: "WG Küche" } },
    body: [{ key: "push.settlementReceived", vars: { from: "Ben", amount: "20,00 €" } }],
    url: "/groups/g1",
    tag: "t",
    ttlSeconds: 60,
    ...extra,
  });

  async function subscribe(uid: string, locale = "de") {
    signInAs({ uid });
    const device = deviceSubscription();
    await savePushSubscription({ ...device, locale });
    return device;
  }

  it("writes each device's push in that device's language", async () => {
    await subscribe("lea", "en");
    const sent: string[] = [];
    const send: PushSender = async (_subscription, payload) => {
      sent.push(payload);
    };
    expect(await deliverPushes([push("lea")], send)).toEqual({
      sent: 1,
      failed: 0,
      removed: 0,
      skipped: 0,
    });
    expect(JSON.parse(sent[0])).toEqual({
      title: "WG Küche",
      body: "Ben paid you 20,00 €",
      url: "/groups/g1",
      tag: "t",
    });
  });

  it("honors the per-event switches", async () => {
    await subscribe("lea");
    signInAs({ uid: "lea" });
    expect(
      await updateNotificationPrefs({
        expense: false,
        settlement: true,
        challenge: true,
        turn: true,
        chat: true,
      }),
    ).toEqual({ ok: true, data: null });
    const send = vi.fn<PushSender>(async () => {});
    const report = await deliverPushes([push("lea"), push("lea", { event: "settlement" })], send);
    expect(report).toMatchObject({ sent: 1, skipped: 1 });
    expect(await updateNotificationPrefs({ expense: "no" } as never)).toEqual({
      ok: false,
      error: "invalid-prefs",
    });
  });

  it("skips 'your turn' for a player who is watching the game", async () => {
    await seedWg();
    await subscribe("lea");
    const turn = push("lea", {
      event: "turn",
      unlessWatching: { groupId: "g1", tournamentId: "t1" },
    });
    const send = vi.fn<PushSender>(async () => {});

    signInAs({ uid: "lea" });
    expect(
      (await markTournamentPresence({ groupId: "g1", tournamentId: "t1", watching: true })).ok,
    ).toBe(true);
    expect(await deliverPushes([turn], send)).toMatchObject({ sent: 0, skipped: 1 });

    await markTournamentPresence({ groupId: "g1", tournamentId: "t1", watching: false });
    expect(await deliverPushes([turn], send)).toMatchObject({ sent: 1, skipped: 0 });
  });

  it("drops a subscription its push service says is gone", async () => {
    const device = await subscribe("lea");
    const send: PushSender = async () => {
      throw Object.assign(new Error("Gone"), { statusCode: 410 });
    };
    expect(await deliverPushes([push("lea")], send)).toMatchObject({ sent: 0, removed: 1 });
    expect((await subscriptionRef(device.endpoint).get()).exists).toBe(false);
  });

  it("sends the profile's test push through web-push with our VAPID keys", async () => {
    signInAs({ uid: "max" });
    expect(await sendTestPush()).toEqual({ ok: false, error: "not-delivered" });

    const device = await subscribe("max");
    signInAs({ uid: "max" });
    expect(await sendTestPush()).toEqual({ ok: true, data: { sent: 1 } });
    const [subscription, payload, options] = webPush.sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: device.endpoint, keys: expect.any(Object) });
    expect(JSON.parse(payload)).toMatchObject({ title: "Split", url: "/profile" });
    expect(options).toMatchObject({
      TTL: 60,
      vapidDetails: {
        publicKey: process.env.VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      },
    });
  });
});

describe("nudgeOpponent", () => {
  let tournamentId: string;
  let matchId: string;
  /** players[0] moved first, so they're the one waiting; players[1] is to move. */
  let waiter: string;
  let mover: string;

  const liveRef = () => adminDb.doc(`groups/g1/tournaments/${tournamentId}/liveMatches/${matchId}`);
  const nudgeRef = () => adminDb.doc(`groups/g1/tournaments/${tournamentId}/nudges/${matchId}`);
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const nudge = () => {
    signInAs({ uid: waiter });
    return nudgeOpponent({ groupId: "g1", tournamentId, matchId });
  };

  beforeEach(async () => {
    await seedWg();
    signInAs({ uid: "max" });
    const created = await createTournament({
      groupId: "g1",
      gameId: "tictactoe",
      poolUids: ["max", "lea"],
      targetLoserCount: 1,
      stake: null,
      playMode: "online",
    });
    if (!created.ok) throw new Error(created.error);
    tournamentId = created.data.tournamentId;
    matchId = Object.keys(
      (await adminDb.doc(`groups/g1/tournaments/${tournamentId}`).get()).get("matches"),
    )[0];
    const opened = await openOnlineMatch({ groupId: "g1", tournamentId, matchId });
    if (!opened.ok) throw new Error(opened.error);
    [waiter, mover] = (await liveRef().get()).get("players") as [string, string];
    signInAs({ uid: waiter });
    const moved = await playOnlineMove({
      groupId: "g1",
      tournamentId,
      matchId,
      move: { kind: "cell", index: 4 },
    });
    if (!moved.ok) throw new Error(moved.error);
    sentPushes.length = 0;
  });

  it("waits until the board has stood still for a while", async () => {
    expect(await nudge()).toEqual({ ok: false, error: "too-early" });
  });

  it("buzzes the player on the move, then lets it sink in", async () => {
    await liveRef().update({ updatedAt: minutesAgo(3) });
    signInAs({ uid: mover });
    expect((await savePushSubscription({ ...deviceSubscription(), locale: "de" })).ok).toBe(true);

    expect(await nudge()).toEqual({ ok: true, data: { reach: "push" } });
    expect(pushesFor(mover)).toHaveLength(1);
    expect(pushesFor(mover)[0]).toMatchObject({
      event: "turn",
      body: [
        {
          key: "push.turnNudge",
          vars: { game: { key: "expenses.ticTacToeTitle" }, group: "WG Küche" },
        },
      ],
    });
    expect(pushesFor(mover)[0].tag).toMatch(new RegExp(`^nudge-${tournamentId}-${matchId}-`));

    expect(await nudge()).toEqual({ ok: false, error: "too-early" });
    await nudgeRef().update({ at: minutesAgo(11) });
    expect((await nudge()).ok).toBe(true);
  });

  it("says when the push can't reach them", async () => {
    await liveRef().update({ updatedAt: minutesAgo(3) });
    expect(await nudge()).toEqual({ ok: true, data: { reach: "off" } });
    expect(pushesFor(mover)).toEqual([]);
  });

  it("says when they're looking at the game already", async () => {
    await liveRef().update({ updatedAt: minutesAgo(3) });
    signInAs({ uid: mover });
    expect((await savePushSubscription({ ...deviceSubscription(), locale: "de" })).ok).toBe(true);
    expect((await markTournamentPresence({ groupId: "g1", tournamentId, watching: true })).ok).toBe(
      true,
    );
    expect(await nudge()).toEqual({ ok: true, data: { reach: "watching" } });
    expect(pushesFor(mover)).toEqual([]);
  });

  it("refuses the player on the move and a bystander", async () => {
    await liveRef().update({ updatedAt: minutesAgo(3) });
    signInAs({ uid: mover });
    expect(await nudgeOpponent({ groupId: "g1", tournamentId, matchId })).toEqual({
      ok: false,
      error: "not-waiting",
    });
    signInAs({ uid: "ben" });
    expect(await nudgeOpponent({ groupId: "g1", tournamentId, matchId })).toEqual({
      ok: false,
      error: "not-a-player",
    });
  });
});
