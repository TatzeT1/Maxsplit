"use server";

import { getSession } from "@/lib/auth/session";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { adminDb } from "@/lib/firebase/admin";
import type { ChatMessage, Group } from "@/lib/types";
import type { ActionResult } from "./groups";

async function requireGroupMembership(
  groupId: string,
  uid: string,
): Promise<
  { error: "not-found" | "forbidden" } | { groupRef: FirebaseFirestore.DocumentReference }
> {
  const groupRef = adminDb.collection("groups").doc(groupId);
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return { error: "not-found" };
  const group = groupSnap.data() as Omit<Group, "id">;
  if (!group.memberUids.includes(uid)) return { error: "forbidden" };
  return { groupRef };
}

export async function sendMessage(input: {
  groupId: string;
  text: string;
}): Promise<ActionResult<{ messageId: string }>> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };

  const text = input.text.trim();
  if (!text) return { ok: false, error: "invalid-text" };
  if (text.length > MAX_MESSAGE_LENGTH) return { ok: false, error: "text-too-long" };

  const membership = await requireGroupMembership(input.groupId, session.uid);
  if ("error" in membership) return { ok: false, error: membership.error };

  const message: Omit<ChatMessage, "id"> = {
    senderUid: session.uid,
    text,
    createdAt: new Date().toISOString(),
  };

  const docRef = await membership.groupRef.collection("messages").add(message);
  return { ok: true, data: { messageId: docRef.id } };
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
