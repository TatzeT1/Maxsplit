/**
 * Per-device conveniences for the split games, keyed by group: who played
 * last and which games were picked last. Groups play in the same
 * constellation again and again ("we four, one pays"), so a game's setup
 * starts from the last one instead of from "everyone, one pays".
 *
 * `localStorage`, wrapped in try/catch: private mode or blocked storage
 * just means nothing is remembered. Never a source of truth — the remembered
 * pool is trimmed to the group's current members on every read.
 */

const SETUP_PREFIX = "split:game-setup:";
const RECENT_PREFIX = "split:recent-games:";

/** How many "Zuletzt gespielt" tiles the picker shows. */
export const RECENT_GAMES_MAX = 3;

export interface RememberedSetup {
  poolUids: string[];
  loserCount: number;
}

function readJson(key: string): unknown {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: nothing is remembered.
  }
}

/**
 * The pool and payer count last started in this group on this device,
 * trimmed to who is still a member (in the group's own order). `null` when
 * nothing is stored or fewer than two of those people are left.
 */
export function readRememberedSetup(
  groupId: string | undefined,
  memberUids: string[],
): RememberedSetup | null {
  if (!groupId) return null;
  const stored = readJson(SETUP_PREFIX + groupId);
  if (typeof stored !== "object" || stored === null) return null;
  const { poolUids, loserCount } = stored as Record<string, unknown>;
  if (!Array.isArray(poolUids)) return null;
  const pool = memberUids.filter((uid) => poolUids.includes(uid));
  if (pool.length < 2) return null;
  return {
    poolUids: pool,
    loserCount:
      typeof loserCount === "number" && Number.isInteger(loserCount) && loserCount >= 1
        ? loserCount
        : 1,
  };
}

/**
 * Remembers a setup the moment a game starts with it. A game without a payer
 * count (the slot machine) passes only the pool and keeps the stored count.
 */
export function rememberSetup(
  groupId: string | undefined,
  setup: { poolUids: string[]; loserCount?: number },
): void {
  if (!groupId) return;
  const previous = readJson(SETUP_PREFIX + groupId);
  const previousCount =
    typeof previous === "object" && previous !== null
      ? (previous as Record<string, unknown>).loserCount
      : undefined;
  writeJson(SETUP_PREFIX + groupId, {
    poolUids: setup.poolUids,
    loserCount: setup.loserCount ?? (typeof previousCount === "number" ? previousCount : 1),
  });
}

/** Games picked in this group on this device, most recent first. Unknown ids are the caller's to drop. */
export function readRecentGames(groupId: string | undefined): string[] {
  if (!groupId) return [];
  const stored = readJson(RECENT_PREFIX + groupId);
  return Array.isArray(stored)
    ? stored.filter((id): id is string => typeof id === "string").slice(0, RECENT_GAMES_MAX)
    : [];
}

export function recordRecentGame(groupId: string | undefined, gameId: string): void {
  if (!groupId) return;
  const recent = [gameId, ...readRecentGames(groupId).filter((id) => id !== gameId)];
  writeJson(RECENT_PREFIX + groupId, recent.slice(0, RECENT_GAMES_MAX));
}
