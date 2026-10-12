/** Shared between the sendMessage Server Action (server-side validation) and the chat UI (client-side input limit). */
export const MAX_MESSAGE_LENGTH = 2000;

/** How much of a quoted message a reply carries along. */
export const MAX_REPLY_PREVIEW_LENGTH = 140;

/**
 * The reactions a message can get — the ids are what's stored (`reactions.<id>`
 * on the message), the emoji only what's shown. A short fixed set keeps the
 * picker one row wide on a phone and the stored keys free of emoji.
 */
export const CHAT_REACTIONS = [
  { id: "up", emoji: "👍" },
  { id: "done", emoji: "✅" },
  { id: "heart", emoji: "❤️" },
  { id: "laugh", emoji: "😂" },
  { id: "wow", emoji: "😮" },
] as const;

export type ChatReactionId = (typeof CHAT_REACTIONS)[number]["id"];

export function isChatReactionId(value: unknown): value is ChatReactionId {
  return CHAT_REACTIONS.some((reaction) => reaction.id === value);
}

/**
 * A client-chosen message id (a UUID): sending with one makes a retry safe —
 * a request that reached the server but whose answer got lost can be sent
 * again without the message appearing twice.
 */
export const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{16,64}$/;

/** Any message id: Firestore's auto ids or a client-chosen one. */
export const MESSAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
