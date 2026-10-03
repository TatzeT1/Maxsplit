"use client";

import { collection, doc, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowLeft, ChevronRight, MessageCircle, RotateCcw, Send, Trash2 } from "lucide-react";
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
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteMessage, markChatRead, sendMessage } from "@/lib/actions/messages";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { formatDate, formatTime } from "@/lib/format/date";
import { gameResultSentence } from "@/lib/chat/game-result";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { useVisibleHeight } from "@/lib/use-visible-height";
import { avatarGradient, cn } from "@/lib/utils";
import { callAction } from "@/lib/call-action";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import type { ChatMessage, Group, GroupMember } from "@/lib/types";

const MAX_LOADED_MESSAGES = 300;

/** How far from the true bottom still counts as "reading the newest messages". */
const BOTTOM_SLACK = 48;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function MessageBubble({
  message,
  senderName,
  isOwn,
  showSender,
  groupId,
  members,
  onDeleteError,
}: {
  message: ChatMessage;
  senderName: string;
  isOwn: boolean;
  showSender: boolean;
  groupId: string;
  members: Record<string, GroupMember>;
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
        "animate-rise flex flex-col gap-0.5",
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
        {message.gameInvite ? (
          <GameInviteBubble
            text={message.text}
            emoji={DUEL_GAME_META[message.gameInvite.gameId]?.emoji}
            title={
              DUEL_GAME_META[message.gameInvite.gameId]
                ? t(DUEL_GAME_META[message.gameInvite.gameId].titleKey)
                : ""
            }
            eyebrow={t("chat.gameInviteEyebrow")}
            href={`/groups/${groupId}/tournaments/${message.gameInvite.tournamentId}`}
            isOwn={isOwn}
          />
        ) : message.luckInvite ? (
          <GameInviteBubble
            text={message.text}
            emoji={SPLIT_GAME_META[message.luckInvite.gameId]?.emoji}
            title={
              SPLIT_GAME_META[message.luckInvite.gameId]
                ? t(SPLIT_GAME_META[message.luckInvite.gameId].nameKey)
                : ""
            }
            eyebrow={t("chat.luckInviteEyebrow")}
            href={`/groups/${groupId}/rounds/${message.luckInvite.roundId}`}
            isOwn={isOwn}
          />
        ) : message.gameResult ? (
          <GameResultBubble
            result={message.gameResult}
            groupId={groupId}
            members={members}
            isOwn={isOwn}
          />
        ) : (
          <div
            className={cn(
              "max-w-[75vw] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-sm",
              isOwn
                ? "from-primary to-primary/85 text-primary-foreground shadow-primary/20 shadow-e1 rounded-br-md bg-linear-to-br"
                : "bg-card ring-foreground/10 shadow-e1 rounded-bl-md ring-1",
            )}
          >
            {message.text}
          </div>
        )}
      </div>
      <span className="text-muted-foreground px-1 text-[10px]">
        {formatTime(new Date(message.createdAt))}
      </span>
    </div>
  );
}

/**
 * The invitation an online game posts when it starts — a duel's challenge or
 * a luck round — as a card with a way in, not just a sentence, since joining
 * is the whole point of the message. Same neutral card for both sides; only
 * the button label changes.
 */
function GameInviteBubble({
  text,
  emoji,
  title,
  eyebrow,
  href,
  isOwn,
}: {
  text: string;
  emoji: string | undefined;
  title: string;
  eyebrow: string;
  href: string;
  isOwn: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 shadow-e1 flex w-[min(75vw,18rem)] flex-col gap-2.5 rounded-2xl p-3 ring-1",
        isOwn ? "rounded-br-md" : "rounded-bl-md",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
        >
          {emoji ?? "🎮"}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-primary text-[11px] font-semibold tracking-[0.12em] uppercase">
            {eyebrow}
          </span>
          <span className="font-heading truncate text-base leading-tight font-medium">{title}</span>
        </div>
      </div>
      <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">{text}</p>
      <Button asChild size="sm" variant={isOwn ? "outline" : "default"} className="h-10 w-full">
        <Link href={href}>
          {isOwn ? t("chat.gameInviteOpen") : t("chat.gameInviteJoin")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/**
 * How a decided game ended — posted by the server with the result (see
 * `lib/chat/game-result.ts`). Names come from the group as it is now; the
 * sentence is the same one the stored text carries for previews. A
 * reshuffled result says so in the sentence and with a badge.
 */
function GameResultBubble({
  result,
  groupId,
  members,
  isOwn,
}: {
  result: NonNullable<ChatMessage["gameResult"]>;
  groupId: string;
  members: Record<string, GroupMember>;
  isOwn: boolean;
}) {
  const t = useT();
  const meta = SPLIT_GAME_META[result.gameId];
  const sentence = gameResultSentence(t, result, (uid) => members[uid]?.displayName ?? "?");
  return (
    <div
      className={cn(
        "bg-card ring-foreground/10 shadow-e1 flex w-[min(75vw,18rem)] flex-col gap-2.5 rounded-2xl p-3 ring-1",
        isOwn ? "rounded-br-md" : "rounded-bl-md",
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
        >
          {meta?.emoji ?? "🎮"}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t("chat.gameResultEyebrow")}
          </span>
          <span className="font-heading truncate text-base leading-tight font-medium">
            {meta ? t(meta.nameKey) : ""}
          </span>
        </div>
        {result.attempt > 1 && (
          <span className="bg-muted text-foreground ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
            <RotateCcw aria-hidden="true" className="size-3" />
            {result.attempt}.
          </span>
        )}
      </div>
      <p className="text-sm font-medium break-words">{sentence}</p>
      <Button asChild size="sm" variant="outline" className="h-10 w-full">
        <Link
          href={
            result.roundId
              ? `/groups/${groupId}/rounds/${result.roundId}`
              : result.tournamentId
                ? `/groups/${groupId}/tournaments/${result.tournamentId}`
                : `/groups/${groupId}?tab=games`
          }
        >
          {result.roundId || result.tournamentId
            ? t("chat.gameResultOpenGame")
            : t("chat.gameResultOpenStats")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

const LIVE_SOURCES = ["group", "messages"] as const;

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
  const rootRef = useRef<HTMLDivElement>(null);
  // Starts true so the very first keyboard open still pins to the newest
  // message, before the reader has scrolled anywhere.
  const atBottomRef = useRef(true);
  const visibleHeight = useVisibleHeight(rootRef);
  const t = useT();
  const online = useOnline();
  const { live, received, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(user ? `${user.uid}:chat:${groupId}` : null, live);

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
      { includeMetadataChanges: true },
      (snapshot) => {
        setGroup(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Group) : null);
        report("group", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("group", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user) return;
    const messagesQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(MAX_LOADED_MESSAGES),
    );
    return onSnapshot(
      messagesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        setMessages(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
        report("messages", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("chat-messages", error));
      },
    );
  }, [groupId, user, report]);

  useEffect(() => {
    if (!user || messages === null || !online) return;
    // Best effort: a receipt that doesn't arrive is simply sent with the next one.
    markChatRead({ groupId }).catch(() => {});
  }, [groupId, user, messages, online]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  // The frame shrinks when the keyboard opens, which would otherwise leave the
  // newest message hidden above the fold right as you type a reply to it. Only
  // re-pin if the reader was already at the bottom — doing it unconditionally
  // would also yank someone reading old history back down when the keyboard
  // closes or the phone rotates.
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleHeight]);

  async function submitMessage() {
    const trimmed = text.trim();
    if (!trimmed || sending || !online) return;
    setSending(true);
    setActionError(null);
    const result = await callAction(() => sendMessage({ groupId, text: trimmed }));
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

  // The chat owns its own scrolling and parks the composer at the bottom, so
  // it must be exactly as tall as the visible area — never taller, or the
  // document grows and the composer slides down behind the keyboard. The ref
  // stays mounted across every branch below so the measurement happens even
  // while the messages are still loading.
  const frameProps = {
    ref: rootRef,
    className: "relative flex flex-1 flex-col overflow-hidden",
    style: visibleHeight === null ? undefined : { height: visibleHeight, flex: "none" as const },
  };

  if (user && errorCode) {
    return (
      <div {...frameProps}>
        <div className="mx-auto w-full max-w-lg p-4">
          <div className="border-destructive/50 text-destructive flex flex-col gap-1 rounded-lg border p-4">
            <p className="text-sm font-medium">{t("errors.dataLoadFailed")}</p>
            <p className="text-xs">{t("errors.errorCode", { code: errorCode })}</p>
          </div>
        </div>
      </div>
    );
  }

  // Offline without a copy of this chat on this device: say so instead of a
  // skeleton that never resolves or an empty conversation.
  if (user && !online && !live && (syncedAt === null || (received("group") && !group))) {
    return (
      <div {...frameProps}>
        <NeedsConnection body={t("offline.chatNotSynced")} />
      </div>
    );
  }

  if (!group || messages === null || !user) {
    return (
      <div {...frameProps}>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-2/3 self-start" />
          <Skeleton className="h-16 w-2/3 self-end" />
          <Skeleton className="h-16 w-1/2 self-start" />
        </div>
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
    <div {...frameProps}>
      <AmbientBackdrop tint={avatarGradient(group.name)} />

      <div className="relative z-10 mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        {/* shrink-0 here and on the composer: the message list is flex-1, whose
            flex-basis:0 gives it a scaled shrink factor of 0, so without this
            the header and composer would absorb every pixel of a short frame
            and get clipped by the frame's overflow-hidden. */}
        <div className="bg-background/85 shadow-e1 sticky top-0 z-10 flex shrink-0 items-center gap-3 border-b p-3 backdrop-blur-md">
          <Link
            href={`/groups/${groupId}`}
            aria-label={t("common.back")}
            className="hover:bg-accent flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div
            className={`bg-linear-to-br ${avatarGradient(group.name)} ring-card shadow-e1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white ring-2`}
          >
            {group.icon || group.name.charAt(0).toUpperCase() || "?"}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="font-heading truncate text-sm font-semibold">{group.name}</span>
            <span className="text-muted-foreground text-xs">{memberCountLabel}</span>
          </div>
        </div>

        <div
          className="flex flex-1 flex-col overflow-y-auto p-4"
          onScroll={(event) => {
            const list = event.currentTarget;
            // The container keeps a padding-bottom of breathing room under the
            // newest bubble that scrollIntoView leaves unscrolled, so "at the
            // bottom" is never exactly zero.
            atBottomRef.current =
              list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_SLACK;
          }}
        >
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
                      members={group.members}
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
          className="bg-background/85 sticky bottom-0 z-10 shrink-0 border-t px-3 pt-3 backdrop-blur-md"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {actionError && <p className="text-destructive mb-2 px-1 text-xs">{actionError}</p>}
          <form
            onSubmit={handleFormSubmit}
            className="border-input bg-card/70 focus-within:border-ring focus-within:ring-ring/50 shadow-e1 flex items-end gap-1.5 rounded-3xl border p-1.5 pl-4 transition-colors focus-within:ring-3"
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
              // text-base (16px) on mobile is load-bearing, not styling: iOS
              // Safari auto-zooms the whole page when a focused field is under
              // 16px, which shoves the send button off the right edge and
              // scrolls what you're typing out of view. Same md:text-sm
              // pattern as ui/input.tsx and ui/select.tsx.
              className="placeholder:text-muted-foreground max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base outline-none md:text-sm"
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
        </div>
      </div>
    </div>
  );
}
