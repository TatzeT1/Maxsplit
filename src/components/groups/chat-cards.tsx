"use client";

import { ChevronRight, Receipt, RotateCcw, Wallet } from "lucide-react";
import Link from "next/link";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { gameResultSentence } from "@/lib/chat/game-result";
import { formatMoney } from "@/lib/format/money";
import { SPLIT_GAME_META } from "@/lib/games/split-game-ids";
import { cn } from "@/lib/utils";
import type { ChatExpenseCard, ChatMessage, ChatSettlementCard, GroupMember } from "@/lib/types";

// The structured chat messages that render as cards instead of bubbles —
// game invitations and results, and the silent bookkeeping cards an expense
// or a payment posts.

const listFormatter = new Intl.ListFormat("de-DE", { type: "conjunction" });

/**
 * The invitation an online game posts when it starts — a duel's challenge or
 * a luck round — as a card with a way in, not just a sentence, since joining
 * is the whole point of the message. Same neutral card for both sides; only
 * the button label changes.
 */
export function GameInviteBubble({
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
export function GameResultBubble({
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

/**
 * A newly entered expense, as the chat saw it: what, how much, who laid it
 * out and — the part that answers "what does this mean for me" — your share.
 * A record of that moment; editing the expense later doesn't rewrite it.
 */
export function ExpenseCardBubble({
  card,
  groupId,
  members,
  currentUid,
  isOwn,
}: {
  card: ChatExpenseCard;
  groupId: string;
  members: Record<string, GroupMember>;
  currentUid: string;
  isOwn: boolean;
}) {
  const t = useT();
  const payers = listFormatter.format(
    Object.keys(card.paidBy).map((uid) => members[uid]?.displayName ?? "?"),
  );
  const myShare = card.shares[currentUid];
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
          className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl"
        >
          <Receipt className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t("chat.expenseCardEyebrow")}
          </span>
          <span className="font-heading truncate text-base leading-tight font-medium">
            {card.description}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(card.amountMinor, card.currency)}
        </span>
      </div>
      {payers && (
        <p className="text-muted-foreground text-xs">
          {t("chat.expenseCardPaidBy", { names: payers })}
        </p>
      )}
      {myShare !== undefined && (
        <p className="text-sm font-medium">
          {t("chat.expenseCardYourShare", { amount: formatMoney(myShare, card.currency) })}
        </p>
      )}
      <Button asChild size="sm" variant="outline" className="h-10 w-full">
        <Link href={`/groups/${groupId}`}>
          {t("chat.expenseCardOpen")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/** A recorded payment: who paid whom how much, with a way to the balances. */
export function SettlementCardBubble({
  card,
  groupId,
  members,
  isOwn,
}: {
  card: ChatSettlementCard;
  groupId: string;
  members: Record<string, GroupMember>;
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
          className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl"
        >
          <Wallet className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            {t("chat.settlementCardEyebrow")}
          </span>
          <span className="font-heading truncate text-base leading-tight font-medium">
            {members[card.fromUid]?.displayName ?? "?"} → {members[card.toUid]?.displayName ?? "?"}
          </span>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(card.amountMinor, card.currency)}
        </span>
      </div>
      <Button asChild size="sm" variant="outline" className="h-10 w-full">
        <Link href={`/groups/${groupId}?tab=balances`}>
          {t("chat.settlementCardOpen")}
          <ChevronRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}

/** Whether a message renders as a card of its own rather than a text bubble. */
export function isCardMessage(
  message: Pick<
    ChatMessage,
    "gameInvite" | "luckInvite" | "gameResult" | "expenseCard" | "settlementCard"
  >,
): boolean {
  return Boolean(
    message.gameInvite ||
    message.luckInvite ||
    message.gameResult ||
    message.expenseCard ||
    message.settlementCard,
  );
}
