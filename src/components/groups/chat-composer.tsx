"use client";

import { Send, X } from "lucide-react";
import { type KeyboardEvent, type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { findMentionQuery } from "@/lib/chat/rich-text";
import { cn } from "@/lib/utils";

export interface MentionCandidate {
  uid: string;
  displayName: string;
}

const MAX_SUGGESTIONS = 5;

/**
 * The chat's input: a growing textarea with a send button, the reply being
 * written, "@" suggestions for the members who can be mentioned, and — offline
 * — a visible reason the button is off. Shared by the chat screen and the chat
 * under a running match; the caller owns the text and what "send" does.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  online,
  error,
  reply,
  onCancelReply,
  mentionCandidates,
  textareaRef,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  online: boolean;
  error?: string | null;
  /** The message being answered; shown above the input with a way to drop it. */
  reply?: { name: string; text: string } | null;
  onCancelReply?: () => void;
  mentionCandidates: readonly MentionCandidate[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The smaller variant under a match: the textarea stops growing sooner. */
  compact?: boolean;
}) {
  const t = useT();
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  // The "@" whose suggestions were closed with Escape — they stay closed until
  // the caret is in another one.
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const pendingCaret = useRef<number | null>(null);

  const mention = findMentionQuery(value, caret);
  const suggestions =
    mention && mention.start !== dismissedAt
      ? mentionCandidates
          .filter((candidate) =>
            candidate.displayName.toLowerCase().startsWith(mention.query.toLowerCase()),
          )
          .slice(0, MAX_SUGGESTIONS)
      : [];
  const active = Math.min(highlight, suggestions.length - 1);

  // Grows the composer with its content instead of leaving typed text
  // scrolling inside a fixed one-line box (rows={1} alone doesn't resize).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    if (pendingCaret.current !== null) {
      el.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  }, [value, textareaRef]);

  function pick(candidate: MentionCandidate) {
    if (!mention) return;
    const inserted = `@${candidate.displayName} `;
    const next = value.slice(0, mention.start) + inserted + value.slice(caret);
    const position = mention.start + inserted.length;
    pendingCaret.current = position;
    setCaret(position);
    onChange(next);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((active + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[active]);
        return;
      }
      if (event.key === "Escape" && mention) {
        event.preventDefault();
        setDismissedAt(mention.start);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div>
      {!online && (
        <p className="text-muted-foreground mb-2 px-1 text-xs">{t("chat.offlineHint")}</p>
      )}
      {error && (
        <p role="alert" className="text-destructive mb-2 px-1 text-xs">
          {error}
        </p>
      )}
      {reply && (
        <div className="bg-muted/60 border-primary mb-2 flex items-start gap-2 rounded-xl border-l-2 py-1.5 pr-1.5 pl-3 text-xs">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{t("chat.replyingTo", { name: reply.name })}</span>
            <span className="text-muted-foreground line-clamp-1 break-words">{reply.text}</span>
          </div>
          <button
            type="button"
            aria-label={t("chat.cancelReply")}
            onClick={onCancelReply}
            className="text-muted-foreground hover:bg-accent shrink-0 rounded-full p-1.5"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label={t("chat.mentionList")}
          className="bg-card ring-foreground/10 shadow-e1 mb-2 overflow-hidden rounded-xl ring-1"
        >
          {suggestions.map((candidate, index) => (
            <li key={candidate.uid} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                // Keeps focus (and the keyboard) in the textarea.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(candidate)}
                className={cn(
                  "flex min-h-10 w-full items-center px-3 py-2 text-left text-sm",
                  index === active && "bg-muted",
                )}
              >
                @{candidate.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
        className="border-input bg-card/70 focus-within:border-ring focus-within:ring-ring/50 shadow-e1 flex items-end gap-1.5 rounded-3xl border p-1.5 pl-4 transition-colors focus-within:ring-3"
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            setHighlight(0);
            setCaret(event.target.selectionStart);
            // A closed list may open again for the next "@" typed.
            if (!findMentionQuery(event.target.value, event.target.selectionStart)) {
              setDismissedAt(null);
            }
            onChange(event.target.value);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
          placeholder={t("chat.placeholder")}
          enterKeyHint="send"
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          // text-base (16px) on mobile is load-bearing, not styling: iOS
          // Safari auto-zooms the whole page when a focused field is under
          // 16px, which shoves the send button off the right edge and
          // scrolls what you're typing out of view. Same md:text-sm
          // pattern as ui/input.tsx and ui/select.tsx.
          className={cn(
            "placeholder:text-muted-foreground min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base outline-none md:text-sm",
            compact ? "max-h-24" : "max-h-32",
          )}
        />
        <Button
          type="submit"
          size="icon"
          className="shrink-0 rounded-full"
          disabled={!value.trim() || !online}
          aria-label={t("chat.send")}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
