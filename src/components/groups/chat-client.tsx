"use client";

import { collection, doc, limitToLast, onSnapshot, orderBy, query } from "firebase/firestore";
import { ArrowDown, ArrowLeft, Bell, BellOff, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AmbientBackdrop } from "@/components/ui/ambient-backdrop";
import { ChatComposer } from "@/components/groups/chat-composer";
import { MessageBubble, PendingBubble } from "@/components/groups/chat-message";
import { useT } from "@/components/locale-provider";
import { NeedsConnection } from "@/components/needs-connection";
import { Skeleton } from "@/components/ui/skeleton";
import { markChatRead, setChatReaction } from "@/lib/actions/messages";
import { setChatMuted } from "@/lib/actions/notifications";
import { MAX_REPLY_PREVIEW_LENGTH, type ChatReactionId } from "@/lib/chat/constants";
import {
  applyReactionOverrides,
  overrideKey,
  pruneReactionOverrides,
  type ReactionOverrides,
} from "@/lib/chat/reactions";
import { shortenText } from "@/lib/chat/rich-text";
import { useChatDraft } from "@/lib/chat/use-chat-draft";
import { useChatSender } from "@/lib/chat/use-chat-sender";
import { db } from "@/lib/firebase/client";
import { reportSnapshotError } from "@/lib/firebase/snapshot-error";
import { useCurrentUser } from "@/lib/firebase/use-current-user";
import { formatDate } from "@/lib/format/date";
import { useVisibleHeight } from "@/lib/use-visible-height";
import { avatarGradient, cn } from "@/lib/utils";
import { callAction } from "@/lib/call-action";
import { useScreenSync } from "@/lib/offline/sync-marks";
import { useLiveSources } from "@/lib/offline/use-live-sources";
import { useOnline } from "@/lib/use-online";
import { usePageVisible } from "@/lib/use-page-visible";
import type { ChatMessage, ChatRead, Group } from "@/lib/types";

/** How many messages the chat loads, and how many more "Ältere laden" adds. */
const PAGE_SIZE = 100;

/** How far from the true bottom still counts as "reading the newest messages". */
const BOTTOM_SLACK = 48;

/** How long a quote you jumped to stays highlighted. */
const HIGHLIGHT_MS = 1500;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

const LIVE_SOURCES = ["group", "messages"] as const;

export function ChatClient({ groupId, initialMuted }: { groupId: string; initialMuted: boolean }) {
  const user = useCurrentUser();
  const [group, setGroup] = useState<Group | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [text, setText] = useChatDraft(groupId);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [muted, setMuted] = useState(initialMuted);
  // When this chat was last read, as it stood when it was opened — frozen, so
  // the "Ungelesen" line doesn't vanish the moment this visit marks it read.
  // undefined = not heard yet; null = never read.
  const [openedReadAt, setOpenedReadAt] = useState<string | null | undefined>(undefined);
  const [newBelow, setNewBelow] = useState(0);
  const [reactionOverrides, setReactionOverrides] = useState<ReactionOverrides>({});

  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const unreadRef = useRef<HTMLDivElement | null>(null);
  // Starts true so the very first keyboard open still pins to the newest
  // message, before the reader has scrolled anywhere.
  const atBottomRef = useRef(true);
  const receivedFirstRef = useRef(false);
  const newestIdRef = useRef<string | null>(null);
  const scrollRequestRef = useRef(false);
  const initialScrollDoneRef = useRef(false);
  // The message that was at the top of the list when "Ältere laden" was
  // tapped, and where on screen it stood: whatever gets inserted above it —
  // the cached messages first, the server's after — it is put back there,
  // instead of the list jumping to the oldest. Done by hand because Safari has
  // no CSS scroll anchoring.
  const prependAnchorRef = useRef<{
    id: string;
    offset: number;
    serverConfirmed: boolean;
  } | null>(null);

  const visibleHeight = useVisibleHeight(rootRef);
  const t = useT();
  const online = useOnline();
  const pageVisible = usePageVisible();
  const { live, received, report } = useLiveSources(LIVE_SOURCES);
  const syncedAt = useScreenSync(user ? `${user.uid}:chat:${groupId}` : null, live);
  const sender = useChatSender(groupId, messages);

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
    const uid = user.uid;
    const messagesQuery = query(
      collection(db, "groups", groupId, "messages"),
      orderBy("createdAt", "asc"),
      limitToLast(limit),
    );
    return onSnapshot(
      messagesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
        const isFirst = !receivedFirstRef.current;
        receivedFirstRef.current = true;
        const previousNewest = newestIdRef.current;
        const newest = docs.at(-1)?.id ?? null;
        // A metadata-only snapshot (cache → server) leaves the newest message
        // as it was; only a genuinely newer one is "new".
        if (!isFirst && newest !== previousNewest) {
          const index =
            previousNewest === null ? -1 : docs.findIndex((m) => m.id === previousNewest);
          const fresh = previousNewest === null ? docs : index === -1 ? [] : docs.slice(index + 1);
          if (atBottomRef.current || fresh.some((m) => m.senderUid === uid)) {
            scrollRequestRef.current = true;
          } else {
            const fromOthers = fresh.filter((m) => m.senderUid !== uid).length;
            if (fromOthers > 0) setNewBelow((count) => count + fromOthers);
          }
        }
        newestIdRef.current = newest;
        if (prependAnchorRef.current && !snapshot.metadata.fromCache) {
          prependAnchorRef.current.serverConfirmed = true;
        }
        setMessages(docs);
        setReactionOverrides((current) => pruneReactionOverrides(current, docs, uid));
        report("messages", snapshot);
      },
      (error) => {
        setErrorCode(reportSnapshotError("chat-messages", error));
      },
    );
  }, [groupId, user, limit, report]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "groups", groupId, "chatReads", user.uid),
      (snapshot) => {
        const lastReadAt = snapshot.exists() ? (snapshot.data() as ChatRead).lastReadAt : null;
        setOpenedReadAt((current) => (current === undefined ? lastReadAt : current));
      },
      (error) => {
        // Reported, but the chat still works — just without the unread line.
        reportSnapshotError("chat-read", error);
        setOpenedReadAt((current) => current ?? null);
      },
    );
  }, [groupId, user]);

  // Once per newest message, and only while the chat is in front of you — a
  // message that arrives while the app is in the background is not "read".
  // Held back until the line above has seen the old receipt.
  const newestId = messages?.at(-1)?.id ?? null;
  useEffect(() => {
    if (!user || !newestId || !online || !pageVisible || openedReadAt === undefined) return;
    // Best effort: a receipt that doesn't arrive is simply sent with the next one.
    markChatRead({ groupId }).catch(() => {});
  }, [groupId, user, newestId, online, pageVisible, openedReadAt]);

  // Where to start: on the first unread message if there is one, else at the
  // bottom. Before paint, so the list never flashes at its top first.
  const listReady = user !== null && group !== null && messages !== null;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (initialScrollDoneRef.current || !list || !listReady) return;
    // Offline the receipt may never be heard; don't wait for it then.
    if (openedReadAt === undefined && online) return;
    initialScrollDoneRef.current = true;
    if (unreadRef.current) unreadRef.current.scrollIntoView({ block: "start" });
    else bottomRef.current?.scrollIntoView({ block: "end" });
    atBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_SLACK;
  }, [listReady, openedReadAt, online]);

  // After the list changed: keep the reader's place when older messages were
  // added above, or follow along to the bottom when that was asked for (you
  // were at the bottom, or the new message is yours).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !initialScrollDoneRef.current) return;
    const anchor = prependAnchorRef.current;
    if (anchor) {
      const el = document.getElementById(`msg-${anchor.id}`);
      if (el) {
        list.scrollTop +=
          el.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset;
      }
      // Done once the server's answer is in; until then more may still arrive above.
      if (anchor.serverConfirmed) prependAnchorRef.current = null;
      return;
    }
    if (scrollRequestRef.current) {
      scrollRequestRef.current = false;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  // Your own message goes to the bottom at once, even before the server has
  // it — and again if it failed, when its "Nicht gesendet" row makes it taller.
  const pendingCount = sender.pending.length;
  const failedCount = sender.pending.filter((item) => item.status === "failed").length;
  useLayoutEffect(() => {
    if (pendingCount > 0) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [pendingCount, failedCount]);

  // The frame shrinks when the keyboard opens, which would otherwise leave the
  // newest message hidden above the fold right as you type a reply to it. Only
  // re-pin if the reader was already at the bottom — doing it unconditionally
  // would also yank someone reading old history back down when the keyboard
  // closes or the phone rotates.
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [visibleHeight]);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    setNewBelow(0);
  }

  function loadOlder() {
    const list = listRef.current;
    const first = messages?.[0];
    const el = first ? document.getElementById(`msg-${first.id}`) : null;
    if (!list || !first || !el) return;
    prependAnchorRef.current = {
      id: first.id,
      offset: el.getBoundingClientRect().top - list.getBoundingClientRect().top,
      serverConfirmed: false,
    };
    setLimit((current) => current + PAGE_SIZE);
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || !online) return;
    sender.send(
      trimmed,
      replyTarget
        ? {
            id: replyTarget.id,
            senderUid: replyTarget.senderUid,
            text: shortenText(replyTarget.text, MAX_REPLY_PREVIEW_LENGTH),
          }
        : null,
    );
    setText("");
    setReplyTarget(null);
    setActionError(null);
    // Straight from the tap that sent it, so on a phone the keyboard stays up
    // for the next message instead of closing after every single one.
    textareaRef.current?.focus();
  }

  async function handleReact(message: ChatMessage, reactionId: ChatReactionId, active: boolean) {
    if (!online) return;
    const key = overrideKey(message.id, reactionId);
    setActiveId(null);
    setActionError(null);
    setReactionOverrides((current) => ({ ...current, [key]: active }));
    const result = await callAction(() =>
      setChatReaction({ groupId, messageId: message.id, reaction: reactionId, active }),
    );
    if (!result.ok) {
      setReactionOverrides((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      setActionError(t("chat.reactionError"));
    }
  }

  function handleReply(message: ChatMessage) {
    setReplyTarget(message);
    setActiveId(null);
    textareaRef.current?.focus();
  }

  function handleJump(messageId: string) {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(messageId);
    window.setTimeout(
      () => setHighlightId((current) => (current === messageId ? null : current)),
      HIGHLIGHT_MS,
    );
  }

  async function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    setActionError(null);
    const result = await callAction(() => setChatMuted({ groupId, muted: next }));
    if (!result.ok) {
      setMuted(!next);
      setActionError(t("chat.muteError"));
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

  const mentionCandidates = Object.entries(group.members)
    .filter(([uid]) => group.memberUids.includes(uid) && uid !== user.uid)
    .map(([uid, member]) => ({ uid, displayName: member.displayName }));

  let previousDay = "";
  let previousSender = "";
  let unreadMarked = false;
  const items: {
    message: ChatMessage;
    showDivider: boolean;
    showUnread: boolean;
    showSender: boolean;
    grouped: boolean;
  }[] = [];
  for (const message of messages) {
    const key = dayKey(message.createdAt);
    const showDivider = key !== previousDay;
    // The first message from someone else that came in after this chat was
    // last read — never when it was never read at all (everything is unread).
    const showUnread =
      !unreadMarked &&
      typeof openedReadAt === "string" &&
      message.senderUid !== user.uid &&
      message.createdAt > openedReadAt;
    if (showUnread) unreadMarked = true;
    const showSender = showDivider || showUnread || message.senderUid !== previousSender;
    const grouped = !showDivider && !showUnread && message.senderUid === previousSender;
    items.push({ message, showDivider, showUnread, showSender, grouped });
    previousDay = key;
    previousSender = message.senderUid;
  }

  const replyPreview = replyTarget
    ? {
        name: group.members[replyTarget.senderUid]?.displayName ?? "?",
        text: shortenText(replyTarget.text, MAX_REPLY_PREVIEW_LENGTH),
      }
    : null;

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
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-heading truncate text-sm font-semibold">{group.name}</span>
            <span className="text-muted-foreground text-xs">
              {memberCountLabel}
              {muted && ` · ${t("chat.mutedBadge")}`}
            </span>
          </div>
          <button
            type="button"
            aria-pressed={muted}
            aria-label={muted ? t("chat.unmute") : t("chat.mute")}
            title={muted ? t("chat.unmute") : t("chat.mute")}
            disabled={!online}
            onClick={handleToggleMute}
            className="hover:bg-accent text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 disabled:opacity-50"
          >
            {muted ? <BellOff className="size-4.5" /> : <Bell className="size-4.5" />}
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={listRef}
            className="flex flex-1 flex-col overflow-y-auto p-4"
            onClick={() => setActiveId(null)}
            // The reader took over: stop holding their place for them.
            onWheel={() => (prependAnchorRef.current = null)}
            onTouchStart={() => (prependAnchorRef.current = null)}
            onScroll={(event) => {
              const list = event.currentTarget;
              // The container keeps a padding-bottom of breathing room under the
              // newest bubble that scrollIntoView leaves unscrolled, so "at the
              // bottom" is never exactly zero.
              const nearBottom =
                list.scrollHeight - list.scrollTop - list.clientHeight <= BOTTOM_SLACK;
              atBottomRef.current = nearBottom;
              if (nearBottom) setNewBelow(0);
            }}
          >
            {messages.length === 0 && sender.pending.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
                <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-full">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <p className="text-muted-foreground text-sm">{t("chat.empty")}</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {messages.length >= limit && (
                  <button
                    type="button"
                    onClick={loadOlder}
                    className="text-muted-foreground hover:bg-accent mx-auto mb-4 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    {t("chat.loadOlder")}
                  </button>
                )}
                {items.map(({ message, showDivider, showUnread, showSender, grouped }) => {
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
                      {showUnread && (
                        <div
                          ref={unreadRef}
                          className="text-primary mb-4 flex scroll-mt-4 items-center gap-3 text-[11px] font-semibold tracking-[0.12em] uppercase"
                        >
                          <span className="bg-primary/30 h-px flex-1" />
                          {t("chat.unreadDivider")}
                          <span className="bg-primary/30 h-px flex-1" />
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        senderName={senderName}
                        isOwn={message.senderUid === user.uid}
                        showSender={showSender}
                        groupId={groupId}
                        members={group.members}
                        currentUid={user.uid}
                        online={online}
                        reactions={applyReactionOverrides(message, user.uid, reactionOverrides)}
                        active={activeId === message.id}
                        highlighted={highlightId === message.id}
                        onToggleActions={() =>
                          setActiveId((current) => (current === message.id ? null : message.id))
                        }
                        onReact={(reactionId, active) =>
                          void handleReact(message, reactionId, active)
                        }
                        onReply={() => handleReply(message)}
                        onJump={handleJump}
                        onActionError={setActionError}
                      />
                    </div>
                  );
                })}
                {sender.pending.map((item) => (
                  <div key={item.id} className="mt-1">
                    <PendingBubble
                      item={item}
                      members={group.members}
                      online={online}
                      onRetry={() => sender.retry(item.id)}
                      onDiscard={() => sender.discard(item.id)}
                    />
                  </div>
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {newBelow > 0 && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="bg-primary text-primary-foreground shadow-e2 absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold active:scale-95"
            >
              <ArrowDown aria-hidden="true" className="size-3.5" />
              {newBelow === 1
                ? t("chat.unreadCountSingular")
                : t("chat.unreadCount", { count: newBelow })}
            </button>
          )}
        </div>

        <div
          className="bg-background/85 sticky bottom-0 z-10 shrink-0 border-t px-3 pt-3 backdrop-blur-md"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <ChatComposer
            value={text}
            onChange={setText}
            onSend={handleSend}
            online={online}
            error={actionError}
            reply={replyPreview}
            onCancelReply={() => setReplyTarget(null)}
            mentionCandidates={mentionCandidates}
            textareaRef={textareaRef}
          />
        </div>
      </div>
    </div>
  );
}
