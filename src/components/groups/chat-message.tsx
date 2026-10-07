"use client";

import { Check, Copy, Ellipsis, Reply, Trash2 } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
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
import {
  ExpenseCardBubble,
  GameInviteBubble,
  GameResultBubble,
  SettlementCardBubble,
  isCardMessage,
} from "@/components/groups/chat-cards";
import { deleteMessage } from "@/lib/actions/messages";
import { callAction } from "@/lib/call-action";
import { CHAT_REACTIONS, type ChatReactionId } from "@/lib/chat/constants";
import { tokenizeMessage } from "@/lib/chat/rich-text";
import type { PendingMessage } from "@/lib/chat/use-chat-sender";
import { formatTime } from "@/lib/format/date";
import { DUEL_GAME_META } from "@/lib/games/duel-game-ids";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { avatarGradient, cn } from "@/lib/utils";
import type { ChatMessage, ChatReply, GroupMember } from "@/lib/types";

const OWN_BUBBLE =
  "from-primary to-primary/85 text-primary-foreground shadow-primary/20 shadow-e1 rounded-br-md bg-linear-to-br";
const OTHER_BUBBLE = "bg-card ring-foreground/10 shadow-e1 rounded-bl-md ring-1";

/** A message's text with links tappable and the @mentions it really made highlighted. */
export function RichText({
  text,
  mentionNames = [],
  isOwn,
}: {
  text: string;
  mentionNames?: readonly string[];
  isOwn: boolean;
}) {
  return (
    <>
      {tokenizeMessage(text, mentionNames).map((token, index) => {
        if (token.type === "link") {
          return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="[overflow-wrap:anywhere] underline underline-offset-2"
            >
              {token.value}
            </a>
          );
        }
        if (token.type === "mention") {
          return (
            <span
              key={index}
              className={cn(
                "rounded px-0.5 font-semibold",
                isOwn ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
              )}
            >
              {token.value}
            </span>
          );
        }
        return token.value;
      })}
    </>
  );
}

/** The quoted message at the top of a reply; tapping it jumps to the original when it's loaded. */
function QuoteBlock({
  reply,
  members,
  isOwn,
  onJump,
}: {
  reply: ChatReply;
  members: Record<string, GroupMember>;
  isOwn: boolean;
  onJump?: (messageId: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t("chat.jumpToQuote")}
      onClick={(event) => {
        event.stopPropagation();
        onJump?.(reply.id);
      }}
      className={cn(
        "mb-1.5 block w-full rounded-lg border-l-2 py-1 pr-2 pl-2 text-left text-xs whitespace-normal",
        isOwn
          ? "bg-primary-foreground/15 border-primary-foreground/60"
          : "bg-muted border-primary/60",
      )}
    >
      <span className="block font-semibold">{members[reply.senderUid]?.displayName ?? "?"}</span>
      <span className="line-clamp-2 break-words opacity-80">{reply.text}</span>
    </button>
  );
}

/**
 * What you can do with a message, right under it: react, reply, copy and — on
 * your own — delete. Inline rather than a popup: a menu in a portal would be
 * positioned against the layout viewport, which on iOS is not what's visible
 * while the keyboard is up (see `useVisibleHeight`).
 */
function MessageActions({
  message,
  isOwn,
  online,
  mine,
  deleting,
  onReact,
  onReply,
  onDelete,
}: {
  message: ChatMessage;
  isOwn: boolean;
  online: boolean;
  /** The reactions the viewer has on this message. */
  mine: ReadonlySet<string>;
  deleting: boolean;
  onReact: (reactionId: ChatReactionId, active: boolean) => void;
  onReply: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const barRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Opening it below the fold would hide the very thing just tapped for.
  useEffect(() => {
    barRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
    } catch {
      // Clipboard access refused: nothing was copied, so don't say it was.
    }
  }

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label={t("chat.messageActions")}
      onClick={(event) => event.stopPropagation()}
      className="animate-rise bg-card ring-foreground/10 shadow-e2 flex max-w-full flex-col gap-1 rounded-2xl p-1.5 ring-1"
    >
      <div className="flex items-center gap-0.5">
        {CHAT_REACTIONS.map(({ id, emoji }) => (
          <button
            key={id}
            type="button"
            disabled={!online}
            aria-pressed={mine.has(id)}
            aria-label={t("chat.reactTo", { emoji })}
            onClick={() => onReact(id, !mine.has(id))}
            className={cn(
              "flex size-10 items-center justify-center rounded-full text-xl transition-transform active:scale-90 disabled:opacity-40",
              mine.has(id) && "bg-primary/15",
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={onReply}>
          <Reply aria-hidden="true" />
          {t("chat.reply")}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={handleCopy}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? t("chat.copied") : t("chat.copy")}
        </Button>
        {isOwn && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-10"
                disabled={!online || deleting}
              >
                <Trash2 aria-hidden="true" />
                {t("common.delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("chat.deleteConfirm")}</AlertDialogTitle>
                <AlertDialogDescription>{t("chat.deleteConfirmBody")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>{t("common.delete")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}

export function MessageBubble({
  message,
  senderName,
  isOwn,
  showSender,
  groupId,
  members,
  currentUid,
  online,
  reactions,
  active,
  highlighted,
  onToggleActions,
  onReact,
  onReply,
  onJump,
  onActionError,
}: {
  message: ChatMessage;
  senderName: string;
  isOwn: boolean;
  showSender: boolean;
  groupId: string;
  members: Record<string, GroupMember>;
  currentUid: string;
  online: boolean;
  /** The message's reactions with the viewer's own pending taps already applied. */
  reactions: Record<string, string[]>;
  active: boolean;
  highlighted: boolean;
  onToggleActions: () => void;
  onReact: (reactionId: ChatReactionId, active: boolean) => void;
  onReply: () => void;
  onJump: (messageId: string) => void;
  onActionError: (message: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const t = useT();
  const card = isCardMessage(message);
  const mine = new Set(
    Object.entries(reactions)
      .filter(([, uids]) => uids.includes(currentUid))
      .map(([id]) => id),
  );
  const shown = CHAT_REACTIONS.filter(({ id }) => (reactions[id]?.length ?? 0) > 0);

  async function handleDelete() {
    setDeleting(true);
    const result = await callAction(() => deleteMessage({ groupId, messageId: message.id }));
    setDeleting(false);
    if (!result.ok) onActionError(t("chat.deleteError"));
  }

  // A tap on the bubble opens the actions — unless it was a link, or the end of
  // selecting text (a drag ends in a click too).
  function handleBubbleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) return;
    if (window.getSelection()?.toString()) return;
    event.stopPropagation();
    onToggleActions();
  }

  const moreButton = (
    <button
      type="button"
      aria-label={t("chat.messageActions")}
      aria-expanded={active}
      onClick={(event) => {
        event.stopPropagation();
        onToggleActions();
      }}
      className={cn(
        "text-muted-foreground hover:bg-accent shrink-0 rounded-full p-1.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100",
        // A card has no bubble to tap, so on a touch screen its button stays visible.
        card && "pointer-coarse:opacity-100",
        active && "opacity-100",
      )}
    >
      <Ellipsis className="size-4" />
    </button>
  );

  const mentionNames = (message.mentions ?? []).map((uid) => members[uid]?.displayName ?? "");

  return (
    <div
      id={`msg-${message.id}`}
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
      <div className="group flex max-w-full items-center gap-1.5">
        {isOwn && moreButton}
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
        ) : message.expenseCard ? (
          <ExpenseCardBubble
            card={message.expenseCard}
            groupId={groupId}
            members={members}
            currentUid={currentUid}
            isOwn={isOwn}
          />
        ) : message.settlementCard ? (
          <SettlementCardBubble
            card={message.settlementCard}
            groupId={groupId}
            members={members}
            isOwn={isOwn}
          />
        ) : (
          // cursor-pointer is what makes iOS Safari deliver a tap on a plain
          // <div> as a click at all.
          <div
            onClick={handleBubbleClick}
            className={cn(
              "max-w-[75vw] cursor-pointer rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-sm",
              isOwn ? OWN_BUBBLE : OTHER_BUBBLE,
              highlighted && "ring-primary ring-2",
            )}
          >
            {message.replyTo && (
              <QuoteBlock reply={message.replyTo} members={members} isOwn={isOwn} onJump={onJump} />
            )}
            <RichText text={message.text} mentionNames={mentionNames} isOwn={isOwn} />
          </div>
        )}
        {!isOwn && moreButton}
      </div>
      {shown.length > 0 && (
        <div className={cn("flex flex-wrap gap-1 px-1", isOwn ? "justify-end" : "justify-start")}>
          {shown.map(({ id, emoji }) => {
            const names = reactions[id].map((uid) => members[uid]?.displayName ?? "?").join(", ");
            return (
              <button
                key={id}
                type="button"
                disabled={!online}
                aria-pressed={mine.has(id)}
                aria-label={`${emoji} ${names}`}
                title={names}
                onClick={() => onReact(id, !mine.has(id))}
                className={cn(
                  "flex h-7 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-xs ring-1 transition-colors disabled:opacity-60",
                  mine.has(id)
                    ? "bg-primary/10 text-primary ring-primary/40"
                    : "bg-card ring-foreground/10",
                )}
              >
                <span aria-hidden="true">{emoji}</span>
                <span className="tabular-nums">{reactions[id].length}</span>
              </button>
            );
          })}
        </div>
      )}
      {active && (
        <MessageActions
          message={message}
          isOwn={isOwn}
          online={online}
          mine={mine}
          deleting={deleting}
          onReact={onReact}
          onReply={onReply}
          onDelete={handleDelete}
        />
      )}
      <span className="text-muted-foreground px-1 text-[10px]">
        {formatTime(new Date(message.createdAt))}
      </span>
    </div>
  );
}

/**
 * Your own message from the moment you send it: dimmed while the server has
 * it, and — if the send failed — kept, marked, and sendable again.
 */
export function PendingBubble({
  item,
  members,
  online,
  onRetry,
  onDiscard,
}: {
  item: PendingMessage;
  members: Record<string, GroupMember>;
  online: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const t = useT();
  return (
    <div className="animate-rise flex origin-bottom-right flex-col items-end gap-0.5">
      <div
        className={cn(
          "max-w-[75vw] rounded-2xl px-3.5 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-sm",
          OWN_BUBBLE,
          item.status === "sending" && "opacity-70",
          item.status === "failed" && "ring-destructive ring-2",
        )}
      >
        {item.replyTo && <QuoteBlock reply={item.replyTo} members={members} isOwn />}
        <RichText text={item.text} isOwn />
      </div>
      {item.status === "failed" ? (
        <div role="alert" className="text-destructive flex items-center gap-1 px-1 text-xs">
          <span className="font-medium">{t("chat.notSent")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={!online}
            onClick={onRetry}
          >
            {t("chat.retrySend")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={onDiscard}
          >
            {t("chat.discard")}
          </Button>
        </div>
      ) : (
        <span className="text-muted-foreground px-1 text-[10px]">
          {item.status === "sending" ? t("chat.sending") : formatTime(new Date(item.createdAt))}
        </span>
      )}
    </div>
  );
}
