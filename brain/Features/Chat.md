---
tags: [feature, chat]
---

# Chat

Server Actions: `src/lib/actions/messages.ts`. UI: `chat-client.tsx`, `chat-entry-card.tsx`,
route `src/app/(app)/groups/[groupId]/chat/page.tsx`. Shared constant:
`src/lib/chat/constants.ts`.

## Scope: intentionally minimal (v1)

Per-group text chat, one flat collection (`groups/{groupId}/messages`). No attachments, no
edits, no reactions — the `ChatMessage` type comment in `src/lib/types.ts` says this
explicitly. If a task asks for message editing or attachments, that's new surface area, not a
bug fix.

## Message limits

`MAX_MESSAGE_LENGTH = 2000`, defined once in `src/lib/chat/constants.ts` and imported by
**both** `sendMessage` (server-side rejection — `"text-too-long"`) and the chat input
component (client-side limit) — the standard "define once, use in both places that need to
agree" pattern in this codebase (compare `src/lib/i18n/de.ts` as the single source for UI
strings).

## Ownership

`deleteMessage` requires `message.senderUid === session.uid` — **no manager override** here,
unlike expenses/settlements where `isGroupManager` can also edit/delete others' entries. A
group admin cannot delete someone else's chat message.

## Read receipts

`markChatRead` upserts `groups/{groupId}/chatReads/{session.uid}` = `{ lastReadAt }`. Because
the doc id **is** the uid (see [[Data Model]] and [[Firestore Rules]]), there's no id to pass
in — the action always targets exactly the caller's own receipt. The unread badge is driven by
comparing this against the newest message's `createdAt`; absent entirely counts as "never
read."

## Mobile layout dependency

The chat screen is the primary consumer of `useVisibleHeight` (see
[[Mobile iOS Quirks]]) — it's the one screen in the app that needs a fixed, viewport-pinned
frame with a composer parked at the bottom, which is exactly the case ordinary CSS can't
express correctly on iOS Safari.

## Related
[[Mobile iOS Quirks]] · [[Data Model]] · [[Firestore Rules]]
