"use client";

import { collection, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { MessageCircle, Send } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { sendMessage, markChatRead } from "@/lib/actions/messages";
import { callAction } from "@/lib/call-action";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { useOnline } from "@/lib/use-online";
import { cn } from "@/lib/utils";
import type { ChatMessage, GroupMember } from "@/lib/types";

const VISIBLE_MESSAGES = 40;

/**
 * The group chat, pinned under a running online match so nobody has to leave
 * the game to trash-talk. Same `messages` collection as the chat screen — what
 * is written here shows up there and vice versa — just a compact view of the
 * latest messages with a composer.
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
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!user || !newestId || !online) return;
    markChatRead({ groupId }).catch(() => {});
  }, [groupId, user, newestId, online]);

  // Scroll the list itself — never the page, which would yank the board away.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || sending || !online) return;
    setSending(true);
    setSendError(null);
    const result = await callAction(() => sendMessage({ groupId, text: trimmed }));
    setSending(false);
    if (!result.ok) {
      setSendError(
        result.error === "text-too-long"
          ? t("chat.errorTooLong", { count: MAX_MESSAGE_LENGTH })
          : t("chat.sendError"),
      );
      return;
    }
    setText("");
    textareaRef.current?.focus();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

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
          ) : messages.length === 0 ? (
            <p className="text-muted-foreground text-xs">{t("chat.empty")}</p>
          ) : (
            messages.map((message) => {
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
                    {message.text}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {sendError && <p className="text-destructive px-1 text-xs">{sendError}</p>}
      <form
        onSubmit={handleSubmit}
        className="border-input bg-card/70 focus-within:border-ring focus-within:ring-ring/50 flex items-end gap-1.5 rounded-3xl border p-1.5 pl-4 transition-colors focus-within:ring-3"
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.placeholder")}
          enterKeyHint="send"
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          // text-base (16px) on mobile is load-bearing: below it iOS Safari
          // zooms the page on focus (see AGENTS.md).
          className="placeholder:text-muted-foreground max-h-24 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base outline-none md:text-sm"
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-full"
          disabled={sending || !text.trim() || !online}
          aria-label={t("chat.send")}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </section>
  );
}
