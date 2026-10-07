---
tags: [feature, chat]
---

# Chat

Server Actions: `src/lib/actions/messages.ts` (`sendMessage`, `deleteMessage`, `markChatRead`,
`setChatReaction`) and `notifications.ts` (`setChatMuted`). UI: `chat-client.tsx` (the
screen), `chat-message.tsx` (bubble, actions, pending bubble, links), `chat-cards.tsx` (game
and bookkeeping cards), `chat-composer.tsx` (input, shared with `MatchChat`),
`chat-entry-card.tsx` (the card on the group page), route
`src/app/(app)/groups/[groupId]/chat/page.tsx`. Pure logic in `src/lib/chat/`: `constants.ts`,
`rich-text.ts`, `cards.ts`, `reactions.ts`, `game-result.ts`; hooks `use-chat-sender.ts`,
`use-chat-draft.ts`.

## Scope

Per-group chat, one flat collection (`groups/{groupId}/messages`): text with **reactions**,
a quoted **reply**, **@mentions**, tappable links, and automatic cards. Still **no
attachments and no editing** — the `ChatMessage` comment in `src/lib/types.ts` says so. If a
task asks for either, that's new surface area, not a bug fix (attachments would also need
Storage, which the app deliberately doesn't use — see [[Home]]).

Reactions, replies and mentions arrived on 2026-10-07 on the group's request; before that the
chat was "intentionally minimal (v1)". The reasoning is ADR-006 in `docs/DECISIONS.md`.

## Message limits and ids

`MAX_MESSAGE_LENGTH = 2000`, defined once in `src/lib/chat/constants.ts` and imported by
**both** `sendMessage` (server-side rejection — `"text-too-long"`) and the composer — the
standard "define once, use in both places that need to agree" pattern in this codebase.

`sendMessage` takes an optional **`clientId`** (a UUID the sender made up, `newClientMessageId`)
which becomes the document id and is written with `create()`. A retry of a request that did
go through (the answer got lost) hits `ALREADY_EXISTS`, finds the message is the caller's and
returns it — so **a retry can never double-post**, and no second push goes out. Someone else's
id is `invalid-id`.

## Sending feels instant (`useChatSender`)

The text leaves the composer at once and shows as a `PendingBubble` ("Wird gesendet …"). It
drops out of `pending` the moment the listener delivers a message with its id — also when the
action's answer was lost but the server wrote it. A failed send **stays**, marked "Nicht
gesendet", with "Erneut senden" (same `clientId`) and "Verwerfen"; the text is never lost and
a failure never looks like a slow send. Offline, the composer says why it can't send
("Du bist offline …") and keeps the text; the draft is also kept per group in `localStorage`
(`useChatDraft`, a convenience only).

## Reading: scroll, unread, older messages

- **Auto-scroll only follows you.** A new message scrolls the list only if you were at the
  bottom (`atBottomRef`, `BOTTOM_SLACK`) or it's yours; otherwise a pill "↓ N neue Nachrichten"
  appears. (Before 2026-10-07 every snapshot yanked you down.) The count comes from the
  snapshot callback comparing the newest message's id — a metadata-only snapshot
  (`includeMetadataChanges`) leaves it unchanged and counts nothing.
- **"Ungelesen" line.** `chatReads/{uid}` is read once when the chat opens and **frozen**
  (`openedReadAt`), so the line survives this visit marking the chat read. The chat opens on the
  first unread message, else the bottom; never when the chat was never read at all.
- **`markChatRead` once per newest message, and only while the page is visible**
  (`usePageVisible`). It used to fire on every snapshot and counted a message that arrived
  while the app was in the background as read. It also waits until `openedReadAt` is known.
- **"Ältere Nachrichten laden"**: 100 at a time (`limitToLast(limit)`). The reader's place is
  held by anchoring on the message that was at the top (its id and screen offset) and
  re-applying it after **every** snapshot until the server's one arrives — the local cache
  answers the new, larger query first, with only a message or two more, so restoring on the first
  length change (the first attempt) left the view at the oldest message. Done by hand because
  Safari has no CSS scroll anchoring; a touch or wheel gesture drops the anchor.

## What a message offers (`MessageBubble`)

A tap on a text bubble (or the `⋯` button, shown on hover/focus, and always on cards — they
have no bubble to tap) opens an **inline** action bar: five reactions, Antworten, Kopieren and,
on your own, Löschen. Inline, not a popup, on purpose: a portal-positioned menu is placed
against the layout viewport, which on iOS isn't what's visible while the keyboard is up
([[Mobile iOS Quirks]]). `cursor-pointer` on the bubble is what makes iOS deliver a tap on a
plain `<div>` as a click.

- **Reactions** (`CHAT_REACTIONS`: 👍 ✅ ❤️ 😂 😮): stored as `reactions: Record<reactionId,
uid[]>` on the message and set with `setChatReaction({ …, active })` — the end state, not a
  toggle, so a retry or double tap can't flip it. No push. A tap shows at once through
  overrides (`lib/chat/reactions.ts`) that are pruned when the listener agrees.
- **Replies**: `replyTo { id, senderUid, text }` is **copied by the server** from the quoted
  message (shortened to `MAX_REPLY_PREVIEW_LENGTH`) — never taken from the client — so it
  survives the original being deleted. A quote whose original is already gone is left off; the
  reply still goes out. Tapping a quote scrolls to the original if it's loaded.
- **Delete** stays owner-only (see below), now through `callAction` and disabled offline.
- Links: only `http(s)`/`www.` become `<a target="_blank" rel="noopener noreferrer">`
  (`tokenizeMessage`) — never `javascript:`.

## @mentions

The composer suggests members after an `@` (`findMentionQuery`, only members with an account,
not yourself); picking inserts `@Name `. The **server** works out who was mentioned from the
text (`findMentionedUids`: whole-word, case-insensitive, longest name wins — "@Max Mustermann"
is one mention) and stores `mentions: uid[]`; the chat highlights exactly those. A mentioned
member gets a "… hat dich erwähnt" push that **also reaches them when they muted the chat**.

## Muting (`setChatMuted`)

`users/{uid}.mutedChatGroupIds: string[]` (in `Session.mutedChatGroupIds`, handed to the chat by
its Server Component page as `initialMuted`). The bell in the chat header toggles it. A normal
chat push carries `unlessMuted: { groupId }` and `deliverPushes` skips it for a user who muted
that group; a mention push doesn't carry it. The global "Chat-Nachricht" switch in the profile
still wins over everything. Muting needs membership, un-muting doesn't.

## Cards (silent)

Automatic messages carry structure next to their fallback `text` (what previews show) and render
as cards: `gameInvite`, `luckInvite`, `gameResult` (see [[Split Games]]) and, since 2026-10-07,
**`expenseCard`** and **`settlementCard`** — written by `addExpense` / `recordSettlement` in the
**same batch** as the expense or payment (`lib/chat/cards.ts`). None of them ever triggers a chat
push of its own: the expense/payment push already reaches the people involved.

- A game-decided expense posts the game's result card **instead of** an expense card.
- Recurring (cron) bookings post no card.
- A card is a **record of that moment**: editing or deleting the expense later does not rewrite
  it. The expense card shows "Dein Anteil" from `shares`, so no listener per card is needed.
- `isSilentCard` (expense/payment cards) **never lights the unread dot**; `ChatEntryCard`
  therefore reads the last 12 messages instead of 5, and shows a card's text without the
  "Name:" prefix (it already names who did it).

## Ownership

`deleteMessage` requires `message.senderUid === session.uid` — **no manager override** here,
unlike expenses/settlements where `isGroupManager` can also edit/delete others' entries. A
group admin cannot delete someone else's chat message. Reactions are the caller's own, too:
`setChatReaction` only ever adds or removes the caller's uid.

## Read receipts

`markChatRead` upserts `groups/{groupId}/chatReads/{session.uid}` = `{ lastReadAt }`. Because
the doc id **is** the uid (see [[Data Model]] and [[Firestore Rules]]), there's no id to pass
in — the action always targets exactly the caller's own receipt. The unread badge is driven by
comparing this against the newest messages' `createdAt` — the last twelve, of which your own and
the silent cards never count (a game result your expense just posted mustn't light the dot for
you); absent entirely counts as "never read." Receipts stay private to their owner (rules), so
there is deliberately **no "gesehen von"** — that would need a rules change and a privacy
decision.

## Mobile layout dependency

The chat screen is the primary consumer of `useVisibleHeight` (see
[[Mobile iOS Quirks]]) — it's the one screen in the app that needs a fixed, viewport-pinned
frame with a composer parked at the bottom, which is exactly the case ordinary CSS can't
express correctly on iOS Safari. Everything new in the chat (pill, action bar, reply bar,
suggestions) lives **inside** that definite-height frame; none of it adds bottom padding.
`useVisibleHeight` also re-measures on `online`/`offline`: the offline banner appears above the
frame without any viewport event and used to push the composer below the fold.

## Testing

Unit: `rich-text.test.ts`, `cards.test.ts`, `reactions.test.ts`, `game-result.test.ts`,
`use-chat-sender.test.tsx`; components: `chat-composer.test.tsx`, `chat-message.test.tsx`;
emulator: `messages.emulator.test.ts` (idempotent send, quote, mentions, reactions, mute, cards)
and the mute case in `push.emulator.test.ts`. Checked 2026-10-07 in a real Chromium (mobile
emulation, 390×844) against the Auth + Firestore emulators with two accounts: unread line and
opening position, pill, load older (position kept), reactions, reply + mention + link, mute,
offline, a send whose request was dropped and its retry (one message on the server). **Not**
checked on a real iPhone — iOS keyboard behaviour with the new composer parts (suggestion
list, reply bar) is unverified.

## Related

[[Mobile iOS Quirks]] · [[Data Model]] · [[Firestore Rules]] · [[Push Notifications]] · [[Offline Mode]]
