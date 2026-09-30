/**
 * Pure Ballon ("pump until it bursts") rules for the luck mini-game. Players
 * sit in a fixed circle and take turns: on your turn you pump the balloon at
 * least once and at most three times, then hand the phone on. Nobody can see
 * how much air it takes — the burst point is drawn, secretly, when the
 * balloon is blown up for the first time — and whoever's pump makes it go off
 * pays. With more than one payer the popper drops out, a fresh balloon goes
 * to whoever sat behind them, and the game goes on until enough people paid.
 *
 * Like the slot machine this is a game of hidden odds rather than a fixed
 * result, so it does not sit on `useSequentialDraw`: the loser depends on how
 * bravely each person pumps, and only the burst point is random. Randomness
 * comes in through `BalloonRandom` so the whole module stays deterministic
 * and unit-testable; the dialog passes crypto-backed helpers (`random.ts`).
 */

export const BALLOON_MAX_PUMPS_PER_TURN = 3;

export interface BalloonRandom {
  /** A uniform integer in `[min, max]`, both ends included. */
  int(min: number, max: number): number;
  shuffle<T>(items: readonly T[]): T[];
}

export interface BalloonState {
  /** Everyone still in the game, in seating order. */
  seats: readonly string[];
  /** Whose turn it is: an index into `seats`. */
  turn: number;
  /** Pumps the current holder has made this turn. */
  turnPumps: number;
  /** Pumps on the balloon that is in the air. */
  pumps: number;
  /** Secret: the pump that bursts this balloon. Never shown — the screen only ever sees `maxPumps`. */
  burstAt: number;
  /** The most air this balloon could possibly have taken; what "full" looks like when scaling it on screen. */
  maxPumps: number;
  /** Who has paid so far, in the order their balloons went off. */
  losers: readonly string[];
  targetLoserCount: number;
}

/**
 * How many pumps a balloon shared by `seatCount` people can take. The floor
 * keeps it from going off before everyone has pumped at least once or twice;
 * the ceiling scales with the table so a big round is not endless.
 */
export function balloonBurstRange(seatCount: number): { min: number; max: number } {
  return { min: seatCount + 3, max: 10 + 4 * seatCount };
}

function freshBalloon(seatCount: number, random: BalloonRandom) {
  const range = balloonBurstRange(seatCount);
  return { burstAt: random.int(range.min, range.max), maxPumps: range.max };
}

/** At least one person has to stay dry: the most payers a pool of this size can have. */
export function maxBalloonLoserCount(poolSize: number): number {
  return Math.max(poolSize - 1, 1);
}

export function startBalloonGame(
  pool: readonly string[],
  targetLoserCount: number,
  random: BalloonRandom,
): BalloonState {
  if (pool.length < 2) throw new Error("A balloon needs at least two players");
  const target = Math.min(Math.max(targetLoserCount, 1), maxBalloonLoserCount(pool.length));
  return {
    seats: random.shuffle(pool),
    turn: 0,
    turnPumps: 0,
    pumps: 0,
    ...freshBalloon(pool.length, random),
    losers: [],
    targetLoserCount: target,
  };
}

export function isBalloonGameOver(state: BalloonState): boolean {
  return state.losers.length >= state.targetLoserCount;
}

export function balloonHolder(state: BalloonState): string {
  return state.seats[state.turn];
}

export function canPumpBalloon(state: BalloonState): boolean {
  return !isBalloonGameOver(state) && state.turnPumps < BALLOON_MAX_PUMPS_PER_TURN;
}

/** Nobody may hand the balloon on without having pumped it once. */
export function canPassBalloon(state: BalloonState): boolean {
  return !isBalloonGameOver(state) && state.turnPumps >= 1;
}

export interface BalloonPumpResult {
  state: BalloonState;
  /** The person whose pump just made the balloon go off, or `null`. */
  popped: string | null;
}

/** One pump by whoever holds the balloon, or `null` when they may not pump right now. */
export function pumpBalloon(state: BalloonState, random: BalloonRandom): BalloonPumpResult | null {
  if (!canPumpBalloon(state)) return null;
  const pumps = state.pumps + 1;
  const turnPumps = state.turnPumps + 1;
  if (pumps < state.burstAt) {
    return { state: { ...state, pumps, turnPumps }, popped: null };
  }

  const popper = balloonHolder(state);
  const seats = state.seats.filter((_, index) => index !== state.turn);
  const losers = [...state.losers, popper];
  if (losers.length >= state.targetLoserCount) {
    return { state: { ...state, seats, pumps, turnPumps, losers }, popped: popper };
  }
  // The next balloon goes to whoever sat behind the popper — which, with the
  // popper gone, is the seat their index now holds.
  return {
    state: {
      ...state,
      seats,
      turn: state.turn % seats.length,
      turnPumps: 0,
      pumps: 0,
      ...freshBalloon(seats.length, random),
      losers,
    },
    popped: popper,
  };
}

/** Hand the balloon to the next seat, or `null` when the holder has not pumped yet. */
export function passBalloon(state: BalloonState): BalloonState | null {
  if (!canPassBalloon(state)) return null;
  return { ...state, turn: (state.turn + 1) % state.seats.length, turnPumps: 0 };
}
