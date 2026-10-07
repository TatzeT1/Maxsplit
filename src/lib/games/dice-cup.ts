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

/** The latest roll of `uid` in this game: the current round's, else the most recent finished one. */
export function latestDiceRoll(game: DiceGame, uid: string): DicePair | null {
  const current = game.rolls[uid];
  if (current) return current;
  for (let index = game.rounds.length - 1; index >= 0; index--) {
    const past = game.rounds[index].rolls[uid];
    if (past) return past;
  }
  return null;
}

/*
 * The live standings: where everyone stands relative to the line between
 * paying and not, after every single roll — not only once a round is judged.
 * Pure presentation: it reads a `DiceGame` and never changes one, so it can't
 * move a payer; `resolveDiceRound` alone decides.
 *
 * The one fact everything below rests on: a player is safe at the end of a
 * round exactly when at least `slots` of the round's rolls are strictly
 * lower than theirs (see `resolveDiceRound`: fewer, and the line falls on or
 * above them). Later rolls only ever add to that count. So whoever is above
 * the line right now stays above it — being out of the zone is final the
 * moment it happens, which is why the dialog can tick them off at once.
 */

/** Where a player stands right now. */
export type DiceSeat =
  /** Pays for certain: settled in an earlier round, or nothing the rest of this round rolls can save them. */
  | "pays"
  /** Would pay if the round ended now. */
  | "zone"
  /** Level with others on the line: would roll off if the round ended now. */
  | "line"
  /** Safe for certain: settled, or already above the line (which is final, see above). */
  | "safe"
  /** Still to roll in this round. */
  | "waiting";

export interface DiceTarget {
  /** The roll on the line. The next roller has to beat it — by `diceRank`, so a Pasch beats 65 — to stay out. */
  pair: DicePair;
  /** Whose roll it is: one person, or several level on it. */
  holders: string[];
}

export interface DiceStanding {
  /**
   * Everyone, most at risk first: the payers and the current round's zone
   * (lowest roll first), then the "Zahlzone" line, then whoever is still to
   * roll (in roll order), then the safe — the current round's, then earlier
   * rounds' — each lowest roll first.
   */
  order: string[];
  seats: Record<string, DiceSeat>;
  /** How many of `order` sit above the line: they pay, or would if the round ended now. */
  zoneSize: number;
  /**
   * What the next roller has to beat. `null` when nobody is up, and while
   * the zone is still open — fewer rolls this round than places in it, so the
   * next roll lands in the zone whatever it is.
   */
  target: DiceTarget | null;
}

/** The live standings of `game` — see `DiceStanding`. */
export function diceStanding(game: DiceGame): DiceStanding {
  const seats: Record<string, DiceSeat> = {};
  const rank = (uid: string) => diceRank(game.rolls[uid]);
  const rolled = game.contenders
    .filter((uid) => uid in game.rolls)
    .sort((a, b) => rank(a) - rank(b));
  const waiting = game.contenders.filter((uid) => !(uid in game.rolls));

  // The round as if it ended now, with only the rolls made so far.
  const now = resolveDiceRound(
    Object.fromEntries(rolled.map((uid) => [uid, game.rolls[uid]])),
    game.slots,
  );
  for (const uid of now.tied) seats[uid] = "line";
  for (const uid of now.safe) seats[uid] = "safe";
  for (const uid of now.losers) {
    // Even if everyone still to roll came in at or below them, they'd still fit in the zone.
    const atOrBelow = rolled.filter((other) => rank(other) <= rank(uid)).length;
    seats[uid] = atOrBelow + waiting.length <= game.slots ? "pays" : "zone";
  }
  for (const uid of waiting) seats[uid] = "waiting";
  for (const uid of game.losers) seats[uid] = "pays";
  for (const uid of game.safe) seats[uid] = "safe";

  // Earlier rounds' safe players: the later they were settled, the closer
  // they came to the line, so the last round's go first. `game.safe` is
  // already lowest roll first within each round.
  const settledIn = (uid: string) => {
    for (let index = game.rounds.length - 1; index >= 0; index--) {
      if (uid in game.rounds[index].rolls) return index;
    }
    return -1;
  };
  const settledSafe = [...game.safe].sort((a, b) => settledIn(b) - settledIn(a));

  const atRisk = rolled.filter((uid) => seats[uid] !== "safe");
  const clear = rolled.filter((uid) => seats[uid] === "safe");

  let target: DiceTarget | null = null;
  if (waiting.length > 0 && rolled.length >= game.slots && game.slots > 0) {
    const boundary = rank(rolled[game.slots - 1]);
    const holders = rolled.filter((uid) => rank(uid) === boundary);
    target = { pair: game.rolls[holders[0]], holders };
  }

  return {
    order: [...game.losers, ...atRisk, ...waiting, ...clear, ...settledSafe],
    seats,
    zoneSize: game.losers.length + atRisk.length,
    target,
  };
}

/** Who a roll moved across the line. */
export interface DiceZoneChange {
  /** Now in the zone (or level on its line), and weren't before: the buzzer. */
  entered: string[];
  /** Were in the zone (or on its line), now safe for good: "Gerettet!". */
  saved: string[];
}

function inZone(seat: DiceSeat | undefined): boolean {
  return seat === "pays" || seat === "zone" || seat === "line";
}

/**
 * What changed between two standings, one roll apart. Someone level on the
 * line who has to roll off is neither: they go from the line to waiting for
 * the "Stechen", still in it.
 */
export function diceZoneChanges(before: DiceStanding, after: DiceStanding): DiceZoneChange {
  return {
    entered: after.order.filter((uid) => inZone(after.seats[uid]) && !inZone(before.seats[uid])),
    saved: after.order.filter((uid) => inZone(before.seats[uid]) && after.seats[uid] === "safe"),
  };
}
