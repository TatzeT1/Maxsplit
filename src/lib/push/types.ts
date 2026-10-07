import type { TranslationKey } from "@/lib/i18n/translate";

/** The things Split sends a push for — each one can be switched off in the profile. */
export const PUSH_EVENTS = ["expense", "settlement", "challenge", "turn", "chat"] as const;
export type PushEvent = (typeof PUSH_EVENTS)[number];

/** `users/{uid}.notificationPrefs`. Absent (or a field absent) means on. */
export type NotificationPrefs = Record<PushEvent, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  expense: true,
  settlement: true,
  challenge: true,
  turn: true,
  chat: true,
};

export function readNotificationPrefs(raw: unknown): NotificationPrefs {
  const stored = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    PUSH_EVENTS.map((event) => [event, stored[event] !== false]),
  ) as NotificationPrefs;
}

/**
 * A translated string, rendered only at delivery — in the language of the
 * device it goes to (each subscription stores its own). A var can itself be
 * translated, for names like a game's.
 */
export interface PushText {
  key: TranslationKey;
  vars?: Record<string, string | number | { key: TranslationKey }>;
}

/** One notification for one person, before it's rendered per device. */
export interface PendingPush {
  uid: string;
  /** "test" is the profile's test button — it ignores the preferences. */
  event: PushEvent | "test";
  title: PushText;
  /** Joined with " – " (e.g. what happened, then what it means for you). */
  body: PushText[];
  /** Where tapping it leads, same-origin. */
  url: string;
  /** Replaces an earlier notification with the same tag instead of piling up. */
  tag: string;
  /** How long a push service keeps trying a device that's off. */
  ttlSeconds: number;
  /** "Du bist dran" is pointless while the player is looking at the game. */
  unlessWatching?: { groupId: string; tournamentId: string };
  /** A chat push the recipient can silence per group (`users/{uid}.mutedChatGroupIds`) — left off for a mention, which breaks through. */
  unlessMuted?: { groupId: string };
}

/** `users/{uid}.mutedChatGroupIds`: the groups whose chat pushes this user silenced. Absent means none. */
export function readMutedChatGroupIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

/** What the service worker receives (public/sw.js). */
export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}
