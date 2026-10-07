"use server";

import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getSession } from "@/lib/auth/session";
import {
  CLIENT_MESSAGE_ID,
  MAX_MESSAGE_LENGTH,
  MAX_REPLY_PREVIEW_LENGTH,
  MESSAGE_ID,
  isChatReactionId,
} from "@/lib/chat/constants";
import { findMentionedUids, shortenText } from "@/lib/chat/rich-text";
import { adminDb } from "@/lib/firebase/admin";
import { chatPushes } from "@/lib/push/messages";
import { notifyAfterResponse } from "@/lib/push/notify";
import type { ChatMessage, ChatReply, Group } from "@/lib/types";
import type { ActionResult } from "./groups";

/** Firestore's gRPC status codes, as the Admin SDK reports them on `error.code`. */
const NOT_FOUND = 5;
const ALREADY_EXISTS = 6;

async function requireGroupMembership(
  groupId: string,
  uid: string,
): Promise<
  | { error: "not-found" | "forbidden" }
  | { groupRef: FirebaseFirestore.DocumentReference; group: Omit<Group, "id"> }
> {
  const groupRef = adminDb.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { groupRef, group };
}

/**
 * Posts a message. `clientId` (a UUID the sender made up) becomes the
 * message's id, which makes a retry safe: if the first request reached us but
 * its answer got lost, sending it again returns the message that's already
 * there instead of posting a second one. `replyToId` quotes another message —
 * the quote is copied from it here, never taken from the client.
 */
export async function sendMessage(input: {
  groupId: string;
  text: string;
  clientId?: string;
  replyToId?: string;
}): Promise<ActionResult<{ messageId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const text = input.text.trim();
  if (!text) return { ok: false, error: "invalid-text" };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "text-too-long" };
  if (input.clientId !== undefined && !CLIENT_MESSAGE_ID.test(input.clientId)) {
    return { ok: false, error: "invalid-id" };
  }
  if (input.replyToId !== undefined && !MESSAGE_ID.test(input.replyToId)) {
    return { ok: false, error: "invalid-id" };
  }

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };
  const { group, groupRef } = membership;
  const messages = groupRef.collection("messages");

  let replyTo: ChatReply | null = null;
  if (input.replyToId) {
    const quoted = await messages.doc(input.replyToId).get();
    // A quote whose original is gone by now is simply left off: the reply itself still goes out.
    if (quoted.exists) {
      replyTo = {
        id: quoted.id,
        senderUid: quoted.get("senderUid"),
        text: shortenText(String(quoted.get("text") ?? ""), MAX_REPLY_PREVIEW_LENGTH),
      };
    }
  }

  const mentions = findMentionedUids(
    text,
    Object.entries(group.members)
      .filter(([uid]) => group.memberUids.includes(uid) && uid !== session.uid)
      .map(([uid, member]) => ({ uid, displayName: member.displayName })),
  );

  const message: Omit<ChatMessage, "id"> = {
    senderUid: session.uid,
    text,
    createdAt: new Date().toISOString(),
    ...(replyTo ? { replyTo } : {}),
    ...(mentions.length > 0 ? { mentions } : {}),
  };

  const docRef = input.clientId ? messages.doc(input.clientId) : messages.doc();
  try {
    await docRef.create(message);
  } catch (error) {
    if ((error as { code?: number }).code !== ALREADY_EXISTS) throw error;
    // The retry of a send that did go through — but only ever for its own sender.
    const existing = await docRef.get();
    if (existing.get("senderUid") !== session.uid) return { ok: false, error: "invalid-id" };
    return { ok: true, data: { messageId: docRef.id } };
  }

  notifyAfterResponse(
    chatPushes({
      groupId: input.groupId,
      group,
      text,
      actorUid: session.uid,
      mentions,
    }),
  );
  return { ok: true, data: { messageId: docRef.id } };
}

/**
 * Adds or takes back the caller's own reaction. Says what the end state
 * should be (`active`) rather than "toggle", so a repeated request — a retry,
 * a double tap — can't flip it back.
 */
export async function setChatReaction(input: {
  groupId: string;
  messageId: string;
  reaction: string;
  active: boolean;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  if (
    !isChatReactionId(input.reaction) ||
    typeof input.active !== "boolean" ||
    typeof input.messageId !== "string" ||
    !MESSAGE_ID.test(input.messageId)
  ) {
    return { ok: false, error: "invalid-reaction" };
  }

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  try {
    await membership.groupRef
      .collection("messages")
      .doc(input.messageId)
      .update(
        new FieldPath("reactions", input.reaction),
        input.active ? FieldValue.arrayUnion(session.uid) : FieldValue.arrayRemove(session.uid),
      );
  } catch (error) {
    if ((error as { code?: number }).code === NOT_FOUND) return { ok: false, error: "not-found" };
    throw error;
  }
  return { ok: true, data: null };
}

export async function deleteMessage(input: {
  groupId: string;
  messageId: string;
}): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const messageRef = membership.groupRef.collection("messages").doc(input.messageId);
  const messageSnap = await messageRef.get();
  if (!messageSnap.exists) return { ok: false, error: "not-found" };
  const message = messageSnap.data() as ChatMessage;

  if (message.senderUid !== session.uid) return { ok: false, error: "not-owner" };

  await messageRef.delete();
  return { ok: true, data: null };
}

/**
 * Upserts the caller's read receipt for the group's chat to "now". Doc id ==
 * uid (see ChatRead in lib/types.ts), so this always targets exactly the
 * caller's own receipt — no id needs to be passed in.
 */
export async function markChatRead(input: { groupId: string }): Promise<ActionResult<null>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  await membership.groupRef
    .collection("chatReads")
    .doc(session.uid)
    .set({ lastReadAt: new Date().toISOString() });

  return { ok: true, data: null };
}
