import { describe, expect, it } from "vitest";
import { addExpense } from "@/lib/actions/expenses";
import { sendMessage, setChatReaction } from "@/lib/actions/messages";
import { setChatMuted } from "@/lib/actions/notifications";
import { recordSettlement } from "@/lib/actions/settlements";
import { adminDb } from "@/lib/firebase/admin";
import { realMember, seedGroup } from "@/test/fixtures";
import { sentPushes } from "@/test/push-mock";
import { signInAs } from "@/test/session-mock";
import type { ChatMessage } from "@/lib/types";

// The group chat's Server Actions against the Firestore emulator: sending
// (retry-safe, with a quote and @mentions), reactions, the per-group mute and
// the silent cards expenses and payments post.

async function seedWg() {
  return seedGroup("g1", {
    max: realMember("Max", { role: "owner" }),
    lea: realMember("Lea"),
    ben: realMember("Ben"),
  });
}

const messagesOf = async (groupRef: FirebaseFirestore.DocumentReference) =>
  (await groupRef.collection("messages").orderBy("createdAt").get()).docs.map(
    (doc) => ({ id: doc.id, ...doc.data() }) as ChatMessage,
  );

describe("sendMessage", () => {
  it("posts the text and pushes everyone else", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    const result = await sendMessage({ groupId: "g1", text: "  Wer kauft Milch?  " });
    expect(result.ok).toBe(true);
    const [message] = await messagesOf(groupRef);
    expect(message).toMatchObject({ senderUid: "max", text: "Wer kauft Milch?" });
    expect(message).not.toHaveProperty("replyTo");
    expect(message).not.toHaveProperty("mentions");
    expect(sentPushes.map((push) => push.uid).sort()).toEqual(["ben", "lea"]);
  });

  it("is idempotent for a client id: a retry returns the same message and pushes once", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    const clientId = "0b9c2e0e-6e0a-4b3a-9d52-1f7c0a1b2c3d";
    const first = await sendMessage({ groupId: "g1", text: "Hallo", clientId });
    const second = await sendMessage({ groupId: "g1", text: "Hallo", clientId });
    expect(first).toEqual({ ok: true, data: { messageId: clientId } });
    expect(second).toEqual({ ok: true, data: { messageId: clientId } });
    expect(await messagesOf(groupRef)).toHaveLength(1);
    expect(sentPushes).toHaveLength(2); // lea + ben, once
  });

  it("does not let someone else take over a client id", async () => {
    await seedWg();
    const clientId = "0b9c2e0e-6e0a-4b3a-9d52-1f7c0a1b2c3d";
    signInAs({ uid: "max" });
    await sendMessage({ groupId: "g1", text: "Meins", clientId });
    signInAs({ uid: "lea" });
    expect(await sendMessage({ groupId: "g1", text: "Deins", clientId })).toEqual({
      ok: false,
      error: "invalid-id",
    });
  });

  it.each([
    [{ clientId: "short" }],
    [{ clientId: "has/slash/in/the/id/xxxxxxxx" }],
    [{ replyToId: "a/b" }],
  ])("rejects a malformed id %o", async (patch) => {
    await seedWg();
    signInAs({ uid: "max" });
    expect(await sendMessage({ groupId: "g1", text: "Hi", ...patch })).toEqual({
      ok: false,
      error: "invalid-id",
    });
  });

  it("refuses a non-member", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "stranger" });
    expect(await sendMessage({ groupId: "g1", text: "Hi" })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await messagesOf(groupRef)).toHaveLength(0);
  });

  it("quotes the message it answers, copied by the server", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "lea" });
    const original = await sendMessage({ groupId: "g1", text: "x".repeat(300) });
    if (!original.ok) throw new Error(original.error);
    signInAs({ uid: "max" });
    const reply = await sendMessage({
      groupId: "g1",
      text: "Okay",
      replyToId: original.data.messageId,
    });
    if (!reply.ok) throw new Error(reply.error);
    const stored = (await groupRef.collection("messages").doc(reply.data.messageId).get()).data();
    expect(stored?.replyTo).toMatchObject({ id: original.data.messageId, senderUid: "lea" });
    expect(stored?.replyTo.text).toHaveLength(140);
    expect(stored?.replyTo.text.endsWith("…")).toBe(true);
  });

  it("still sends a reply whose original is gone, just without the quote", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    const result = await sendMessage({ groupId: "g1", text: "Okay", replyToId: "gone" });
    expect(result.ok).toBe(true);
    const [message] = await messagesOf(groupRef);
    expect(message).not.toHaveProperty("replyTo");
  });

  it("works out who is mentioned and pushes them even when they muted the chat", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    expect(
      await sendMessage({ groupId: "g1", text: "@Lea bringst du Brot mit? @max" }),
    ).toMatchObject({ ok: true });
    const [message] = await messagesOf(groupRef);
    // Not oneself.
    expect(message.mentions).toEqual(["lea"]);
    const byUid = Object.fromEntries(sentPushes.map((push) => [push.uid, push]));
    expect(byUid.lea.body[0].key).toBe("push.chatMention");
    expect(byUid.lea.unlessMuted).toBeUndefined();
    expect(byUid.ben.body[0].key).toBe("push.chatMessage");
    expect(byUid.ben.unlessMuted).toEqual({ groupId: "g1" });
  });
});

describe("setChatReaction", () => {
  async function postAs(uid: string) {
    signInAs({ uid });
    const sent = await sendMessage({ groupId: "g1", text: "Pizza heute?" });
    if (!sent.ok) throw new Error(sent.error);
    return sent.data.messageId;
  }
  const reactionsOf = async (groupRef: FirebaseFirestore.DocumentReference, id: string) =>
    (await groupRef.collection("messages").doc(id).get()).get("reactions");

  it("adds a reaction once and takes it back", async () => {
    const groupRef = await seedWg();
    const messageId = await postAs("lea");
    signInAs({ uid: "max" });
    const add = { groupId: "g1", messageId, reaction: "up", active: true };
    expect(await setChatReaction(add)).toEqual({ ok: true, data: null });
    expect(await setChatReaction(add)).toEqual({ ok: true, data: null });
    signInAs({ uid: "ben" });
    await setChatReaction({ ...add, reaction: "up" });
    await setChatReaction({ ...add, reaction: "done" });
    expect(await reactionsOf(groupRef, messageId)).toEqual({
      up: ["max", "ben"],
      done: ["ben"],
    });

    signInAs({ uid: "max" });
    await setChatReaction({ ...add, active: false });
    await setChatReaction({ ...add, active: false });
    expect((await reactionsOf(groupRef, messageId)).up).toEqual(["ben"]);
  });

  it("only knows the fixed reactions and real messages", async () => {
    const groupRef = await seedWg();
    const messageId = await postAs("lea");
    signInAs({ uid: "max" });
    expect(
      await setChatReaction({ groupId: "g1", messageId, reaction: "poop", active: true }),
    ).toEqual({ ok: false, error: "invalid-reaction" });
    expect(
      await setChatReaction({ groupId: "g1", messageId: "nope", reaction: "up", active: true }),
    ).toEqual({ ok: false, error: "not-found" });
    expect(await reactionsOf(groupRef, messageId)).toBeUndefined();
  });

  it("refuses a non-member", async () => {
    await seedWg();
    const messageId = await postAs("lea");
    signInAs({ uid: "stranger" });
    expect(
      await setChatReaction({ groupId: "g1", messageId, reaction: "up", active: true }),
    ).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("setChatMuted", () => {
  const mutedOf = async (uid: string) =>
    (await adminDb.doc(`users/${uid}`).get()).get("mutedChatGroupIds");

  it("remembers a silenced group once, and forgets it again", async () => {
    await seedWg();
    signInAs({ uid: "max" });
    expect(await setChatMuted({ groupId: "g1", muted: true })).toEqual({ ok: true, data: null });
    await setChatMuted({ groupId: "g1", muted: true });
    expect(await mutedOf("max")).toEqual(["g1"]);
    await setChatMuted({ groupId: "g1", muted: false });
    expect(await mutedOf("max")).toEqual([]);
  });

  it("only lets members silence a group", async () => {
    await seedWg();
    signInAs({ uid: "stranger" });
    expect(await setChatMuted({ groupId: "g1", muted: true })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setChatMuted({ groupId: "nope", muted: true })).toEqual({
      ok: false,
      error: "not-found",
    });
    expect(await setChatMuted({ groupId: "a/b", muted: true })).toEqual({
      ok: false,
      error: "invalid-group",
    });
  });
});

describe("cards in the chat", () => {
  const expense = {
    groupId: "g1",
    description: "Pizza",
    amountMinor: 3000,
    currency: "EUR",
    date: "2026-09-20",
    category: null,
    emoji: null,
    paidBy: { lea: 3000 },
    splitMode: "equal" as const,
    participantUids: ["max", "lea", "ben"],
    splitInputs: {},
    viaLottery: false,
  };

  it("an expense posts a silent card with the figures", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    const result = await addExpense(expense);
    if (!result.ok) throw new Error(result.error);
    const [message] = await messagesOf(groupRef);
    expect(message.senderUid).toBe("max");
    expect(message.expenseCard).toEqual({
      expenseId: result.data.expenseId,
      description: "Pizza",
      amountMinor: 3000,
      currency: "EUR",
      paidBy: { lea: 3000 },
      shares: { max: 1000, lea: 1000, ben: 1000 },
    });
    // The expense push is the only push — the card adds none of its own.
    expect(sentPushes.every((push) => push.event === "expense")).toBe(true);
  });

  it("a payment posts a silent card", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "ben" });
    const result = await recordSettlement({
      groupId: "g1",
      fromUid: "ben",
      toUid: "lea",
      amountMinor: 2000,
      currency: "EUR",
      date: "2026-09-21",
      note: "",
    });
    if (!result.ok) throw new Error(result.error);
    const [message] = await messagesOf(groupRef);
    expect(message.settlementCard).toEqual({
      settlementId: result.data.settlementId,
      fromUid: "ben",
      toUid: "lea",
      amountMinor: 2000,
      currency: "EUR",
    });
    expect(sentPushes.every((push) => push.event === "settlement")).toBe(true);
  });

  it("a rejected expense posts nothing", async () => {
    const groupRef = await seedWg();
    signInAs({ uid: "max" });
    expect((await addExpense({ ...expense, amountMinor: 0 })).ok).toBe(false);
    expect(await messagesOf(groupRef)).toHaveLength(0);
  });
});
