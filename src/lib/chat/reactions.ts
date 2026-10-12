import { CHAT_REACTIONS } from "@/lib/chat/constants";
import type { ChatMessage } from "@/lib/types";

// A tap on a reaction shows at once and is confirmed by the listener later.
// Until it is, the screen holds an override — "I want reaction X on message Y
// to be on/off" — keyed `${messageId}:${reactionId}`, applied on top of what
// the listener last delivered and dropped as soon as the listener agrees (or
// the save failed).

export type ReactionOverrides = Record<string, boolean>;

export const overrideKey = (messageId: string, reactionId: string) => `${messageId}:${reactionId}`;

/** The message's reactions with the caller's own pending taps applied. */
export function applyReactionOverrides(
  message: Pick<ChatMessage, "id" | "reactions">,
  uid: string,
  overrides: ReactionOverrides,
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...message.reactions };
  for (const { id } of CHAT_REACTIONS) {
    const wanted = overrides[overrideKey(message.id, id)];
    if (wanted === undefined) continue;
    const others = (merged[id] ?? []).filter((reactor) => reactor !== uid);
    merged[id] = wanted ? [...others, uid] : others;
  }
  return merged;
}

/** Drops the overrides the listener has caught up with — and those of messages that are gone. */
export function pruneReactionOverrides(
  overrides: ReactionOverrides,
  messages: readonly Pick<ChatMessage, "id" | "reactions">[],
  uid: string,
): ReactionOverrides {
  const byId = new Map(messages.map((message) => [message.id, message]));
  const kept: ReactionOverrides = {};
  for (const [key, wanted] of Object.entries(overrides)) {
    const split = key.lastIndexOf(":");
    const message = byId.get(key.slice(0, split));
    const has = message?.reactions?.[key.slice(split + 1)]?.includes(uid) === true;
    if (message && has !== wanted) kept[key] = wanted;
  }
  return Object.keys(kept).length === Object.keys(overrides).length ? overrides : kept;
}
