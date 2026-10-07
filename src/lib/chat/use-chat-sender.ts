"use client";

import { useCallback, useMemo, useState } from "react";
import { sendMessage } from "@/lib/actions/messages";
import { callAction } from "@/lib/call-action";
import { newClientMessageId } from "@/lib/chat/client-id";
import type { ChatMessage, ChatReply } from "@/lib/types";

/**
 * A message the user has sent that the chat listener hasn't delivered back yet.
 * Shown at once instead of after the server round trip; `failed` stays on
 * screen with a way to send it again, so a failed send is never mistaken for a
 * slow one (and the text is never lost).
 */
export interface PendingMessage {
  /** The id the message will have — sent as `clientId`, so a retry can't double-post it. */
  id: string;
  text: string;
  createdAt: string;
  replyTo: ChatReply | null;
  /** `sent`: the server has it, the snapshot hasn't caught up yet. */
  status: "sending" | "sent" | "failed";
}

/**
 * Sends chat messages optimistically. `messages` is what the screen's listener
 * currently holds — a pending message drops out of `pending` the moment its id
 * shows up there (also when the answer to its request was lost but the server
 * did write it). Callers disable sending while offline (Server Actions can't
 * be queued); this only handles what happens once a send has started.
 */
export function useChatSender(groupId: string, messages: readonly ChatMessage[] | null) {
  const [entries, setEntries] = useState<PendingMessage[]>([]);
  const delivered = useMemo(() => new Set(messages?.map((message) => message.id)), [messages]);
  const pending = useMemo(
    () => entries.filter((entry) => !delivered.has(entry.id)),
    [entries, delivered],
  );

  const run = useCallback(
    async (item: PendingMessage) => {
      const result = await callAction(() =>
        sendMessage({
          groupId,
          text: item.text,
          clientId: item.id,
          ...(item.replyTo ? { replyToId: item.replyTo.id } : {}),
        }),
      );
      setEntries((list) =>
        list.map((entry) =>
          entry.id === item.id ? { ...entry, status: result.ok ? "sent" : "failed" } : entry,
        ),
      );
    },
    [groupId],
  );

  const send = useCallback(
    (text: string, replyTo: ChatReply | null) => {
      const item: PendingMessage = {
        id: newClientMessageId(),
        text,
        createdAt: new Date().toISOString(),
        replyTo,
        status: "sending",
      };
      // Delivered ones are dropped here, so the list doesn't grow all session.
      setEntries((list) => [...list.filter((entry) => !delivered.has(entry.id)), item]);
      void run(item);
    },
    [run, delivered],
  );

  const retry = useCallback(
    (id: string) => {
      const item = entries.find((entry) => entry.id === id);
      if (!item || item.status !== "failed") return;
      const again: PendingMessage = { ...item, status: "sending" };
      setEntries((list) => list.map((entry) => (entry.id === id ? again : entry)));
      void run(again);
    },
    [entries, run],
  );

  const discard = useCallback((id: string) => {
    setEntries((list) => list.filter((entry) => entry.id !== id));
  }, []);

  return { pending, send, retry, discard };
}
