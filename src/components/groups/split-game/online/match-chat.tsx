"use client";

import { collection, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ChatComposer } from "@/components/groups/chat-composer";
import { RichText } from "@/components/groups/chat-message";
import { useT } from "@/components/locale-provider";
import { markChatRead } from "@/lib/actions/messages";
import { useChatSender } from "@/lib/chat/use-chat-sender";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useOnline } from "@/lib/use-online";
import { usePageVisible } from "@/lib/use-page-visible";
import { cn } from "@/lib/utils";
import type { ChatMessage, GroupMember } from "@/lib/types";

const VISIBLE_MESSAGES = 40;

/**
 * The group chat, pinned under a running online match so nobody has to leave
 * the game to trash-talk. Same `messages` collection as the chat screen — what
 * is written here shows up there and vice versa — just a compact view of the
 * latest messages with the same composer (and the same safe, retryable send).
 */
export function MatchChat({
  groupId,
  members,
  currentUid,
}: {
  groupId: string;
  members: Record<string, GroupMember>;
  currentUid: string;
}) {
  const t = useT();
  const user = useCurrentUser();
  const online = useOnline();
  const pageVisible = usePageVisible();
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sender = useChatSender(groupId, messages);

  useEffect(() => {
    if (!user) return;
    const messagesQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(VISIBLE_MESSAGES),
    );
    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
      },
      (error) => {
        setErrorCode(reportSnapshotError("match-chat", error));
      },
    );
  }, [groupId, user]);

  // Seen here counts as read, so the group page's badge doesn't light up for
  // messages you watched arrive mid-game. Best effort, like the chat screen.
  const newestId = messages?.at(-1)?.id ?? null;
  useEffect(() => {
    if (!user || !newestId || !online || !pageVisible) return;
    markChatRead({ groupId }).catch(() => {});
  }, [groupId, user, newestId, online, pageVisible]);

  // Scroll the list itself — never the page, which would yank the board away.
  const pendingCount = sender.pending.length;
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, pendingCount]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !online) return;
    sender.send(trimmed, null);
    setText("");
    textareaRef.current?.focus();
  }

  const mentionCandidates = Object.entries(members)
    .filter(([uid, member]) => uid !== currentUid && member.isPlaceholder !== true)
    .map(([uid, member]) => ({ uid, displayName: member.displayName }));

  return (
    <section aria-label={t("chat.title")} className="flex flex-col gap-2 rounded-xl border p-3">
      <h3 className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase">
        <MessageCircle aria-hidden="true" className="size-3.5" />
        {t("chat.title")}
      </h3>

      {errorCode ? (
        <div role="alert" className="text-destructive text-xs">
          <p className="font-medium">{t("errors.dataLoadFailed")}</p>
          <p>{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      ) : (
        <div
          ref={listRef}
          aria-live="polite"
          className="flex max-h-48 min-h-16 flex-col gap-1.5 overflow-y-auto"
        >
          {messages === null ? (
            <p aria-busy="true" className="text-muted-foreground text-xs">
              …
            </p>
          ) : messages.length === 0 && sender.pending.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("chat.empty")}</p>
          ) : (
            <>
              {messages.map((message) => {
                const own = message.senderUid === currentUid;
                return (
                  <div
                    key={message.id}
                    className={cn("flex max-w-full flex-col", own ? "items-end" : "items-start")}
                  >
                    {!own && (
                      <span className="text-muted-foreground px-1 text-[10px]">
                        {members[message.senderUid]?.displayName ?? "?"}
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
                        own
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md",
                      )}
                    >
                      <RichText
                        text={message.text}
                        mentionNames={(message.mentions ?? []).map(
                          (uid) => members[uid]?.displayName ?? "",
                        )}
                        isOwn={own}
                      />
                    </div>
                  </div>
                );
              })}
              {sender.pending.map((item) => (
                <div key={item.id} className="flex max-w-full flex-col items-end">
                  <div
                    className={cn(
                      "bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
                      item.status === "sending" && "opacity-70",
                      item.status === "failed" && "ring-destructive ring-2",
                    )}
                  >
                    <RichText text={item.text} isOwn />
                  </div>
                  {item.status === "failed" && (
                    <p
                      role="alert"
                      className="text-destructive flex items-center gap-2 px-1 text-xs"
                    >
                      <span className="font-medium">{t("chat.notSent")}</span>
                      <button
                        type="button"
                        disabled={!online}
                        onClick={() => sender.retry(item.id)}
                        className="underline underline-offset-2 disabled:opacity-50"
                      >
                        {t("chat.retrySend")}
                      </button>
                      <button
                        type="button"
                        onClick={() => sender.discard(item.id)}
                        className="underline underline-offset-2"
                      >
                        {t("chat.discard")}
                      </button>
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <ChatComposer
        value={text}
        onChange={setText}
        onSend={handleSend}
        online={online}
        mentionCandidates={mentionCandidates}
        textareaRef={textareaRef}
        compact
      />
    </section>
  );
}
