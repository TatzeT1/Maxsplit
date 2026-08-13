"use client";

import { collection, doc, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
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
      className={cn("animate-pop-in flex flex-col gap-0.5", isOwn ? "items-end" : "items-start")}
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
                className="text-muted-foreground hover:text-destructive shrink-0 rounded-full p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
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
            "max-w-[75vw] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-sm",
            isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
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
  const t = useT();

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

  async function handleSend(event: FormEvent) {
    event.preventDefault();
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

  const items: { message: ChatMessage; showDivider: boolean; showSender: boolean }[] = [];
  {
    let previousDay = "";
    let previousSender = "";
    for (const message of messages) {
      const key = dayKey(message.createdAt);
      const showDivider = key !== previousDay;
      const showSender = showDivider || message.senderUid !== previousSender;
      items.push({ message, showDivider, showSender });
      previousDay = key;
      previousSender = message.senderUid;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
      <div className="bg-background/80 sticky top-0 z-10 flex items-center gap-3 border-b p-3 backdrop-blur-sm">
        <Link
          href={`/groups/${groupId}`}
          aria-label={t("common.back")}
          className="hover:bg-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </Link>
        <div
          className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white shadow-sm ring-2`}
        >
          {group.icon || group.name.charAt(0).toUpperCase() || "?"}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{group.name}</span>
          <span className="text-muted-foreground text-xs">{t("chat.title")}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center pt-12 text-center text-sm">
            {t("chat.empty")}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map(({ message, showDivider, showSender }) => {
              const senderName = group.members[message.senderUid]?.displayName ?? "?";

              return (
                <div key={message.id} className="flex flex-col gap-3">
                  {showDivider && (
                    <div className="flex justify-center">
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

      <form onSubmit={handleSend} className="border-t p-3">
        {actionError && <p className="text-destructive mb-2 text-xs">{actionError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend(event);
              }
            }}
            placeholder={t("chat.placeholder")}
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 max-h-32 min-h-10 flex-1 resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-3"
          />
          <Button
            type="submit"
            size="icon"
            disabled={sending || !text.trim()}
            aria-label={t("chat.send")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
