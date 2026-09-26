import { secureShuffle } from "@/lib/games/random";

/**
 * Pure Memory-Duell (concentration) rules: two people take turns flipping
 * two cards at a time; a match lets the same player claim the pair and go
 * again, a mismatch passes the turn. Nine pairs (18 cards) is deliberate —
 * an odd pair count makes an exact tie mathematically impossible, so the
 * match always has a clear winner without needing a draw/replay rule at all.
 */
export const MEMORY_PAIR_COUNT = 9;
export const MEMORY_CARD_COUNT = MEMORY_PAIR_COUNT * 2;

/** More than enough distinct faces that a shuffled deck rarely looks the same twice. */
export const MEMORY_FACES = [
  "🍕",
  "🍔",
  "🍟",
  "🌮",
  "🍩",
  "🍪",
  "🍦",
  "🍇",
  "🍓",
  "🍉",
  "🥐",
  "🧀",
] as const;

export interface MemoryCard {
  id: number;
  face: string;
  /** Which player claimed this card's pair, or `null` while still in play. */
  claimedBy: 0 | 1 | null;
}

/** Shuffled twice — once to pick which faces appear, once to scatter the resulting pairs — so neither the face selection nor the layout is predictable. */
export function buildMemoryDeck(pairCount: number = MEMORY_PAIR_COUNT): MemoryCard[] {
  const faces = secureShuffle([...MEMORY_FACES]).slice(0, pairCount);
  const pairedFaces = secureShuffle([...faces, ...faces]);
  return pairedFaces.map((face, id) => ({ id, face, claimedBy: null }));
}

/** `null` while the match is still undecided; `0 | 1` once a player has claimed more than half the pairs (the earliest point the outcome can't change). */
export function memoryOutcome(scores: readonly [number, number], pairCount: number): 0 | 1 | null {
  const majority = Math.floor(pairCount / 2) + 1;
  if (scores[0] >= majority) return 0;
  if (scores[1] >= majority) return 1;
  if (scores[0] + scores[1] >= pairCount) return scores[0] > scores[1] ? 0 : 1;
  return null;
}
