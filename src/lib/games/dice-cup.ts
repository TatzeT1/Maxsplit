/**
 * Pure Würfelbecher rules for the luck mini-game. Everyone shakes the cup
 * once and rolls two dice; the lowest roll pays. Rolls are ranked the way the
 * pub classic Mäxchen ranks them: the bigger die is read first (so 5 and 3 is
 * "53"), the Mäxchen (2 and 1, "21") beats everything, then come the Päsche
 * from 66 down to 11, then every other roll from 65 down to 31.
 *
 * When several people are level on the line between paying and not paying
 * they roll again — "Stechen" — and only they do. That repeats until the
 * line falls between two different rolls. Nobody is ever picked by tie-break
 * order or seating; every payer is decided by dice.
 *
 * Dice come in from the caller (crypto-backed in the dialog, see `random.ts`),
 * so this module stays deterministic and unit-testable.
 */

export type DicePair = readonly [number, number];
export type DiceKind = "maexchen" | "pasch" | "plain";

export function isDie(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function diceKind(pair: DicePair): DiceKind {
  const [a, b] = pair;
  if ((a === 2 && b === 1) || (a === 1 && b === 2)) return "maexchen";
  return a === b ? "pasch" : "plain";
}

/** The number read aloud: the bigger die first, so 5 and 3 is 53, a double six 66, the Mäxchen 21. */
export function diceNumber(pair: DicePair): number {
  const [a, b] = pair;
  return Math.max(a, b) * 10 + Math.min(a, b);
}

/** A strict ordering of rolls: higher is better. Level ranks are exactly the rolls the pub rules call equal. */
export function diceRank(pair: DicePair): number {
  const kind = diceKind(pair);
  if (kind === "maexchen") return 1000;
  if (kind === "pasch") return 100 + pair[0];
  return diceNumber(pair);
}

export interface DiceVerdict {
  /** Players who pay, for certain. */
  losers: string[];
  /** Players who are safe, for certain. */
  safe: string[];
  /** Players level on the line who must roll again; empty once everything is settled. */
  tied: string[];
  /** How many of `tied` will end up paying. */
  tiedSlots: number;
}

/** Who pays out of one round of rolls, when `slots` of these players must pay. */
export function resolveDiceRound(
  rolls: Readonly<Record<string, DicePair>>,
  slots: number,
): DiceVerdict {
  const uids = Object.keys(rolls);
  const sorted = [...uids].sort((a, b) => diceRank(rolls[a]) - diceRank(rolls[b]));
  const count = Math.min(Math.max(Math.trunc(slots), 0), uids.length);
  if (count === 0) return { losers: [], safe: sorted, tied: [], tiedSlots: 0 };
  if (count >= uids.length) return { losers: sorted, safe: [], tied: [], tiedSlots: 0 };

  // The roll of the last person who still has to pay. Everyone below it pays,
  // everyone above it is safe, and those exactly level with it are the question.
  const boundary = diceRank(rolls[sorted[count - 1]]);
  const below = sorted.filter((uid) => diceRank(rolls[uid]) < boundary);
  const level = sorted.filter((uid) => diceRank(rolls[uid]) === boundary);
  const above = sorted.filter((uid) => diceRank(rolls[uid]) > boundary);
  const levelSlots = count - below.length;
  if (levelSlots >= level.length) {
    return { losers: [...below, ...level], safe: above, tied: [], tiedSlots: 0 };
  }
  return { losers: below, safe: above, tied: level, tiedSlots: levelSlots };
}

export interface DiceRound {
  rolls: Record<string, DicePair>;
  /** Who had to roll again after this round, in roll order. Empty when it settled everything. */
  tied: string[];
}

export interface DiceGame {
  /** Everyone who still has to roll in the current round: the whole pool first, later only the people level on the line. */
  contenders: string[];
  /** How many of the contenders will end up paying. */
  slots: number;
  /** The current round's rolls so far. */
  rolls: Record<string, DicePair>;
  losers: string[];
  safe: string[];
  /** Finished rounds, for showing how it went. */
  rounds: DiceRound[];
}

/** At least one person has to stay dry. */
export function maxDiceLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

export function startDiceGame(pool: readonly string[], payers: number): DiceGame {
  const slots = Math.min(Math.max(Math.trunc(payers), 1), maxDiceLoserCount(pool.length));
  return { contenders: [...pool], slots, rolls: {}, losers: [], safe: [], rounds: [] };
}

export function isDiceGameOver(game: DiceGame): boolean {
  return game.contenders.length === 0;
}

/** The next person who has to shake the cup. */
export function nextRoller(game: DiceGame): string | null {
  return game.contenders.find((uid) => !(uid in game.rolls)) ?? null;
}

/**
 * Records `uid`'s roll. Once every contender has rolled the round is judged:
 * either everything is settled, or the people level on the line become the
 * next round's contenders. A roll from someone who is not up is ignored.
 */
export function recordDiceRoll(game: DiceGame, uid: string, pair: DicePair): DiceGame {
  if (!game.contenders.includes(uid) || uid in game.rolls) return game;
  const rolls = { ...game.rolls, [uid]: pair };
  if (Object.keys(rolls).length < game.contenders.length) return { ...game, rolls };

  const verdict = resolveDiceRound(rolls, game.slots);
  return {
    contenders: verdict.tied,
    slots: verdict.tiedSlots,
    rolls: {},
    losers: [...game.losers, ...verdict.losers],
    safe: [...game.safe, ...verdict.safe],
    rounds: [...game.rounds, { rolls, tied: verdict.tied }],
  };
}
