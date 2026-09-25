/**
 * Cryptographically random draw helpers shared by the split mini-games
 * (wheel, slot machine, scratch cards, and the original lottery) — a "who
 * pays" decision must not be predictable or replayable from a seeded PRNG,
 * so every draw goes through `crypto.getRandomValues` rather than `Math.random`.
 */

function randomBytes(length: number): Uint32Array {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Fisher-Yates shuffle of `items`, using crypto randomness so the order can't be predicted. */
export function secureShuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  if (shuffled.length < 2) return shuffled;
  const bytes = randomBytes(shuffled.length);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
