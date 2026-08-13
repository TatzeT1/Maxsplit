"use client";

import { collection, doc, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, MessageCircle, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteMessage, markChatRead, sendMessage } from "@/lib/actions/messages";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { formatDate, formatTime } from "@/lib/format/date";
import { avatarGradient, cn } from "@/lib/utils";
import type { ChatMessage, Group } from "@/lib/types";

const MAX_LOADED_MESSAGES = 300;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function MessageBubble({
  message,
  senderName,
  isOwn,
  showSender,
  groupId,
  onDeleteError,
}: {
  message: ChatMessage;
  senderName: string;
  isOwn: boolean;
  showSender: boolean;
  groupId: string;
  onDeleteError: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const t = useT();

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteMessage({ groupId, messageId: message.id });
    setDeleting(false);
    if (!result.ok) onDeleteError(t("chat.deleteError"));
  }

  return (
    <div
      className={cn(
        "animate-bubble-in flex flex-col gap-0.5",
        isOwn ? "origin-bottom-right items-end" : "origin-bottom-left items-start",
      )}
    >
      {showSender && !isOwn && (
        <div className="flex items-center gap-1.5 pl-1">
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-linear-to-br text-[9px] font-semibold text-white",
              avatarGradient(senderName),
            )}
          >
            {senderName.charAt(0).toUpperCase() || "?"}
          </div>
          <span className="text-muted-foreground text-xs font-medium">{senderName}</span>
        </div>
      )}
      <div className="group flex items-center gap-1.5">
        {isOwn && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={deleting}
                aria-label={t("common.delete")}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0 rounded-full p-1.5 opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("chat.deleteConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("chat.deleteConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        <div
          className={cn(
            "max-w-[75vw] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-sm",
            isOwn
              ? "from-primary to-primary/85 text-primary-foreground shadow-primary/20 rounded-br-md bg-linear-to-br shadow-md"
              : "bg-card ring-foreground/10 rounded-bl-md shadow-sm ring-1",
          )}
        >
          {message.text}
        </div>
      </div>
      <span className="text-muted-foreground px-1 text-[10px]">
        {formatTime(new Date(message.createdAt))}
      </span>
    </div>
  );
}

export function ChatClient({ groupId }: { groupId: string }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const t = useT();

  // Grows the composer with its content instead of leaving typed text
  // scrolling inside a fixed one-line box (rows={1} alone doesn't resize).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId),
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
      },
      (error) => {
        setErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user) return;
    const messagesQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(MAX_LOADED_MESSAGES),
    );
    return onSnapshot(
      messagesQuery,
      (snapshot) => {
        setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
      },
      (error) => {
        setErrorCode(reportSnapshotError("chat-messages", error));
      },
    );
  }, [groupId, user]);

  useEffect(() => {
    if (!user || messages === null) return;
    void markChatRead({ groupId });
  }, [groupId, user, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function submitMessage() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setActionError(null);
    const result = await sendMessage({ groupId, text: trimmed });
    setSending(false);
    if (!result.ok) {
      setActionError(
        result.error === "text-too-long"
          ? t("chat.errorTooLong", { count: MAX_MESSAGE_LENGTH })
          : t("chat.sendError"),
      );
      return;
    }
    setText("");
    // The send button click already moved focus away from the textarea,
    // which on mobile dismisses the keyboard after every single message.
    // Bring focus straight back so a chat back-and-forth doesn't require
    // re-tapping the input each time.
    textareaRef.current?.focus();
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    void submitMessage();
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submitMessage();
    }
  }

  if (user && errorCode) {
    return (
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
          <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
          <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
        </div>
      </div>
    );
  }

  if (!group || messages === null || !user) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-2/3 self-start" />
        <Skeleton className="h-16 w-2/3 self-end" />
        <Skeleton className="h-16 w-1/2 self-start" />
      </div>
    );
  }

  const memberCount = Object.keys(group.members).length;
  const memberCountLabel =
    memberCount === 1
      ? t("groups.memberCountSingular")
      : t("groups.membersCount", { count: memberCount });

  let previousDay = "";
  let previousSender = "";
  const items: {
    message: ChatMessage;
    showDivider: boolean;
    showSender: boolean;
    grouped: boolean;
  }[] = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const showDivider = key !== previousDay;
    const showSender = showDivider || message.senderUid !== previousSender;
    const grouped = !showDivider && message.senderUid === previousSender;
    items.push({ message, showDivider, showSender, grouped });
    previousDay = key;
    previousSender = message.senderUid;
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="bg-paper-texture absolute inset-0 opacity-[0.2]" />
        <div
          className={`motion-safe:animate-float-a absolute -top-16 -right-24 size-80 rounded-full bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.12] blur-3xl`}
        />
        <div
          className={`motion-safe:animate-float-b absolute -bottom-24 -left-20 size-72 rounded-full bg-linear-to-br ${avatarGradient(group.name)} opacity-[0.08] blur-3xl`}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="bg-background/85 sticky top-0 z-10 flex items-center gap-3 border-b p-3 shadow-sm backdrop-blur-md">
          <Link
            href={`/groups/${groupId}`}
            aria-label={t("common.back")}
            className="hover:bg-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div
            className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm ring-2`}
          >
            {group.icon || group.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-heading truncate text-sm font-semibold">{group.name}</span>
            <span className="text-muted-foreground text-xs">{memberCountLabel}</span>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-full">
                <MessageCircle className="h-5 w-5" />
              </div>
              <p className="text-muted-foreground text-sm">{t("chat.empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {items.map(({ message, showDivider, showSender, grouped }) => {
                const senderName = group.members[message.senderUid]?.displayName ?? "?";

                return (
                  <div
                    key={message.id}
                    className={cn(showDivider ? "mt-5 first:mt-0" : grouped ? "mt-1" : "mt-4")}
                  >
                    {showDivider && (
                      <div className="mb-4 flex items-center justify-center">
                        <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                          {formatDate(new Date(message.createdAt))}
                        </span>
                      </div>
                    )}
                    <MessageBubble
                      message={message}
                      senderName={senderName}
                      isOwn={message.senderUid === user.uid}
                      showSender={showSender}
                      groupId={groupId}
                      onDeleteError={setActionError}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div
          className="bg-background/85 sticky bottom-0 z-10 border-t px-3 pt-3 backdrop-blur-md"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {actionError && <p className="text-destructive mb-2 px-1 text-xs">{actionError}</p>}
          <form
            onSubmit={handleFormSubmit}
            className="border-input bg-card/70 focus-within:border-ring focus-within:ring-ring/50 flex items-end gap-1.5 rounded-3xl border p-1.5 pl-4 shadow-sm transition-colors focus-within:ring-3"
          >
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={t("chat.placeholder")}
              enterKeyHint="send"
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              className="placeholder:text-muted-foreground max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={sending || !text.trim()}
              aria-label={t("chat.send")}
              onMouseDown={(event) => event.preventDefault()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
